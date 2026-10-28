import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import {
  decodePaymentResponseHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
  x402HTTPResourceServer,
  type HTTPRequestContext,
} from "@x402/core/http";
import type { Cradle } from "@fastify/awilix";
import {
  NETWORK,
  SCHEME,
  VaultServerScheme,
  paymentRequirements,
  readPaymentIntent,
  type QuoteDocument,
} from "@payvoke/shared/x402";
import { isPrivateServiceUrl, parseFinancialJson } from "@/core/runtime";
import type { FastifyReply, FastifyRequest } from "fastify";
import { getAddress } from "viem";
import { BadRequestError, ServiceUnavailableError } from "../../errors";

const PATH = "/v1/invocations";

function facilitatorClient(config: Cradle["config"]) {
  const url = new URL(config.FACILITATOR_URL!);
  // The facilitator is private: loopback, TLS, or a service name on the
  // deployment's internal network.
  if (!isPrivateServiceUrl(url) || url.search || Buffer.byteLength(config.FACILITATOR_TOKEN!) < 32)
    throw new Error("Invalid private facilitator configuration");
  return new HTTPFacilitatorClient({
    url: url.href.replace(/\/$/, ""),
    timeoutMs: 10000,
    createAuthHeaders: async () => {
      const auth = { Authorization: `Bearer ${config.FACILITATOR_TOKEN}` };
      return { supported: auth, verify: auth, settle: auth };
    },
  });
}

// x402 adapter for the paid invocation resource. Signing and broadcasting never
// happen in this process: settlement goes to the private facilitator, which only
// journals an intent for the separate settlement worker.
export class PaymentGateway {
  private readonly db: Cradle["db"];
  private readonly config: Cradle["config"];
  private readonly resource: string;
  readonly facilitator: HTTPFacilitatorClient | undefined;

  constructor({ db, config }: Cradle) {
    this.db = db;
    this.config = config;
    this.resource = new URL(PATH, config.API_ORIGIN).href;
    this.facilitator = config.PAYMENTS_ENABLED ? facilitatorClient(config) : undefined;
  }

  // Runs on app ready (asyncInit): refuse to serve payments against a
  // facilitator that does not settle this scheme for the configured vault.
  async verifyCapabilities() {
    if (!this.facilitator) return;
    const supported = await this.facilitator.getSupported();
    if (
      !supported.kinds.some(
        (k) =>
          k.x402Version === 2 &&
          k.scheme === SCHEME &&
          k.network === NETWORK &&
          k.extra?.schemeVersion === "1" &&
          typeof k.extra.vault === "string" &&
          getAddress(k.extra.vault) === getAddress(this.config.VAULT_ADDRESS!),
      ) ||
      !supported.signers["eip155:*"]?.length
    )
      throw new Error("Private facilitator capability mismatch");
  }

  // The 402 challenge for an unpaid submission.
  async challenge(quote: QuoteDocument, reply: FastifyReply) {
    const core = new x402ResourceServer().register(NETWORK, new VaultServerScheme(quote));
    // `method` is not part of core's ResourceInfo type but is kept on the wire.
    const resource = {
      url: this.resource,
      method: "POST",
      description: "Payvoke invocation",
      mimeType: "application/json",
    };
    const required = await core.createPaymentRequiredResponse(
      [paymentRequirements(quote)],
      resource,
    );
    return reply
      .code(402)
      .header("PAYMENT-REQUIRED", encodePaymentRequiredHeader(required))
      .send(required);
  }

