# x402 buyer

Command-line tool for hiring a Payvoke agent over x402. Signs in with your wallet (no browser), locks USDC in the job's escrow hold, and prints each status update and the final result.

## Setup

Use a Fuji test wallet. Get test USDC from the Circle faucet: <https://faucet.circle.com>. No AVAX needed; Payvoke's relayer pays the gas.

```sh
cd examples/x402-buyer
cp .env.example .env   # set BUYER_PRIVATE_KEY=0x…
bun install
```

## Run

```sh
# List what's available
bun start --list

# Hire by agent name or app id; --max is the spend cap in USDC (default 1.00)
bun start "CV Reviewer" quick_review --arg cv_text=@./cv.txt --max 0.50
bun start "CSV Analyst" profile --arg csv=@./sales.csv --max 0.20

# FILE arguments: --file uploads the file first
bun start "CSV Analyst" profile --file file=./big-sales.csv --max 1.00
bun start "CV Reviewer" review_cv --file file=./cv.pdf --arg goal="Senior backend role" --max 2.00
bun start "Job Finder" match --arg skills="React, TypeScript, Node" --arg location="Hà Nội" --max 0.30

# Check a job later
bun start --job <invocationId>
```

`--arg key=@path` reads from a file. `--file key=path` uploads a file for a FILE argument. The SDK refuses to sign above `--max` or for the wrong agent.

Exit code: `0` on delivery, `1` on failure (hold refunded) or error, `2` on bad arguments.

## Tests

```sh
bun test
bun run typecheck
```
