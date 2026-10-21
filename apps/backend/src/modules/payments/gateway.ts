import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import {
  decodePaymentResponseHeader,
  encodePaymentResponseHeader,
  x402HTTPResourceServer,
  type HTTPRequestContext,
} from "@x402/core/http";
import {
  NETWORK,
  SCHEME,
  VaultServerScheme,
  paymentRequirements,
  readPaymentIntent,
  type QuoteDocument,
} from "@payvoke/x402";
import { getAddress } from "viem";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Config } from "../../config";
import type { PrismaClient } from "../../generated/prisma/client";
import { parseFinancialJson } from "../../http/json";

export function gatewayFacilitator(app: FastifyInstance, config: Config) {
  if (!config.PAYMENTS_ENABLED) return undefined;
  const url = new URL(config.FACILITATOR_URL!);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) ||
    Buffer.byteLength(config.FACILITATOR_TOKEN!) < 32
  )
    throw new Error("Invalid private facilitator configuration");
  const client = new HTTPFacilitatorClient({
    url: url.href.replace(/\/$/, ""),
    timeoutMs: 10000,
    createAuthHeaders: async () => {
      const auth = { Authorization: `Bearer ${config.FACILITATOR_TOKEN}` };
      return { supported: auth, verify: auth, settle: auth };
    },
  });
  app.addHook("onReady", async () => {
    const supported = await client.getSupported();
    if (
      !supported.kinds.some(
        (k) =>
          k.x402Version === 2 &&
          k.scheme === SCHEME &&
          k.network === NETWORK &&
          k.extra?.schemeVersion === "1" &&
          typeof k.extra.vault === "string" &&
          getAddress(k.extra.vault) === getAddress(config.VAULT_ADDRESS!),
      ) ||
      !supported.signers["eip155:*"]?.length
    )
      throw new Error("Private facilitator capability mismatch");
  });
  return client;
}

export async function settleGateway(
  app: FastifyInstance,
  db: PrismaClient,
  config: Config,
  facilitator: HTTPFacilitatorClient,
  quote: QuoteDocument,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const header = request.headers["payment-signature"];
  if (typeof header !== "string" || header.length > 16384)
    throw app.httpErrors.badRequest("INVALID_PAYMENT");
  try {
    const payload = parseFinancialJson(Buffer.from(header, "base64").toString("utf8"));
    await readPaymentIntent(quote, payload, new URL("/v1/invocations", config.API_ORIGIN).href);
  } catch {
    throw app.httpErrors.badRequest("INVALID_PAYMENT");
  }
  const core = new x402ResourceServer(facilitator).register(NETWORK, new VaultServerScheme(quote));
  const expected = paymentRequirements(quote);
  const http = new x402HTTPResourceServer(core, {
    "POST /v1/invocations": {
      accepts: {
        scheme: expected.scheme,
        network: expected.network,
        payTo: expected.payTo,
        price: { amount: expected.amount, asset: expected.asset },
        maxTimeoutSeconds: expected.maxTimeoutSeconds,
        extra: expected.extra,
      },
      resource: new URL("/v1/invocations", config.API_ORIGIN).href,
      description: "Payvoke invocation",
      mimeType: "application/json",
    },
  });
  await http.initialize();
  const context: HTTPRequestContext = {
    method: "POST",
    path: "/v1/invocations",
    paymentHeader: header,
    adapter: {
      getHeader: (name) => {
        const h = request.headers[name.toLowerCase()];
        return typeof h === "string" ? h : undefined;
      },
      getMethod: () => "POST",
      getPath: () => "/v1/invocations",
      getUrl: () => new URL("/v1/invocations", config.API_ORIGIN).href,
      getAcceptHeader: () => "application/json",
      getUserAgent: () => "",
      getBody: () => request.body,
    },
  };
  const location = `/v1/invocations/${encodeURIComponent(quote.invocationId)}`;
  reply.header("Location", location);
  const result = await http.processHTTPRequest(context);
  if (result.type === "payment-error") {
    const operation = await db.settlementOperation.findUnique({
      where: { invocationId: quote.invocationId },
      include: { attempt: true },
    });
    // Core turns untyped transport failures into receipts with transaction="".
    // Never forward those synthetic receipts or exception messages to a buyer.
    const encoded = Object.entries(result.response.headers).find(
      ([key]) => key.toLowerCase() === "payment-response",
    )?.[1];
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
    reply.header("Retry-After", "5");
    return reply.code(operation?.state === "REJECTED" ? 422 : 503).send({
      invocationId: quote.invocationId,
      paymentStatus: operation?.state ?? "UNKNOWN",
      error: operation?.state === "REJECTED" ? operation.errorReason : "settlement_unavailable",
      nextActions:
        operation?.state === "REJECTED" || operation?.state === "QUARANTINED"
          ? ["contact_support"]
          : ["poll"],
    });
  }
  if (result.type !== "payment-verified" || !result.beforeHandlerSettlement?.result.success)
    throw app.httpErrors.serviceUnavailable("SETTLEMENT_NOT_FINALIZED");
  // Preserve the upfront receipt, without a second settle call. Even if a local
  // consistency error follows, the buyer must not lose proof of held funds.
  const echo = await http.processSettlement(
    result.paymentPayload,
    result.paymentRequirements,
    result.declaredExtensions,
    { request: context },
    undefined,
    result.beforeHandlerSettlement,
  );
  reply.headers(echo.headers);
  const operation = await db.settlementOperation.findUnique({
    where: { invocationId: quote.invocationId },
    include: { attempt: true, invocation: true },
  });
  if (operation?.state !== "HELD" || operation.attempt?.state !== "FINALIZED")
    throw app.httpErrors.serviceUnavailable("SETTLEMENT_RECOVERY_REQUIRED");
  return reply.code(202).send({
    invocationId: quote.invocationId,
    paymentStatus: "HELD",
    executionStatus: operation.invocation.executionStatus,
    nextActions: ["poll"],
  });
}
