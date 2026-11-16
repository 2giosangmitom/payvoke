import { randomUUID } from "node:crypto";
import { decodePaymentResponseHeader } from "@x402/core/http";
import { quoteResource, type QuoteDocument } from "@payvoke/shared/x402";
import { readChallenge, signChallenge, x402Response } from "@payvoke/shared/x402/client";
import { getAddress, type Address, type Hex } from "viem";
import { createSiweMessage } from "viem/siwe";
import { PayvokeError, apiError } from "./errors";
import { signingError, transport, x402Fetch } from "./fetch";
import { readResult } from "./result";
import { CookieJar, readBody, sessionFetch, type FetchLike } from "./session";
import type {
  Catalog,
  ExecutionStatus,
  HireEvent,
  HireRequest,
  HireResult,
  InvocationStatus,
  Job,
  JobResult,
  PayvokeAccount,
} from "./types";

export type PayvokeOptions = {
  // The API origin, e.g. https://payvoke.up.railway.app. Paid resource URLs
  // are built from it and must match the server's own exactly.
  baseUrl: string;
  // The buyer wallet: signs in (SIWE) and signs each payment.
  account: PayvokeAccount;
  // A buyer access token (`pvb_…`) instead of a SIWE session. The account
  // must still be the token owner's wallet: it signs the payments.
  accessToken?: string;
  // The web app origin the API trusts for SIWE and cookie writes. Default:
  // the origin of `baseUrl` (a deployment serving web and API together).
  webOrigin?: string;
  // The PayvokeVault you trust. Default: the one the catalog names.
  vault?: Address;
  fetch?: FetchLike;
  // Between two status reads while waiting. Default 2000.
  pollIntervalMs?: number;
  // Test hooks.
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
};

export type Payvoke = {
  readonly address: Address;
  // Sign-In with Ethereum with `account`; keeps the session cookie. A no-op
  // with an access token. Called on first use if you don't.
  signIn(): Promise<{ address: Address }>;
  catalog(): Promise<Catalog>;
  // 402 -> check the quote -> sign -> 202 -> wait for the hold -> wait for
  // the job -> its result. Resolves on DELIVERED or FAILED; throws on a
  // refused payment or a timeout.
  hire(request: HireRequest): Promise<HireResult>;
  // A job's status, with its result once delivered.
  job(invocationId: string): Promise<Job>;
  // `fetch` with this session and wallet that pays any 402 up to `maxAmount`.
  x402Fetch(options: {
    maxAmount: bigint;
    approve?: (quote: QuoteDocument) => void | Promise<void>;
  }): FetchLike;
};

const CHAIN_ID = 43113;
const ACTIVE: ExecutionStatus[] = ["ACKED", "RUNNING", "WAITING_BUYER", "VERIFYING"];
const REFUNDED = ["REFUNDED", "RECLAIMED", "PARTIALLY_REFUNDED"];

const defaultSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

function receiptOf(header: string | null | undefined) {
  if (!header) return null;
  try {
    const receipt = decodePaymentResponseHeader(header);
    return {
      transaction: (receipt.transaction || null) as Hex | null,
      holdId: (record(receipt.extra) && typeof receipt.extra.holdId === "string"
        ? receipt.extra.holdId
        : null) as Hex | null,
    };
  } catch {
    return null;
  }
}

