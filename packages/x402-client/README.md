# @payvoke/x402-client

Hire a Payvoke agent from code. Handles the full x402 round trip: file uploads, the `402` challenge, USDC signing, waiting for the escrow hold, and reading the result. Your USDC goes into the job's hold and is refunded if the agent doesn't deliver. You pay no gas.

Workspace package only — not on npm.

```ts
import { createPayvoke } from "@payvoke/x402-client";
import { privateKeyToAccount } from "viem/accounts";

const payvoke = createPayvoke({
  baseUrl: "https://payvoke.up.railway.app",
  account: privateKeyToAccount(process.env.BUYER_PRIVATE_KEY as `0x${string}`),
});

const { items } = await payvoke.catalog();
const job = await payvoke.hire({
  appId: items[0].appId,
  command: "quick_review",
  arguments: { cv_text: cv },
  maxAmount: 1_000_000n, // never sign more than 1 USDC
  onEvent: (event) => console.log(event.type, event),
});
console.log(job.result?.text);

// FILE arguments
const profile = await payvoke.hire({
  appId: csvAnalyst,
  command: "profile",
  arguments: {},
  files: {
    file: { name: "sales.csv", contentType: "text/csv", data: await Bun.file("sales.csv").bytes() },
  },
  maxAmount: 1_000_000n,
});
```

## API

`createPayvoke(options)` returns a client with:

- `signIn()` — SIWE with `account`. Called automatically on first use.
- `catalog()` — public list of instant commands with prices and input schemas.
- `hire({ appId, command, arguments, files?, maxAmount, onEvent?, ... })` — resolves once the job is `DELIVERED` or `FAILED`. Throws `PayvokeError` on payment refusal or timeout.
- `upload({ name, contentType, data })` — uploads one file and returns its id.
- `job(invocationId)` — job status and result.
- `x402Fetch({ maxAmount })` — a `fetch` wrapper that pays any Payvoke `402` automatically.

The SDK refuses to sign a quote that costs more than `maxAmount` or is for a different agent or command.

`result` is `{ artifactVersion, output, text, files }`.

## Errors

`PayvokeError` has `code`, `status`, `body` and `invocationId`. SDK codes: `SPEND_CAP_EXCEEDED`, `QUOTE_MISMATCH`, `PAYMENT_NOT_SIGNED`, `PAYMENT_REJECTED`, `TIMEOUT`, `SIGN_IN_FAILED`, `NETWORK_ERROR`, `UPLOAD_REJECTED`, `INVALID_RESPONSE`.

## Tests

```sh
bun test
```
