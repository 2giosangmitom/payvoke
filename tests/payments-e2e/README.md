# payments-e2e

Cross-service payment tests: quote → x402 gateway (`apps/api`) → facilitator
(`apps/facilitator`) → settlement worker and automatic finance
(`@payvoke/payments`). This is the only workspace allowed to import apps.

```sh
pnpm --filter payments-e2e test                     # PGlite + mock RPC
pnpm --filter payments-e2e test:payments:evm        # local Hardhat EVM (chain 43113)
pnpm --filter payments-e2e test:conformance         # x402 rules vs. named tests in every suite
```

Setting `PAYMENTS_TEST_DATABASE_URL` to a disposable Postgres (never Neon) runs
the same suite against it, including the two-process claim race; each run owns a
random schema. No mode reads `DATABASE_URL` or touches Fuji. `test/conformance/rules.ts`
references tests by name, so renaming a listed test breaks conformance.
