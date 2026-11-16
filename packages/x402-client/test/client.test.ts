import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { encodePaymentRequiredHeader, encodePaymentResponseHeader } from "@x402/core/http";
import type { PaymentRequired } from "@x402/core/types";
import { paymentRequirements, readQuote, type QuoteDocument } from "@payvoke/shared/x402";
import { hashReceiveAuthorization } from "@payvoke/shared/protocol";
import { getAddress, recoverTypedDataAddress, verifyMessage, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { parseSiweMessage } from "viem/siwe";
// The API's own quote builder, so the SDK signs exactly what the server issues.
import { buildQuoteDocument } from "../../../apps/api/src/modules/quotes/quote-document";
import {
  CookieJar,
  PayvokeError,
  createPayvoke,
  readResult,
  x402Fetch,
  type HireEvent,
  type InvocationStatus,
} from "../src";
import { authorizationTypedData } from "@payvoke/shared/x402";

const api = "https://api.payvoke.test";
const web = "https://app.payvoke.test";
const vault = getAddress("0x1111111111111111111111111111111111111111");
const tx = `0x${"ab".repeat(32)}` as Hex;
const hold = `0x${"cd".repeat(32)}` as Hex;
const instant = (appId = "app-1", command = "quick_review") =>
  `${api}/v1/x402/apps/${appId}/commands/${command}`;

function quote(buyer: string, resource = instant(), grossAmount = 500000n, appId = "app-1") {
  const terms = {
    deliverySeconds: 60,
    reviewSeconds: 30,
    revisionPolicy: { maxIncluded: 0, description: "None" },
    refundPolicy: "Refund undelivered work",
    sideEffects: "none",
    dataUse: "Only this request",
    verification: { minEvidence: "SIGN" },
  };
  return buildQuoteDocument({
    vault,
    buyer,
    threadId: randomUUID(),
    product: { id: appId, payoutAddress: "0x2222222222222222222222222222222222222222" },
    commandId: randomUUID(),
    revision: { terms, reviewSeconds: 30, deliverySeconds: 60 } as never,
    grossAmount,
    deliverySeconds: 60,
    offer: null,
    policy: {
      version: "policy-1",
      feeBps: 500,
      feeRecipient: "0x3333333333333333333333333333333333333333",
      quoteLifetimeSeconds: 120,
      maxHoldSeconds: 600,
      resolutionGraceSeconds: 60,
    } as never,
    schema: { type: "object" },
    effectiveArguments: { cv_text: "hello" },
    history: [],
    files: [],
    resource,
    now: Math.floor(Date.now() / 1000),
  });
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

function status(q: QuoteDocument, over: Partial<InvocationStatus> = {}): InvocationStatus {
  return {
    invocationId: q.invocationId,
    threadId: q.sessionId,
    paymentStatus: "PENDING",
    executionStatus: "NOT_STARTED",
    financial: null,
    delivery: null,
    transaction: null,
    failure: null,
    receipt: null,
    nextActions: ["poll"],
    ...over,
  };
}

// An in-memory Payvoke API: SIWE with a cookie, the catalog, one instant
// command that answers 402 then 202, and a scripted list of status reads.
function fakeApi(options: {
  account: ReturnType<typeof privateKeyToAccount>;
  quote?: QuoteDocument;
  statuses?: (q: QuoteDocument) => InvocationStatus[];
  firstAnswer?: Response;
  paidAnswer?: (q: QuoteDocument) => Response;
  timeline?: (q: QuoteDocument) => unknown;
}) {
  const q = options.quote ?? quote(options.account.address);
  const statuses = options.statuses?.(q) ?? [];
  const log: { method: string; path: string; headers: Headers; body: string | null }[] = [];
  let nonce = "";
  let signed: Record<string, unknown> | null = null;
  const fetch = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const headers = new Headers(init.headers);
    const body = typeof init.body === "string" ? init.body : null;
    const method = init.method ?? "GET";
    log.push({ method, path: url.pathname, headers, body });
    const authed =
      headers.get("authorization") === "Bearer pvb_test" ||
      (headers.get("cookie")?.includes("better-auth.session_token=s1") &&
        (method === "GET" || headers.get("origin") === web));
    switch (`${method} ${url.pathname}`) {
      case "POST /v1/auth/siwe/nonce":
        nonce = randomUUID().replaceAll("-", "");
        return json({ nonce }, 200, {
          "set-cookie": `payvoke_siwe=${nonce}.sig; Path=/; HttpOnly`,
        });
      case "POST /v1/auth/siwe/verify": {
        const { message, signature } = JSON.parse(body!);
        const parsed = parseSiweMessage(message);
        const ok =
          headers.get("origin") === web &&
          headers.get("cookie")?.includes(`payvoke_siwe=${nonce}.sig`) &&
          parsed.nonce === nonce &&
          parsed.domain === new URL(web).host &&
          parsed.uri === web &&
          parsed.chainId === 43113 &&
          (await verifyMessage({ address: options.account.address, message, signature }));
        if (!ok) return json({ code: "INVALID_SIWE_BROWSER", message: "Invalid" }, 401);
        return json({ token: "s1", success: true }, 200, {
          "set-cookie": "better-auth.session_token=s1; Path=/; HttpOnly",
        });
      }
      case "GET /v1/x402/catalog":
        return json({
          x402Version: 2,
          scheme: "payvoke-escrow",
          network: "eip155:43113",
          asset: "0x5425890298aed601595a70AB815c96711a31Bc65",
          vault,
          items: [
            {
              appId: "app-1",
              appName: "CV Reviewer",
              command: "quick_review",
              description: "Quick review",
              amount: q.grossAmount,
              deliverySeconds: 60,
              reviewSeconds: 30,
              inputSchema: { type: "object" },
              resource: instant(),
              available: true,
            },
          ],
        });
    }
    if (!authed) return json({ error: "UNAUTHORIZED" }, 401);
    if (method === "POST" && url.pathname.startsWith("/v1/x402/apps/")) {
      if (!/^[0-9a-f-]{36}$/.test(headers.get("idempotency-key") ?? ""))
        return json({ error: "IDEMPOTENCY_KEY_REQUIRED" }, 400);
      const payment = headers.get("payment-signature");
      if (!payment) {
        if (options.firstAnswer) return options.firstAnswer;
        const required: PaymentRequired = {
          x402Version: 2,
          resource: {
            url: url.href,
            method: "POST",
            description: "Payvoke invocation",
            mimeType: "application/json",
          } as PaymentRequired["resource"],
          accepts: [paymentRequirements(q)],
        };
        return json({ ...required, extensions: { payvoke: { quote: q } } }, 402, {
          "payment-required": encodePaymentRequiredHeader(required),
        });
      }
      signed = JSON.parse(Buffer.from(payment, "base64").toString("utf8"));
      if (options.paidAnswer) return options.paidAnswer(q);
      return json(
        { invocationId: q.invocationId, paymentStatus: "PENDING", nextActions: ["poll"] },
        202,
        {
          location: `/v1/invocations/${q.invocationId}`,
          "retry-after": "5",
        },
      );
    }
    if (method === "GET" && url.pathname === `/v1/invocations/${q.invocationId}`)
      return json(statuses.length > 1 ? statuses.shift() : statuses[0]);
    if (method === "GET" && url.pathname === `/v1/threads/${q.sessionId}/timeline`)
      return json(options.timeline?.(q) ?? { cursor: "1", messages: [] });
    return json({ error: "NOT_FOUND" }, 404);
  };
  return { fetch, log, quote: q, signed: () => signed };
}

const delivered = (q: QuoteDocument, output: unknown = "## Review\nSolid CV.") => ({
  cursor: "9",
  messages: [
    {
      id: `run-${q.invocationId}`,
      role: "assistant",
      status: "complete",
      parts: [
        { type: "text", id: "m1", text: "streamed", format: "markdown", streaming: false },
        typeof output === "string"
          ? {
              type: "text",
              id: `output-${q.invocationId}-1`,
              text: output,
              format: "markdown",
              streaming: false,
            }
          : {
              type: "tool-call",
              toolCallId: `output-${q.invocationId}-2`,
              toolName: "result",
              args: { output, artifactVersion: 2 },
              result: null,
              status: "done",
            },
        {
          type: "file",
          id: "f1",
          fileId: "f1",
          name: "review.md",
          contentType: "text/markdown",
          size: 12,
          audio: null,
        },
      ],
      run: { invocationId: q.invocationId, phase: "delivered" },
    },
  ],
});

const fast = { pollIntervalMs: 1, sleep: async () => {} };

test("signs in with SIWE, pays the 402 and returns the delivered result", async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const server = fakeApi({
    account,
    statuses: (q) => [
      status(q, { transaction: tx }),
      status(q, { paymentStatus: "HELD", executionStatus: "QUEUED", transaction: tx }),
      status(q, { paymentStatus: "HELD", executionStatus: "RUNNING", transaction: tx }),
      status(q, { paymentStatus: "HELD", executionStatus: "DELIVERED", transaction: tx }),
    ],
    timeline: (q) => delivered(q),
  });
  const payvoke = createPayvoke({
    baseUrl: api,
    webOrigin: web,
    account,
    fetch: server.fetch,
    ...fast,
  });
  await payvoke.signIn();
  const { items } = await payvoke.catalog();
  const events: HireEvent[] = [];
  const job = await payvoke.hire({
    appId: items[0].appId,
    command: "quick_review",
    arguments: { cv_text: "hello" },
    maxAmount: 1_000_000n,
    onEvent: (event) => void events.push(event),
  });
  const q = server.quote;
  expect(job).toMatchObject({
    invocationId: q.invocationId,
    threadId: q.sessionId,
    paymentStatus: "HELD",
    executionStatus: "DELIVERED",
    transaction: tx,
    amount: "500000",
  });
  expect(job.result).toEqual({
    artifactVersion: 1,
    output: "## Review\nSolid CV.",
    text: "## Review\nSolid CV.",
    files: [{ fileId: "f1", name: "review.md", contentType: "text/markdown", size: 12 }],
  });
  expect(events.map((e) => e.type)).toEqual([
    "challenge",
    "signed",
    "pending",
    "pending",
    "held",
    "running",
    "delivered",
  ]);
  const challenge = events[0] as Extract<HireEvent, { type: "challenge" }>;
  expect(challenge).toMatchObject({
    amount: "500000",
    vault,
    resource: instant(),
    quoteDigest: q.quoteDigest,
  });
  expect(events[3]).toEqual({ type: "pending", invocationId: q.invocationId, transaction: tx });
  expect(events[4]).toMatchObject({ type: "held", threadId: q.sessionId, transaction: tx });
  // One unpaid and one paid POST, same key and body; the paid one carries
  // the buyer's ReceiveWithAuthorization for exactly this quote.
  const posts = server.log.filter((r) => r.method === "POST" && r.path.startsWith("/v1/x402/"));
  expect(posts).toHaveLength(2);
  expect(posts[0].headers.get("idempotency-key")).toBe(posts[1].headers.get("idempotency-key"));
  expect(posts[0].body).toBe(posts[1].body);
  expect(posts[0].headers.get("payment-signature")).toBeNull();
  expect(posts[1].headers.get("origin")).toBe(web);
  const envelope = server.signed() as {
    resource: { url: string };
    payload: { kind: string; signature: Hex };
  };
  expect(envelope.resource.url).toBe(instant());
  expect(envelope.payload.kind).toBe("authorization");
  const recovered = await recoverTypedDataAddress({
    ...authorizationTypedData(q),
    signature: envelope.payload.signature,
  } as never);
  expect(recovered).toBe(account.address);
  expect(hashReceiveAuthorization(vault, readQuote(q.protocolQuote), q.quoteDigest)).toMatch(/^0x/);
});

