# PayvokeVault

Hardhat 3, Solidity unit/fuzz tests and viem integration tests.

Run from this directory:

```shell
pnpm compile
pnpm test
pnpm typecheck
```

The vault supports deposits, grants, holds, partial/full refunds, release, dispute,
reclaim and buyer/provider/platform withdrawals. Finance execution requires a
separate EIP-712 approver with the relevant refund/release/resolver roles; the
executor cannot approve its own decision. Partial dispute refunds keep the dispute
lock until terminal resolution or reclaim. Refunds never replenish grant allowance.

Local tests are not a security audit or Fuji E2E proof. Deployment policy, multisig
admin and role/key ownership must be approved before deployment. Backend approvers
must also enforce actual delivery/review eligibility; the vault only knows signed deadlines.

## Ignition

Module: `ignition/modules/PayvokeVault.ts`. Asset defaults to Fuji USDC.
Supply a parameters JSON with a `PayvokeVault` object containing `admin`,
`adminDelay`, `feeCapBps`, `maxQuoteLifetimeSeconds` and `maxHoldSeconds`.
Times are in seconds. Override `asset` with MockUSDC for local deployments.
Only the admin role is assigned; operational roles require explicit admin transactions.

Once the vault is ready for Fuji deployment, configure `FUJI_RPC_URL` and
`FUJI_PRIVATE_KEY` using environment variables or the Hardhat keystore, then run:

```shell
pnpm exec hardhat ignition deploy ignition/modules/PayvokeVault.ts --network fuji --build-profile production --parameters /path/to/parameters.json
```
