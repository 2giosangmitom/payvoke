import { x402ResourceServer } from "@x402/core/server";
import {
  decodePaymentResponseHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
  x402HTTPResourceServer,
  type HTTPRequestContext,
} from "@x402/core/http";
import type { Cradle } from "../../container";
import {
  NETWORK,
  SCHEME,
  SCHEME_VERSION,
  VaultServerScheme,
  paymentRequirements,
  readPaymentIntent,
  type QuoteDocument,
} from "@payvoke/shared/x402";
import type { Context } from "hono";
import { parseFinancialJson } from "#core/runtime";
import type { Facilitator } from "#core/facilitator";
import { getAddress } from "viem";
import { BadRequestError, ServiceUnavailableError } from "../../errors";
import { logger } from "../../logging";

const log = logger("payments", "gateway");

const PATH = "/v1/invocations";

// x402 adapter for the paid invocation resource. Settlement goes to the
// in-process facilitator, which only journals an intent; the settlement worker
// signs and broadcasts it.
export class PaymentGateway {
  private readonly db: Cradle["db"];
  private readonly config: Cradle["config"];
  private readonly resource: string;
  readonly facilitator: Facilitator | null;

  constructor({ db, config, facilitator }: Cradle) {
    this.db = db;
    this.config = config;
    this.resource = new URL(PATH, config.API_ORIGIN).href;
    this.facilitator = facilitator;
  }

  // Runs when the app starts: refuse to serve payments against a facilitator
  // that does not settle this scheme for the configured vault.
  async verifyCapabilities() {
    if (!this.facilitator) return;
    await this.facilitator.ready();
    const supported = await this.facilitator.getSupported();
    if (
      !supported.kinds.some(
        (k) =>
          k.x402Version === 2 &&
          k.scheme === SCHEME &&
          k.network === NETWORK &&
          k.extra?.schemeVersion === SCHEME_VERSION &&
          typeof k.extra.vault === "string" &&
          getAddress(k.extra.vault) === getAddress(this.config.VAULT_ADDRESS!),
      ) ||
      !supported.signers["eip155:*"]?.length
    )
      throw new Error("Facilitator capability mismatch");
  }

  // The 402 challenge for an unpaid submission.
  async challenge(quote: QuoteDocument, c: Context) {
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
    c.header("PAYMENT-REQUIRED", encodePaymentRequiredHeader(required));
    return c.json(required, 402);
  }

  // Headers are written to the reply as soon as they are known: a buyer must
  // keep the receipt for held funds even if a later consistency check fails.
  async settle(quote: QuoteDocument, c: Context, body: unknown) {
    if (!this.facilitator) throw new ServiceUnavailableError("SETTLEMENT_NOT_AVAILABLE");
    const header = c.req.header("payment-signature");
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
          return c.req.header(name);
        },
        getMethod: () => "POST",
        getPath: () => PATH,
        getUrl: () => this.resource,
        getAcceptHeader: () => "application/json",
        getUserAgent: () => "",
        getBody: () => body,
      },
    };
    c.header("Location", `${PATH}/${encodeURIComponent(quote.invocationId)}`);
    const result = await http.processHTTPRequest(context);
    if (result.type === "payment-error") {
      const encoded = Object.entries(result.response.headers).find(
        ([key]) => key.toLowerCase() === "payment-response",
      )?.[1];
      return this.unsettled(quote, encoded, c, result.response.body);
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
    for (const [name, value] of Object.entries(echo.headers)) c.header(name, value);
    const operation = await this.db.settlementOperation.findUnique({
      where: { invocationId: quote.invocationId },
      include: { attempt: true, invocation: true },
    });
    if (operation?.state !== "HELD" || operation.attempt?.state !== "FINALIZED")
      throw new ServiceUnavailableError("SETTLEMENT_RECOVERY_REQUIRED");
    return c.json(
      {
        invocationId: quote.invocationId,
        paymentStatus: "HELD",
        executionStatus: operation.invocation.executionStatus,
        nextActions: ["poll"],
      },
      202,
    );
  }

  // A facilitator payment error. The durable journal, not the SDK response,
  // decides what the buyer is told.
  private async unsettled(
    quote: QuoteDocument,
    encoded: string | undefined,
    c: Context,
    body: unknown,
  ) {
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
          c.header("PAYMENT-RESPONSE", encoded);
          c.header("Retry-After", "5");
          return c.json(
            { invocationId: quote.invocationId, paymentStatus: "PENDING", nextActions: ["poll"] },
            402,
          );
        }
      } catch {
        /* No trusted receipt; status polling remains authoritative. */
      }
    }
    if (operation?.state === "HELD" && operation.attempt?.state === "FINALIZED") {
      c.header(
        "PAYMENT-RESPONSE",
        encodePaymentResponseHeader({
          success: true,
          transaction: operation.attempt.transactionHash!,
          network: NETWORK,
          payer: quote.protocolQuote.buyer,
          amount: quote.grossAmount,
          extra: {
            schemeVersion: SCHEME_VERSION,
            fundingMode: operation.fundingMode === "AUTHORIZATION" ? "authorization" : "grant",
            invocationId: quote.invocationId,
            quoteId: quote.quoteId,
            holdId: operation.invocationKey,
          },
        }),
      );
    }
    // Nothing journaled: the facilitator refused before recording an intent.
    // Its reason (a vault code such as grant_exhausted or quote_expired) is
    // what the buyer needs; exception text is never forwarded.
    if (!operation) {
      const verifyReason = facilitatorCode(
        body && typeof body === "object" ? (body as { error?: unknown }).error : undefined,
      );
      let settleReason: string | undefined;
      try {
        if (encoded)
          settleReason = facilitatorCode(decodePaymentResponseHeader(encoded).errorReason);
      } catch {
        /* No readable receipt. */
      }
      log.warn("Payment refused before settlement ({invocationId}): {reason}", {
        invocationId: quote.invocationId,
        reason: verifyReason ?? settleReason ?? "unknown",
      });
      // A verify refusal will not pass on retry; a settle refusal may be transient.
      if (verifyReason && !encoded)
        return c.json(
          {
            invocationId: quote.invocationId,
            paymentStatus: "UNKNOWN",
            error: verifyReason,
            nextActions: [],
          },
          402,
        );
      c.header("Retry-After", "5");
      return c.json(
        {
          invocationId: quote.invocationId,
          paymentStatus: "UNKNOWN",
          error: settleReason ?? "settlement_unavailable",
          nextActions: ["poll"],
        },
        503,
      );
    }
    const rejected = operation?.state === "REJECTED";
    // PENDING is the normal first answer: the authorization is journaled and
    // the worker is putting the hold on chain. Tell the client to poll, not
    // that settlement is down.
    const pending = operation?.state === "PENDING";
    c.header("Retry-After", "5");
    return c.json(
      {
        invocationId: quote.invocationId,
        paymentStatus: operation?.state ?? "UNKNOWN",
        error: rejected
          ? operation?.errorReason
          : pending
            ? "settlement_pending"
            : "settlement_unavailable",
        nextActions:
          rejected || operation?.state === "QUARANTINED" ? ["contact_support"] : ["poll"],
      },
      rejected ? 422 : 503,
    );
  }
}

// Facilitator reasons are snake_case codes; anything else is an exception
// message or core's prose and stays server-side.
const facilitatorCode = (value: unknown) =>
  typeof value === "string" && /^[a-z][a-z0-9_]{2,63}$/.test(value) ? value : undefined;
