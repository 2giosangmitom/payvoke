# API

Hono API on Bun: SIWE auth, catalog, threads, chat, x402 payments, MCP and AG-UI streams. Runs the facilitator and optional workers in the same process.

## Setup

```sh
cp .env.example .env
# Required: DATABASE_URL, WEB_ORIGIN, API_ORIGIN, BETTER_AUTH_SECRET
# Generate the secret: openssl rand -base64 32

docker compose up -d redis
bun run migrate
bun run dev
```

File storage is optional. Any S3-compatible store works:

```sh
docker compose up -d rustfs storage-init
# .env: FILES_ENABLED=true S3_ENDPOINT=http://127.0.0.1:9000 S3_REGION=us-east-1
#       S3_BUCKET=payvoke-files S3_FORCE_PATH_STYLE=true
#       S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY = values in root .env
```

## Workers

| Worker     | Enabled by                  | Needs                                                          |
| ---------- | --------------------------- | -------------------------------------------------------------- |
| Job        | `JOB_WORKER_ENABLED` (default true) | No key                                                |
| Settlement | `SETTLEMENT_WORKER_ENABLED` | `RELAYER_PRIVATE_KEY`                                          |
| Finance    | `FINANCE_WORKER_ENABLED`    | `FINANCE_APPROVER_PRIVATE_KEY`, `FINANCE_EXECUTOR_PRIVATE_KEY` |

Settlement and finance each keep one nonce lane, so run exactly one API replica when either is enabled. Fund those wallets with only what the gas budget needs.

## Payments

Spending is off by default. With `PAYMENTS_ENABLED=false`, signed submissions return `SETTLEMENT_NOT_AVAILABLE`. To enable, set the vault deployment settings, `SETTLEMENT_ENABLED`, and start the settlement worker. The vault runs on Avalanche Fuji; see [packages/vault/README.md](../../packages/vault/README.md).

## Tests

```sh
bun test         # unit and e2e (PGlite, no Docker needed)
bun run test:payments:evm   # real Hardhat EVM flows
bun run test:conformance    # x402 security rules
```