  // Headers are written to the reply as soon as they are known: a buyer must
  // keep the receipt for held funds even if a later consistency check fails.
  async settle(quote: QuoteDocument, request: FastifyRequest, reply: FastifyReply) {
    if (!this.facilitator) throw new ServiceUnavailableError("SETTLEMENT_NOT_AVAILABLE");
    const header = request.headers["payment-signature"];
    if (typeof header !== "string" || header.length > 16384)
      throw new BadRequestError("INVALID_PAYMENT");
    try {
      const payload = parseFinancialJson(Buffer.from(header, "base64").toString("utf8"));
      await readPaymentIntent(quote, payload, this.resource);
    } catch {
      throw new BadRequestError("INVALID_PAYMENT");
    }
    const core = new x402ResourceServer(this.facilitator).register(
      NETWORK,
      new VaultServerScheme(quote),
    );
    const expected = paymentRequirements(quote);
    const http = new x402HTTPResourceServer(core, {
      [`POST ${PATH}`]: {
        accepts: {
          scheme: expected.scheme,
          network: expected.network,
          payTo: expected.payTo,
          price: { amount: expected.amount, asset: expected.asset },
          maxTimeoutSeconds: expected.maxTimeoutSeconds,
          extra: expected.extra,
        },
        resource: this.resource,
        description: "Payvoke invocation",
        mimeType: "application/json",
      },
    });
    await http.initialize();
    const context: HTTPRequestContext = {
      method: "POST",
      path: PATH,
      paymentHeader: header,
      adapter: {
        getHeader: (name) => {
          const value = request.headers[name.toLowerCase()];
          return typeof value === "string" ? value : undefined;
        },
        getMethod: () => "POST",
        getPath: () => PATH,
        getUrl: () => this.resource,
        getAcceptHeader: () => "application/json",
        getUserAgent: () => "",
        getBody: () => request.body,
      },
    };
    reply.header("Location", `${PATH}/${encodeURIComponent(quote.invocationId)}`);
    const result = await http.processHTTPRequest(context);
    if (result.type === "payment-error") {
      const encoded = Object.entries(result.response.headers).find(
        ([key]) => key.toLowerCase() === "payment-response",
      )?.[1];
      return this.unsettled(quote, encoded, reply);
    }
    if (result.type !== "payment-verified" || !result.beforeHandlerSettlement?.result.success)
      throw new ServiceUnavailableError("SETTLEMENT_NOT_FINALIZED");
    // Preserve the upfront receipt, without a second settle call.
    const echo = await http.processSettlement(
      result.paymentPayload,
      result.paymentRequirements,
      result.declaredExtensions,
      { request: context },
      undefined,
      result.beforeHandlerSettlement,
    );
    reply.headers(echo.headers);
    const operation = await this.db.settlementOperation.findUnique({
      where: { invocationId: quote.invocationId },
      include: { attempt: true, invocation: true },
    });
    if (operation?.state !== "HELD" || operation.attempt?.state !== "FINALIZED")
      throw new ServiceUnavailableError("SETTLEMENT_RECOVERY_REQUIRED");
    return reply.code(202).send({
      invocationId: quote.invocationId,
      paymentStatus: "HELD",
      executionStatus: operation.invocation.executionStatus,
      nextActions: ["poll"],
    });
  }

  // A facilitator payment error. The durable journal, not the SDK response,
  // decides what the buyer is told.
  private async unsettled(quote: QuoteDocument, encoded: string | undefined, reply: FastifyReply) {
    const operation = await this.db.settlementOperation.findUnique({
      where: { invocationId: quote.invocationId },
      include: { attempt: true },
    });
    // Core turns untyped transport failures into receipts with transaction="".
    // Never forward those synthetic receipts or exception messages to a buyer.
    if (encoded && operation?.state === "PENDING" && operation.attempt?.transactionHash) {
      try {
        const receipt = decodePaymentResponseHeader(encoded);
        if (
          !receipt.success &&
          receipt.errorReason === "settlement_pending" &&
          receipt.network === NETWORK &&
          receipt.transaction === operation.attempt.transactionHash &&
          ["BROADCAST", "UNKNOWN", "CONFIRMED"].includes(operation.attempt.state)
        ) {
          reply.header("PAYMENT-RESPONSE", encoded).header("Retry-After", "5");
          return reply.code(402).send({
            invocationId: quote.invocationId,
            paymentStatus: "PENDING",
            nextActions: ["poll"],
          });
        }
      } catch {
        /* No trusted receipt; status polling remains authoritative. */
      }
    }
    if (operation?.state === "HELD" && operation.attempt?.state === "FINALIZED") {
      reply.header(
        "PAYMENT-RESPONSE",
        encodePaymentResponseHeader({
          success: true,
          transaction: operation.attempt.transactionHash!,
          network: NETWORK,
          payer: quote.protocolQuote.buyer,
          amount: quote.grossAmount,
          extra: {
            schemeVersion: "1",
            invocationId: quote.invocationId,
            quoteId: quote.quoteId,
            holdId: operation.invocationKey,
          },
        }),
      );
    }
    const rejected = operation?.state === "REJECTED";
    reply.header("Retry-After", "5");
    return reply.code(rejected ? 422 : 503).send({
      invocationId: quote.invocationId,
      paymentStatus: operation?.state ?? "UNKNOWN",
      error: rejected ? operation?.errorReason : "settlement_unavailable",
      nextActions: rejected || operation?.state === "QUARANTINED" ? ["contact_support"] : ["poll"],
    });
  }
}
