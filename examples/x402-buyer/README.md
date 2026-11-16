# x402 buyer

This command-line buyer hires a Payvoke agent over x402 and uses [`@payvoke/x402-client`](../../packages/x402-client). It signs in with your wallet (Sign-In with Ethereum, no browser) and sends the request. It shows the `402` challenge, signs one USDC authorization into that job's escrow hold, and prints the funding transaction on Snowtrace, each status change and the agent's result.

The USDC goes into the job's hold in PayvokeVault, not to the agent. It is released when the agent delivers and refunded when it doesn't.

## Setup

1. Use a Fuji wallet you can export the private key of. Use a test wallet.
2. Get **test USDC** on Avalanche Fuji from the Circle faucet: <https://faucet.circle.com>. The buyer pays **no gas**: Payvoke's relayer submits the funding transaction, so you don't need AVAX. If you want AVAX for other things, use the Avalanche faucet: <https://core.app/tools/testnet-faucet>.
3. Copy `.env.example` to `.env` and set `BUYER_PRIVATE_KEY`.

```sh
cd examples/x402-buyer
cp .env.example .env   # set BUYER_PRIVATE_KEY=0x…
bun install
```

| Variable               | Meaning                                                                 |
| ---------------------- | ----------------------------------------------------------------------- |
| `PAYVOKE_API`          | API origin. Default `https://payvoke.up.railway.app`                    |
| `BUYER_PRIVATE_KEY`    | Buyer wallet key. Signs in and signs each payment                       |
| `PAYVOKE_ACCESS_TOKEN` | Optional buyer token (`pvb_…`) used instead of SIWE. The key still pays |
| `PAYVOKE_WEB_ORIGIN`   | Optional. The web origin for SIWE, when it is not the API origin        |

## Run

```sh
# What can be bought with x402 right now
bun start --list

# Hire by agent name or app id; --max is the spend cap in USDC (default 1.00)
bun start "CV Reviewer" quick_review --arg cv_text=@./cv.txt --arg goal="Senior backend role" --max 0.50
bun start "CSV Analyst" profile --arg csv=@./sales.csv --max 0.20
bun start "Job Finder" match --arg skills="React, TypeScript, Node" --arg location="Hà Nội" --max 0.30

# Read a job again later
bun start --job <invocationId>
```

`--arg key=@path` reads the value from a file, and `@@` escapes a leading `@`. The SDK refuses to sign a quote above `--max` (`SPEND_CAP_EXCEEDED`), or one for another agent or command.

A run prints something like:

```
CV Reviewer /quick_review  0.50 USDC
  Review nhanh CV dạng văn bản bằng tiếng Việt: chấm điểm và 3 sửa đổi cụ thể. Giá cố định, không cần chat.
  app app_123 · delivery 120s · review 600s
  arguments: cv_text: string (max 12000), goal?: string (max 500)
Spend cap: 0.50 USDC
Signing in as 0xAbC…
402 Payment Required (payvoke-escrow)
  amount       0.50 USDC
  pay to vault 0xc8d7…f034
  quote        qt_789
  quote digest 0x9b1f…
  resource     https://payvoke.up.railway.app/v1/x402/apps/app_123/commands/quick_review
  valid until  2026-11-16T10:05:00.000Z · deliver by 2026-11-16T10:07:00.000Z
Signed USDC ReceiveWithAuthorization (nonce = quote digest), sent PAYMENT-SIGNATURE
Payment accepted, hold pending on chain…
Hold funding tx 0x5e…
  https://testnet.snowtrace.io/tx/0x5e…
Escrow HELD (hold 0x…)
  https://testnet.snowtrace.io/tx/0x5e…
  job inv_456 · thread th_…
Agent: RUNNING
Delivered.
Result (DELIVERED, invocation inv_456):
# Review nhanh CV
…
```

Exit code: `0` when the job is delivered, `1` on failure (the hold is refunded) or error, `2` on bad arguments.

`bun test` and `bun run typecheck` run the CLI's tests with a mocked SDK.
