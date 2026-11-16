# @payvoke/x402-client

Hire a Payvoke agent from code. The SDK handles the whole x402 round trip on Payvoke's `payvoke-escrow` scheme: the `402`, the quote check, the USDC `ReceiveWithAuthorization` signature, waiting for the escrow hold, waiting for the job and reading its result. Your USDC goes into that job's hold in PayvokeVault. It is released when the agent delivers and refunded when it doesn't. You pay no gas.

It is a workspace package of this repository (`"@payvoke/x402-client": "workspace:*"`), not published to npm.

```ts
import { createPayvoke } from "@payvoke/x402-client";
import { privateKeyToAccount } from "viem/accounts";

const payvoke = createPayvoke({
  baseUrl: "https://payvoke.up.railway.app",
  account: privateKeyToAccount(process.env.BUYER_PRIVATE_KEY as `0x${string}`),
});
await payvoke.signIn(); // Sign-In with Ethereum, no browser. Optional: hire() does it on first use.

const { items } = await payvoke.catalog();
const job = await payvoke.hire({
  appId: items[0].appId,
  command: "quick_review",
  arguments: { cv_text: cv },
  maxAmount: 1_000_000n, // never sign more than 1 USDC
  onEvent: (event) => console.log(event.type, event),
});
console.log(job.paymentStatus, job.executionStatus, job.result?.text);
```

## API

`createPayvoke(options)`:

| Option           | Meaning                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `baseUrl`        | API origin. Paid URLs are built from it and must match the server's own.                  |
| `account`        | Buyer wallet (`{ address, signMessage, signTypedData }`, e.g. a viem `LocalAccount`).     |
| `accessToken`    | Optional buyer token (`pvb_…`) instead of SIWE. `account` must still be its owner wallet. |
| `webOrigin`      | Origin the API trusts for SIWE and cookie writes. Default: the origin of `baseUrl`.       |
| `vault`          | The PayvokeVault you trust. Default: the one `GET /v1/x402/catalog` names.                |
| `fetch`          | Custom fetch (tests, proxies).                                                            |
| `pollIntervalMs` | Delay between status reads. Default 2000.                                                 |

The returned client:

- `signIn()`: SIWE with `account`. The SDK keeps the session cookie in its own jar. Without an access token, `hire`, `job` and `x402Fetch` sign in on first use. With one, it does nothing.
- `catalog()`: `GET /v1/x402/catalog`, public, no sign-in. `{ vault, items: [{ appId, appName, command, amount, inputSchema, resource, available, … }] }`.
- `hire({ appId, command, arguments, maxAmount, onEvent?, approve?, idempotencyKey?, timeoutMs?, signal? })`: resolves `{ invocationId, threadId, idempotencyKey, amount, paymentStatus, executionStatus, transaction, result }` once the job is `DELIVERED` or `FAILED`. It throws `PayvokeError` if the payment is refused or the deadline passes. The default deadline is the quote's delivery deadline plus 2 minutes.
- `job(invocationId)`: the job's status (`GET /v1/invocations/:id`) and its `result` once delivered.
- `x402Fetch({ maxAmount, approve? })`: `fetch` with this session and wallet that pays any Payvoke `402` up to `maxAmount`.

The SDK pays only with the `authorization` kind: `account` signs a USDC `ReceiveWithAuthorization` for each quote. That is why `account` is required even with an access token. Spending grants (the `grant` kind) are used by the web app's one-click key and by MCP autopay, not by the SDK.

`result` is `{ artifactVersion, output, text, files }`. `output` is what the agent delivered (markdown or JSON), and `text` is the same output when it is a string.

`onEvent` is awaited and gets these events in order:

| Event       | Fields                                                                         |
| ----------- | ------------------------------------------------------------------------------ |
| `challenge` | `amount`, `vault`, `resource`, `quoteId`, `quoteDigest`, `validUntil`, `quote` |
| `signed`    | `quoteDigest`                                                                  |
| `pending`   | `transaction` (null, then again with the funding tx hash once broadcast)       |
| `held`      | `threadId`, `transaction`, `holdId`                                            |
| `running`   | `executionStatus` (`ACKED`, `RUNNING`, `WAITING_BUYER`, `VERIFYING`)           |
| `delivered` | `result`                                                                       |
| `failed`    | `reason`                                                                       |
| `refunded`  | (the hold was refunded on chain)                                               |

The `challenge` event reports what the `402` asks for before anything is checked. The quote comes from the `402` body (`extensions.payvoke.quote`), which must match the `PAYMENT-REQUIRED` header (`INVALID_RESPONSE` otherwise). Before signing, the SDK refuses a quote for another agent or command URL (`QUOTE_MISMATCH`) or one that costs more than `maxAmount` (`SPEND_CAP_EXCEEDED`). The shared client then checks the requirements against the quote and recomputes its hashes against your wallet and the vault, your `approve` runs, and the `payvoke-escrow` client scheme validates it once more against the URL before it signs (`PAYMENT_NOT_SIGNED` when any check fails).

### Errors

`PayvokeError` has `code`, `status`, `body` and `invocationId`. `code` is the API's own error code when the API sent one (`APP_OFFLINE`, `QUOTE_EXPIRED`, `IDEMPOTENCY_CONFLICT`, `insufficient_balance`, …). Otherwise it is one of the SDK's codes: `SPEND_CAP_EXCEEDED`, `QUOTE_MISMATCH`, `PAYMENT_NOT_SIGNED`, `PAYMENT_REJECTED`, `TIMEOUT`, `SIGN_IN_FAILED`, `NETWORK_ERROR`, `INVALID_RESPONSE` or `HTTP_<status>`.

### Raw x402

`x402Fetch(fetch, { account, vault, maxAmount, approve? })` wraps any fetch. It does not sign in, so give it a fetch that already authenticates. The body must be a string, because the request is sent twice. A POST without an `Idempotency-Key` gets one.

Without the SDK, `@payvoke/shared/x402/client` has the same round trip as plain functions (`x402Pay`, `readChallenge`, `signChallenge`), and `VaultClientScheme` from `@payvoke/shared/x402` registers with an `@x402/core` `x402Client`.

## Tests

`bun test` runs the unit tests (mocked API) and an integration test against the real API in process: Hono `app.request` as fetch, PGlite, and a mock vault plus the real settlement worker.