test("signs in on first use and reads the receipt of a 202 HELD", async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const server = fakeApi({
    account,
    paidAnswer: (q) =>
      json(
        {
          invocationId: q.invocationId,
          paymentStatus: "HELD",
          executionStatus: "QUEUED",
          nextActions: ["poll"],
        },
        202,
        {
          "payment-response": encodePaymentResponseHeader({
            success: true,
            transaction: tx,
            network: "eip155:43113",
            payer: account.address,
            amount: "500000",
            extra: { holdId: hold },
          } as never),
        },
      ),
    statuses: (q) => [
      status(q, { paymentStatus: "HELD", executionStatus: "DELIVERED", transaction: tx }),
    ],
    timeline: (q) => delivered(q, { score: 8 }),
  });
  const events: HireEvent[] = [];
  const job = await createPayvoke({
    baseUrl: api,
    webOrigin: web,
    account,
    vault,
    fetch: server.fetch,
    ...fast,
  }).hire({
    appId: "app-1",
    command: "quick_review",
    arguments: { cv_text: "hello" },
    maxAmount: 500_000n,
    onEvent: (event) => void events.push(event),
  });
  expect(server.log[0].path).toBe("/v1/auth/siwe/nonce");
  expect(events.map((e) => e.type)).toEqual(["challenge", "signed", "held", "delivered"]);
  expect(events[2]).toMatchObject({ transaction: tx, holdId: hold });
  expect(job.result).toMatchObject({ artifactVersion: 2, output: { score: 8 }, text: null });
});

