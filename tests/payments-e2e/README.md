# payments-e2e

Cross-service payment tests: quote → x402 gateway (`apps/api`) → facilitator
(`apps/facilitator`) → settlement worker and automatic finance
(`@payvoke/payments`). This is the only workspace allowed to import apps.

```sh
pnpm --filter payments-e2e test                     # PGlite + mock RPC
docker compose up -d --wait test-db                 # from repository root
pnpm --filter payments-e2e test:payments:postgres   # real Postgres, two-process claim race
pnpm --filter payments-e2e test:payments:evm        # local Hardhat EVM (chain 43113)
pnpm --filter payments-e2e test:conformance         # x402 rules vs. named tests in every suite
```

The Postgres mode only connects to `127.0.0.1:55433/test` and owns a random
schema; no mode reads `DATABASE_URL` or touches Fuji. `test/conformance/rules.ts`
references tests by name, so renaming a listed test breaks conformance.
