import { x402Client, x402HTTPClient } from "@x402/core/client";
import type { PaymentPayload, PaymentRequired } from "@x402/core/types";
import type { Address } from "viem";
import {
  ASSET,
  NETWORK,
  VaultClientScheme,
  paymentRequirements,
  sameJson,
  validateQuoteDocument,
  type AuthorizationRecord,
  type ClientFunding,
  type PaymentSigner,
  type QuoteDocument,
} from "./index";

// One answer from the paid resource, whatever transport carried it.
export type X402Response = {
  status: number;
  header(name: string): string | null | undefined;
  body: unknown;
};

// Sends the paid request once more with these extra headers. The caller keeps
// the method, URL, body, cookies and Idempotency-Key the same on every send.
export type X402Send = (headers: Record<string, string>) => Promise<X402Response>;

export type X402PayOptions = {
  // The paid resource as the caller addressed it. Trusted; never read from a 402.
  resourceUrl: string;
  send: X402Send;
  buyer: Address;
  vault: Address;
  signer: PaymentSigner;
  funding: ClientFunding;
  // Spend cap for this one payment, in atomic USDC.
  maxAmount: bigint;
  // The quote the caller already holds and approved (chat flow). Without it,
  // the quote is taken from the 402 body and `approve` decides on it.
  quote?: QuoteDocument;
  // Runs on the quote before anything is signed; throw to refuse it.
  approve?: (quote: QuoteDocument) => void | Promise<void>;
  persist?: (record: AuthorizationRecord) => Promise<void>;
  now?: () => number;
};

export type X402Payment = {
  quote: QuoteDocument;
  paymentRequired: PaymentRequired;
  paymentPayload: PaymentPayload;
  // The PAYMENT-SIGNATURE header. Resending it is safe: the server journals
  // one authorization per quote.
  headers: Record<string, string>;
};

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

// The 402 challenge: x402 v2 carries PaymentRequired in the PAYMENT-REQUIRED
// header. Headers have size limits, so Payvoke sends the full quote only in
// the JSON body, as `extensions.payvoke.quote`; the body must otherwise
// repeat the header exactly.
export function readChallenge(
  response: X402Response,
  quote?: QuoteDocument,
): { paymentRequired: PaymentRequired; quote: QuoteDocument } {
  if (response.status !== 402) throw new Error(`Expected a 402 challenge, got ${response.status}`);
  const paymentRequired = new x402HTTPClient(new x402Client()).getPaymentRequiredResponse(
    (name) => response.header(name) ?? undefined,
  );
  if (paymentRequired.x402Version !== 2) throw new Error("Unsupported x402 version");
  if (quote) return { paymentRequired, quote: structuredClone(quote) };
  const body = response.body;
  if (!record(body) || !record(body.extensions) || !record(body.extensions.payvoke))
    throw new Error("The 402 carries no Payvoke quote");
  const { extensions, ...rest } = body;
  const { extensions: _declared, ...required } = paymentRequired as PaymentRequired & {
    extensions?: unknown;
  };
  if (!sameJson(rest, required)) throw new Error("402 body and header disagree");
  const payvoke = extensions.payvoke as Record<string, unknown>;
  const offered = payvoke.quote;
  if (!record(offered)) throw new Error("The 402 carries no Payvoke quote");
  return { paymentRequired, quote: structuredClone(offered) as unknown as QuoteDocument };
}

// Signs a 402 challenge for one quote. VaultClientScheme re-validates the
// whole quote document against the trusted buyer, vault and resource and
// checks the requirements are exactly this quote's before anything is signed.
export async function signChallenge(
  challenge: { paymentRequired: PaymentRequired; quote: QuoteDocument },
  options: Omit<X402PayOptions, "send" | "quote">,
): Promise<X402Payment> {
  const { paymentRequired, quote } = challenge;
  const accepts = paymentRequired.accepts;
  if (
    !Array.isArray(accepts) ||
    accepts.length !== 1 ||
    !sameJson(accepts[0], paymentRequirements(quote))
  )
    throw new Error("Payment requirements do not match the quote");
  validateQuoteDocument(quote, options.vault, options.buyer);
  // Over the cap is refused before anyone is asked to approve it.
  if (BigInt(quote.grossAmount) > options.maxAmount) throw new Error("Spend cap exceeded");
  await options.approve?.(quote);
  const scheme = new VaultClientScheme({
    document: quote,
    buyer: options.buyer,
    vault: options.vault,
    resourceUrl: options.resourceUrl,
    signer: options.signer,
    funding: options.funding,
    maxAmount: options.maxAmount,
    persist: options.persist ?? (async () => {}),
    now: options.now,
  });
  // Core's own cap defaults to $1; the caller's cap replaces it.
  const core = new x402Client().register(NETWORK, scheme).setSpendControls({
    allowedAssets: [
      { network: NETWORK, asset: ASSET, maxAmountPerPayment: options.maxAmount.toString() },
    ],
  });
  const http = new x402HTTPClient(core);
  const created = await http.createPaymentPayload(paymentRequired);
  // Core echoes declared extensions into the payload; the vault envelope is
  // exactly {x402Version, accepted, resource, payload}.
  const { extensions: _echo, ...paymentPayload } = created;
  return {
    quote,
    paymentRequired,
    paymentPayload: paymentPayload as PaymentPayload,
    headers: http.encodePaymentSignatureHeader(paymentPayload as PaymentPayload),
  };
}

// The standard x402 round trip: send unpaid, read the 402, sign this quote,
// send again with PAYMENT-SIGNATURE. A first answer other than 402 is
// returned as is, with nothing signed.
export async function x402Pay(
  options: X402PayOptions,
): Promise<{ response: X402Response; payment: X402Payment | null }> {
  const first = await options.send({});
  if (first.status !== 402) return { response: first, payment: null };
  const payment = await signChallenge(readChallenge(first, options.quote), options);
  return { response: await options.send(payment.headers), payment };
}

// Adapts a fetch Response; the body is read once, as JSON when it is JSON.
export async function x402Response(response: Response): Promise<X402Response> {
  const type = response.headers.get("content-type") ?? "";
  const body = type.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text();
  return { status: response.status, header: (name) => response.headers.get(name), body };
}