test("never signs over the spend cap or for another agent", async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const server = fakeApi({ account });
  const payvoke = createPayvoke({
    baseUrl: api,
    webOrigin: web,
    account,
    vault,
    fetch: server.fetch,
    ...fast,
  });
  const refused = await payvoke
    .hire({
      appId: "app-1",
      command: "quick_review",
      arguments: { cv_text: "hello" },
      maxAmount: 499_999n,
    })
    .catch((e) => e);
  expect(refused).toBeInstanceOf(PayvokeError);
  expect(refused.code).toBe("SPEND_CAP_EXCEEDED");
  expect(refused.invocationId).toBe(server.quote.invocationId);
  expect(server.signed()).toBeNull();

  // The server answers for app-1, but we asked for app-2.
  const other = fakeApi({
    account,
    quote: quote(account.address, instant("app-2"), 500000n, "app-1"),
  });
  const mismatch = await createPayvoke({
    baseUrl: api,
    webOrigin: web,
    account,
    vault,
    fetch: other.fetch,
    ...fast,
  })
    .hire({
      appId: "app-2",
      command: "quick_review",
      arguments: { cv_text: "hello" },
      maxAmount: 1_000_000n,
    })
    .catch((e) => e);
  expect(mismatch.code).toBe("QUOTE_MISMATCH");
  expect(other.signed()).toBeNull();

  // A quote for another wallet: the shared client refuses to sign it.
  const stranger = fakeApi({
    account,
    quote: quote(privateKeyToAccount(generatePrivateKey()).address),
  });
  const wrong = await createPayvoke({
    baseUrl: api,
    webOrigin: web,
    account,
    vault,
    fetch: stranger.fetch,
    ...fast,
  })
    .hire({
      appId: "app-1",
      command: "quick_review",
      arguments: { cv_text: "hello" },
      maxAmount: 1_000_000n,
    })
    .catch((e) => e);
  expect(wrong.code).toBe("PAYMENT_NOT_SIGNED");
  expect(stranger.signed()).toBeNull();
});

