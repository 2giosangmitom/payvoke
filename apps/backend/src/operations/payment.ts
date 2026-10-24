import { x402Client } from "@x402/core/client";
import { decodePaymentRequiredHeader, encodePaymentSignatureHeader } from "@x402/core/http";
import {
  NETWORK,
  VaultClientScheme,
  readPaymentIntent,
  readQuote,
  validateQuoteDocument,
  type QuoteDocument,
} from "@payvoke/x402";
import { reserveHoldAbi } from "@payvoke/protocol";
import { SettlementChain } from "@payvoke/x402/settlement";
import { createSiweMessage } from "viem/siwe";
import {
  encodeFunctionData,
  getAddress,
  type Address,
  type Hex,
  type LocalAccount,
  type PublicClient,
} from "viem";
import { deployment, integer, preflight, saveExclusive, type Ceremony } from "./fuji";

export type PaymentRun = {
  apiOrigin: string;
  webOrigin: string;
  vault: Address;
  buyer: Address;
  threadId: string;
  commandId: string;
  clientRequestId: string;
  arguments: Record<string, unknown>;
  grantId: Hex;
  grantEpoch: string;
  maxAmount: string;
};
export type PreparedPayment = { run: PaymentRun; quote: QuoteDocument; paymentPayload: unknown };
export function trustedOrigin(value: string) {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
  )
    throw new Error("Expected HTTPS or loopback origin");
  return url.origin;
}
// Minimal browser binding for a controlled CLI. Never emit session/nonce cookies.
export async function paymentSession(run: PaymentRun, buyer: LocalAccount) {
  const api = trustedOrigin(run.apiOrigin),
    web = trustedOrigin(run.webOrigin);
  if (getAddress(run.buyer) !== getAddress(buyer.address)) throw new Error("Wrong buyer signer");
  const cookies = new Map<string, string>();
  async function request(path: string, body?: unknown, extra: Record<string, string> = {}) {
    if (!path.startsWith("/v1/") || path.includes("?") || path.includes("#"))
      throw new Error("Invalid API path");
    const response = await fetch(`${api}${path}`, {
      method: body === undefined ? "GET" : "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        origin: web,
        "content-type": "application/json",
        cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const value of response.headers.getSetCookie()) {
      const pair = value.split(";", 1)[0],
        at = pair.indexOf("=");
      if (at > 0) cookies.set(pair.slice(0, at), pair.slice(at + 1));
    }
    return response;
  }
  const nonce = await request("/v1/auth/siwe/nonce", {});
  if (!nonce.ok) throw new Error("SIWE nonce failed");
  const issuedAt = new Date();
  const message = createSiweMessage({
    address: buyer.address,
    chainId: 43113,
    domain: new URL(web).host,
    uri: web,
    version: "1",
    nonce: (await nonce.json()).nonce,
    issuedAt,
    expirationTime: new Date(issuedAt.getTime() + 300000),
  });
  const login = await request("/v1/auth/siwe/verify", {
    message,
    signature: await buyer.signMessage({ message }),
  });
  if (!login.ok) throw new Error("SIWE login failed");
  // Consume the response without retaining Better Auth's token-bearing body.
  await login.arrayBuffer();
  return {
    request,
    async close() {
      try {
        await request("/v1/auth/sign-out", {});
      } finally {
        cookies.clear();
      }
    },
  };
}
export async function preparePayment(
  session: Awaited<ReturnType<typeof paymentSession>>,
  run: PaymentRun,
  signer: LocalAccount,
  path: string,
) {
  const response = await session.request(
    "/v1/quotes",
    {
      threadId: run.threadId,
      commandId: run.commandId,
      arguments: run.arguments,
      clientRequestId: run.clientRequestId,
      contextSelection: { messageIds: [], briefVersionId: null, fileIds: [] },
    },
    { "idempotency-key": run.clientRequestId },
  );
  if (!response.ok) throw new Error("Quote preparation failed");
  const quote = (await response.json()) as QuoteDocument;
  validateQuoteDocument(quote, getAddress(run.vault), getAddress(run.buyer));
  const challenge = await session.request(
    "/v1/invocations",
    { quoteId: quote.quoteId },
    { "idempotency-key": quote.invocationId },
  );
  const header = challenge.headers.get("payment-required");
  if (challenge.status !== 402 || !header) throw new Error("Expected x402 payment challenge");
  const client = new VaultClientScheme({
    document: quote,
    buyer: getAddress(run.buyer),
    vault: getAddress(run.vault),
    resourceUrl: `${trustedOrigin(run.apiOrigin)}/v1/invocations`,
    signer,
    grantId: run.grantId,
    grantEpoch: integer(run.grantEpoch),
    maxAmount: integer(run.maxAmount),
    persist: async () => {},
  });
  const paymentPayload = await new x402Client()
    .register(NETWORK, client)
    .createPaymentPayload(decodePaymentRequiredHeader(header));
  const prepared = JSON.parse(JSON.stringify({ run, quote, paymentPayload })) as PreparedPayment;
  await saveExclusive(path, prepared);
  const intent = await readPaymentIntent(
    quote,
    prepared.paymentPayload,
    `${trustedOrigin(run.apiOrigin)}/v1/invocations`,
  );
  return {
    invocationId: quote.invocationId,
    quoteId: quote.quoteId,
    grossAmount: quote.grossAmount,
    authorizationDigest: intent.authorizationDigest,
    holdId: quote.protocolQuote.invocationKey,
    resolveBy: quote.resolveBy,
  };
}
export async function submitPayment(
  session: Awaited<ReturnType<typeof paymentSession>>,
  prepared: PreparedPayment,
  approvedDigest: string,
) {
  const { run, quote, paymentPayload } = prepared;
  validateQuoteDocument(quote, getAddress(run.vault), getAddress(run.buyer));
  const intent = await readPaymentIntent(
    quote,
    paymentPayload,
    `${trustedOrigin(run.apiOrigin)}/v1/invocations`,
  );
  if (
    intent.authorizationDigest !== approvedDigest ||
    BigInt(quote.grossAmount) > integer(run.maxAmount)
  )
    throw new Error("Approve exact authorization digest within spend cap");
  const response = await session.request(
    "/v1/invocations",
    { quoteId: quote.quoteId },
    {
      "idempotency-key": quote.invocationId,
      "payment-signature": encodePaymentSignatureHeader(intent.paymentPayload),
    },
  );
  // Do not echo arbitrary HTTP errors or headers: they may contain auth material.
  return {
    status: response.status,
    invocationId: quote.invocationId,
    paymentResponse: response.headers.get("payment-response"),
  };
}
export async function pollPayment(
  session: Awaited<ReturnType<typeof paymentSession>>,
  prepared: PreparedPayment,
) {
  const { run, quote } = prepared;
  validateQuoteDocument(quote, getAddress(run.vault), getAddress(run.buyer));
  const response = await session.request(
    `/v1/invocations/${encodeURIComponent(quote.invocationId)}`,
  );
  if (!response.ok) throw new Error("Invocation polling failed");
  const status = await response.json();
  return {
    invocationId: quote.invocationId,
    paymentStatus: status.paymentStatus,
    executionStatus: status.executionStatus,
    transaction: status.transaction,
    receipt: status.receipt,
    failure: status.failure,
    nextActions: status.nextActions,
  };
}

export async function verifyPayment(
  client: PublicClient,
  ceremony: Ceremony,
  prepared: PreparedPayment,
  hash: Hex,
) {
  await preflight(client, ceremony);
  if (
    getAddress(prepared.run.vault) !== getAddress(ceremony.vault!) ||
    getAddress(prepared.run.buyer) !== getAddress(ceremony.buyer)
  )
    throw new Error("Payment ceremony mismatch");
  validateQuoteDocument(prepared.quote, getAddress(ceremony.vault!), getAddress(ceremony.buyer));
  const intent = await readPaymentIntent(
    prepared.quote,
    prepared.paymentPayload,
    `${trustedOrigin(prepared.run.apiOrigin)}/v1/invocations`,
  );
  if (getAddress(intent.recoveredSigner) !== getAddress(ceremony.grantSigner))
    throw new Error("Unexpected grant signer");
  const quote = readQuote(prepared.quote.protocolQuote);
  const tx = await client.getTransaction({ hash });
  const observation = await new SettlementChain(client, deployment(ceremony)).inspect({
    hash,
    nonce: BigInt(tx.nonce),
    quote,
    authorization: intent.authorization,
    authorizationDigest: intent.authorizationDigest,
    data: encodeFunctionData({
      abi: reserveHoldAbi,
      functionName: "reserveHold",
      args: [quote, intent.authorization, intent.signature],
    }),
  });
  if (observation.kind !== "finalized") throw new Error("Payment not finalized");
  return {
    invocationId: prepared.quote.invocationId,
    holdId: quote.invocationKey,
    authorizationDigest: intent.authorizationDigest,
    ...observation.proof,
  };
}
