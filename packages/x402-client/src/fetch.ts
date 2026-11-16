import { randomUUID } from "node:crypto";
import type { PaymentSigner, QuoteDocument } from "@payvoke/shared/x402";
import { x402Pay, x402Response } from "@payvoke/shared/x402/client";
import type { Address } from "viem";
import { PayvokeError } from "./errors";
import type { FetchLike } from "./session";

export type X402FetchOptions = {
  // The buyer wallet: it signs the USDC ReceiveWithAuthorization.
  account: PaymentSigner;
  // The PayvokeVault you trust (from configuration, never from a 402).
  vault: Address;
  // Spend cap per payment, atomic USDC.
  maxAmount: bigint;
  // Veto on the quote before anything is signed; throw to refuse.
  approve?: (quote: QuoteDocument) => void | Promise<void>;
};

// Maps the shared client's refusals onto SDK error codes. Errors already
// typed (from `approve` or the transport) pass through.
export function signingError(error: unknown): PayvokeError {
  if (error instanceof PayvokeError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new PayvokeError(
    /spend cap/i.test(message) ? "SPEND_CAP_EXCEEDED" : "PAYMENT_NOT_SIGNED",
    0,
    { message },
    undefined,
    { cause: error },
  );
}

// One request; a network failure becomes NETWORK_ERROR, not a signing error.
export async function transport(fetch: FetchLike, url: string, init: RequestInit) {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (error instanceof PayvokeError) throw error;
    throw new PayvokeError("NETWORK_ERROR", 0, { message: String(error) }, undefined, {
      cause: error,
    });
  }
}

// Wraps `fetch` for Payvoke's x402 resources: a 402 is answered by signing
// its quote (after the shared client validates it against the vault, the
// wallet, this exact URL and the cap) and sending the same request again
// with PAYMENT-SIGNATURE. Anything else is returned untouched. The body must
// be replayable (a string), and a POST gets an Idempotency-Key if it has none,
// so both sends address the same quote.
export function x402Fetch(fetch: FetchLike, options: X402FetchOptions): FetchLike {
  return async (input, init = {}) => {
    let url: string;
    let request: RequestInit = init;
    if (input instanceof Request) {
      url = input.url;
      const body = input.body ? await input.text() : undefined;
      const headers = new Headers(input.headers);
      new Headers(init.headers).forEach((value, name) => headers.set(name, value));
      request = { method: input.method, body, ...init, headers };
    } else url = input.toString();
    if (request.body != null && typeof request.body !== "string")
      throw new TypeError("x402Fetch needs a string body: the paid request is sent twice");
    const headers = new Headers(request.headers);
    const method = (request.method ?? "GET").toUpperCase();
    if (method === "POST" && !headers.has("idempotency-key"))
      headers.set("idempotency-key", randomUUID());
    let last: Response | null = null;
    try {
      await x402Pay({
        resourceUrl: new URL(url).href,
        send: async (extra) => {
          const sent = new Headers(headers);
          for (const [name, value] of Object.entries(extra)) sent.set(name, value);
          last = await transport(fetch, url, { ...request, method, headers: sent });
          return x402Response(last.clone());
        },
        buyer: options.account.address,
        vault: options.vault,
        signer: options.account,
        funding: { mode: "authorization" },
        maxAmount: options.maxAmount,
        approve: async (quote) => {
          await options.approve?.(quote);
        },
        persist: async () => {},
      });
    } catch (error) {
      throw signingError(error);
    }
    return last!;
  };
}