test("surfaces the API's error codes", async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const offline = fakeApi({ account, firstAnswer: json({ error: "APP_OFFLINE" }, 409) });
  const error = await createPayvoke({
    baseUrl: api,
    webOrigin: web,
    account,
    vault,
    fetch: offline.fetch,
    ...fast,
  })
    .hire({
      appId: "app-1",
      command: "quick_review",
      arguments: { cv_text: "x" },
      maxAmount: 1_000_000n,
    })
    .catch((e) => e);
  expect(error).toBeInstanceOf(PayvokeError);
  expect([error.status, error.code]).toEqual([409, "APP_OFFLINE"]);

  const broke = fakeApi({
    account,
    paidAnswer: (q) =>
      json(
        { invocationId: q.invocationId, paymentStatus: "UNKNOWN", error: "insufficient_balance" },
        402,
      ),
  });
  const unpaid = await createPayvoke({
    baseUrl: api,
    webOrigin: web,
    account,
    vault,
    fetch: broke.fetch,
    ...fast,
  })
    .hire({
      appId: "app-1",
      command: "quick_review",
      arguments: { cv_text: "x" },
      maxAmount: 1_000_000n,
    })
    .catch((e) => e);
  expect([unpaid.status, unpaid.code, unpaid.invocationId]).toEqual([
    402,
    "insufficient_balance",
    broke.quote.invocationId,
  ]);

  const rejected = fakeApi({
    account,
    statuses: (q) => [status(q, { paymentStatus: "REJECTED" })],
  });
  const refusal = await createPayvoke({
    baseUrl: api,
    webOrigin: web,
    account,
    vault,
    fetch: rejected.fetch,
    ...fast,
  })
    .hire({
      appId: "app-1",
      command: "quick_review",
      arguments: { cv_text: "x" },
      maxAmount: 1_000_000n,
    })
    .catch((e) => e);
  expect(refusal.code).toBe("PAYMENT_REJECTED");

  // Better Auth's own error shape.
  const intruder = privateKeyToAccount(generatePrivateKey());
  const login = await createPayvoke({
    baseUrl: api,
    webOrigin: web,
    account: intruder,
    fetch: fakeApi({ account }).fetch,
  })
    .signIn()
    .catch((e) => e);
  expect([login.status, login.code]).toEqual([401, "INVALID_SIWE_BROWSER"]);
});