export function createPayvoke(options: PayvokeOptions): Payvoke {
  const base = new URL(options.baseUrl);
  const webOrigin = new URL(options.webOrigin ?? base.origin).origin;
  const account = options.account;
  const address = getAddress(account.address);
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  const pollMs = options.pollIntervalMs ?? 2000;
  const jar = new CookieJar();
  const http = sessionFetch(
    {
      baseUrl: base.href,
      webOrigin,
      accessToken: options.accessToken,
      fetch: options.fetch ?? ((input, init) => fetch(input, init)),
    },
    jar,
  );
  let session = false;
  let vault: Address | null = options.vault ? getAddress(options.vault) : null;
  const url = (path: string) => new URL(path, base).href;

  async function call(method: string, path: string, json?: unknown, signal?: AbortSignal) {
    const response = await transport(http, url(path), {
      method,
      headers: json === undefined ? {} : { "content-type": "application/json" },
      body: json === undefined ? undefined : JSON.stringify(json),
      signal,
    });
    return { status: response.status, headers: response.headers, body: await readBody(response) };
  }
  async function get<T>(path: string, invocationId?: string, signal?: AbortSignal) {
    const response = await call("GET", path, undefined, signal);
    if (response.status >= 400) throw apiError(response.status, response.body, invocationId);
    return response.body as T;
  }

  async function signIn() {
    if (options.accessToken) return { address };
    const nonce = await call("POST", "/v1/auth/siwe/nonce", {});
    if (nonce.status >= 400) throw apiError(nonce.status, nonce.body);
    if (!record(nonce.body) || typeof nonce.body.nonce !== "string")
      throw new PayvokeError("SIGN_IN_FAILED", nonce.status, nonce.body);
    // Backdated a little for clock skew; the API allows at most 5 minutes.
    const issuedAt = new Date(now() - 30_000);
    const message = createSiweMessage({
      address,
      chainId: CHAIN_ID,
      domain: new URL(webOrigin).host,
      uri: webOrigin,
      version: "1",
      nonce: nonce.body.nonce,
      issuedAt,
      expirationTime: new Date(issuedAt.getTime() + 270_000),
    });
    const signature = await account.signMessage({ message });
    const verified = await call("POST", "/v1/auth/siwe/verify", { message, signature });
    if (verified.status >= 400) throw apiError(verified.status, verified.body);
    if (!jar.has((name) => name.endsWith("session_token")))
      throw new PayvokeError("SIGN_IN_FAILED", verified.status, verified.body);
    session = true;
    return { address };
  }
  async function ensureSession() {
    if (!options.accessToken && !session) await signIn();
  }

  async function catalog() {
    const body = await get<Catalog>("/v1/x402/catalog");
    if (!record(body) || !Array.isArray(body.items))
      throw new PayvokeError("INVALID_RESPONSE", 200, body);
    return body;
  }
  async function trustedVault() {
    if (vault) return vault;
    const named = (await catalog()).vault;
    if (!named) throw new PayvokeError("INVALID_RESPONSE", 200, { message: "No vault configured" });
    vault = getAddress(named);
    return vault;
  }

  async function result(threadId: string, invocationId: string, signal?: AbortSignal) {
    const timeline = await get<unknown>(
      `/v1/threads/${encodeURIComponent(threadId)}/timeline`,
      invocationId,
      signal,
    );
    return readResult(timeline, invocationId);
  }
  const status = (invocationId: string, signal?: AbortSignal) =>
    get<InvocationStatus>(
      `/v1/invocations/${encodeURIComponent(invocationId)}`,
      invocationId,
      signal,
    );

  async function job(invocationId: string): Promise<Job> {
    await ensureSession();
    const current = await status(invocationId);
    return {
      ...current,
      result:
        current.executionStatus === "DELIVERED"
          ? await result(current.threadId, invocationId)
          : null,
    };
  }

  async function hire(request: HireRequest): Promise<HireResult> {
    const { appId, command, maxAmount, signal } = request;
    if (typeof maxAmount !== "bigint" || maxAmount <= 0n)
      throw new RangeError("maxAmount must be a positive bigint of atomic USDC");
    const emit = async (event: HireEvent) => {
      await request.onEvent?.(event);
    };
    await ensureSession();
    const trusted = await trustedVault();
    const idempotencyKey = request.idempotencyKey ?? randomUUID();
    const resourceUrl = url(
      `/v1/x402/apps/${encodeURIComponent(appId)}/commands/${encodeURIComponent(command)}`,
    );
    const body = JSON.stringify({ arguments: request.arguments });
    const send = async (headers: Record<string, string>) =>
      x402Response(
        await transport(http, resourceUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": idempotencyKey,
            ...headers,
          },
          body,
          signal,
        }),
      );

    // The standard round trip (the shared x402Pay), unrolled for the events.
    const first = await send({});
    if (first.status !== 402) throw apiError(first.status, first.body);
    let challenge: ReturnType<typeof readChallenge>;
    try {
      challenge = readChallenge(first);
    } catch (error) {
      throw new PayvokeError("INVALID_RESPONSE", 402, first.body, undefined, { cause: error });
    }
    const quote = challenge.quote;
    const invocationId = quote.invocationId;
    await emit({
      type: "challenge",
      invocationId,
      quoteId: quote.quoteId,
      quoteDigest: quote.quoteDigest,
      amount: quote.grossAmount,
      vault: quote.vault as Address,
      resource: quoteResource(quote) ?? "",
      validUntil: quote.validUntil,
      deliveryDeadline: quote.deliveryDeadline,
      quote,
    });
    // Our own request, not whatever the 402 says: this agent, this command
    // (its URL is frozen into the quote's terms), at most this price.
    if (quote.productId !== appId || quoteResource(quote) !== resourceUrl)
      throw new PayvokeError(
        "QUOTE_MISMATCH",
        402,
        { appId: quote.productId, resource: quoteResource(quote) },
        invocationId,
      );
    if (!/^\d+$/.test(quote.grossAmount) || BigInt(quote.grossAmount) > maxAmount)
      throw new PayvokeError(
        "SPEND_CAP_EXCEEDED",
        402,
        { amount: quote.grossAmount, maxAmount: maxAmount.toString() },
        invocationId,
      );
    let headers: Record<string, string>;
    try {
      ({ headers } = await signChallenge(challenge, {
        resourceUrl,
        buyer: address,
        vault: trusted,
        signer: account,
        funding: { mode: "authorization" },
        maxAmount,
        approve: request.approve,
        now: () => Math.floor(now() / 1000),
      }));
    } catch (error) {
      const refused = signingError(error);
      throw new PayvokeError(refused.code, refused.status, refused.body, invocationId, {
        cause: error,
      });
    }
    await emit({ type: "signed", invocationId, quoteDigest: quote.quoteDigest });
    const paid = await send(headers);
    if (paid.status !== 202) throw apiError(paid.status, paid.body, invocationId);
    const accepted = (record(paid.body) ? paid.body : {}) as {
      paymentStatus?: string;
      executionStatus?: ExecutionStatus;
    };
    const receipt = receiptOf(paid.header("payment-response"));

    const deadline =
      now() + (request.timeoutMs ?? Math.max(0, quote.deliveryDeadline * 1000 + 120_000 - now()));
    let transaction: Hex | null = receipt?.transaction ?? null;
    let paymentStatus = accepted.paymentStatus ?? "PENDING";
    let executionStatus: ExecutionStatus = accepted.executionStatus ?? "NOT_STARTED";
    let threadId: string | null = quote.sessionId ?? null;
    let held = false;
    let pendingShown = false;
    let pendingTx: Hex | null = null;
    let shown: ExecutionStatus | null = null;

    for (;;) {
      if (paymentStatus === "PENDING" || paymentStatus === "UNKNOWN") {
        if (!pendingShown || transaction !== pendingTx) {
          pendingShown = true;
          pendingTx = transaction;
          await emit({ type: "pending", invocationId, transaction });
        }
      } else if (paymentStatus === "HELD") {
        if (!held) {
          held = true;
          await emit({
            type: "held",
            invocationId,
            threadId,
            transaction,
            holdId: receipt?.holdId ?? null,
          });
        }
      } else {
        await emit({ type: "failed", invocationId, reason: paymentStatus });
        throw new PayvokeError("PAYMENT_REJECTED", 0, { paymentStatus }, invocationId);
      }
      if (held && executionStatus !== shown && ACTIVE.includes(executionStatus)) {
        shown = executionStatus;
        await emit({ type: "running", invocationId, executionStatus });
      }
      if (held && executionStatus === "DELIVERED") {
        const delivered = threadId ? await result(threadId, invocationId, signal) : null;
        await emit({ type: "delivered", invocationId, result: delivered });
        return done(delivered);
      }
      if (now() >= deadline)
        throw new PayvokeError(
          "TIMEOUT",
          0,
          { paymentStatus, executionStatus, transaction },
          invocationId,
        );
      await sleep(pollMs, signal);
      let current: InvocationStatus;
      try {
        current = await status(invocationId, signal);
      } catch (error) {
        // Transient: the network, a 5xx, or the journal not visible yet.
        if (
          error instanceof PayvokeError &&
          (error.code === "NETWORK_ERROR" ||
            error.status >= 500 ||
            error.code === "INVOCATION_NOT_FOUND")
        )
          continue;
        throw error;
      }
      paymentStatus = current.paymentStatus;
      executionStatus = current.executionStatus;
      threadId = current.threadId ?? threadId;
      transaction = current.transaction ?? current.receipt?.transaction ?? transaction;
      const refunded = !!current.financial && REFUNDED.includes(current.financial.status);
      if (executionStatus === "FAILED" || (refunded && executionStatus !== "DELIVERED")) {
        await emit({ type: "failed", invocationId, reason: current.failure?.code ?? null });
        if (refunded) await emit({ type: "refunded", invocationId });
        return done(null);
      }
    }

    function done(output: JobResult | null): HireResult {
      return {
        invocationId,
        threadId: threadId ?? quote.sessionId,
        idempotencyKey,
        amount: quote.grossAmount,
        paymentStatus: paymentStatus as HireResult["paymentStatus"],
        executionStatus,
        transaction,
        result: output,
      };
    }
  }

  return {
    address,
    signIn,
    catalog,
    hire,
    job,
    x402Fetch:
      ({ maxAmount, approve }) =>
      async (input, init) => {
        await ensureSession();
        return x402Fetch(http, { account, vault: await trustedVault(), maxAmount, approve })(
          input,
          init,
        );
      },
  };
}