test("returns a failed job and reports its refund", async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const server = fakeApi({
    account,
    statuses: (q) => [
      status(q, { paymentStatus: "HELD", executionStatus: "RUNNING", transaction: tx }),
      status(q, {
        paymentStatus: "HELD",
        executionStatus: "FAILED",
        transaction: tx,
        financial: { status: "REFUNDED", hold: {}, finalizedBlock: "1", finalizedBlockHash: "0x" },
      }),
    ],
  });
  const events: HireEvent[] = [];
  const job = await createPayvoke({
    baseUrl: api,
    webOrigin: web,
    account,
    vault,
    fetch: server.fetch,
    ...fast,
  }).hire({
    appId: "app-1",
    command: "quick_review",
    arguments: { cv_text: "x" },
    maxAmount: 1_000_000n,
    onEvent: (event) => void events.push(event),
  });
  expect(job.executionStatus).toBe("FAILED");
  expect(job.result).toBeNull();
  expect(events.map((e) => e.type)).toEqual([
    "challenge",
    "signed",
    "pending",
    "held",
    "running",
    "failed",
    "refunded",
  ]);
});

test("gives up at the timeout with the invocation id", async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const server = fakeApi({
    account,
    statuses: (q) => [status(q, { paymentStatus: "HELD", executionStatus: "QUEUED" })],
  });
  let clock = Date.now();
  const error = await createPayvoke({
    baseUrl: api,
    webOrigin: web,
    account,
    vault,
    fetch: server.fetch,
    now: () => clock,
    sleep: async (ms) => void (clock += ms),
    pollIntervalMs: 1000,
  })
    .hire({
      appId: "app-1",
      command: "quick_review",
      arguments: { cv_text: "x" },
      maxAmount: 1_000_000n,
      timeoutMs: 5000,
    })
    .catch((e) => e);
  expect([error.code, error.invocationId]).toEqual(["TIMEOUT", server.quote.invocationId]);
});

test("an access token replaces SIWE: bearer auth, no Origin, no sign-in", async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const server = fakeApi({
    account,
    statuses: (q) => [status(q, { paymentStatus: "HELD", executionStatus: "DELIVERED" })],
    timeline: (q) => delivered(q),
  });
  const payvoke = createPayvoke({
    baseUrl: api,
    account,
    accessToken: "pvb_test",
    fetch: server.fetch,
    ...fast,
  });
  await payvoke.signIn();
  const job = await payvoke.hire({
    appId: "app-1",
    command: "quick_review",
    arguments: { cv_text: "hello" },
    maxAmount: 1_000_000n,
  });
  expect(job.executionStatus).toBe("DELIVERED");
  expect(server.log.some((r) => r.path.startsWith("/v1/auth/"))).toBe(false);
  for (const r of server.log.filter((r) => r.path !== "/v1/x402/catalog")) {
    expect(r.headers.get("authorization")).toBe("Bearer pvb_test");
    expect(r.headers.get("origin")).toBeNull();
  }
  expect((await payvoke.job(server.quote.invocationId)).result?.text).toBe("## Review\nSolid CV.");
});

test("x402Fetch pays a 402 and returns the paid answer", async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const server = fakeApi({ account });
  const paid = x402Fetch(
    (input, init) =>
      server.fetch(input, {
        ...init,
        headers: {
          ...Object.fromEntries(new Headers(init?.headers)),
          authorization: "Bearer pvb_test",
        },
      }),
    { account, vault, maxAmount: 500_000n },
  );
  const response = await paid(instant(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ arguments: { cv_text: "hello" } }),
  });
  expect(response.status).toBe(202);
  expect((await response.json()).invocationId).toBe(server.quote.invocationId);
  expect(server.signed()).not.toBeNull();
  const capped = x402Fetch(server.fetch, { account, vault, maxAmount: 1n });
  const error = await capped(instant(), {
    method: "POST",
    headers: { authorization: "Bearer pvb_test", "content-type": "application/json" },
    body: "{}",
  }).catch((e) => e);
  expect(error.code).toBe("SPEND_CAP_EXCEEDED");
});

test("readResult ignores undelivered runs; the cookie jar honours deletion", () => {
  const q = { invocationId: "inv-1" } as QuoteDocument;
  const timeline = delivered(q);
  expect(readResult(timeline, "inv-2")).toBeNull();
  timeline.messages[0].run.phase = "running";
  expect(readResult(timeline, "inv-1")).toBeNull();
  const jar = new CookieJar();
  jar.store(
    new Headers([
      ["set-cookie", "a=1; Path=/"],
      ["set-cookie", "b=2; Path=/"],
    ]),
  );
  expect(jar.header()).toBe("a=1; b=2");
  jar.store(new Headers([["set-cookie", "a=; Max-Age=0; Path=/"]]));
  expect(jar.header()).toBe("b=2");
});
