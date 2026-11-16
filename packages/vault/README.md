# PayvokeVault

Hardhat 3, Solidity unit/fuzz tests and viem integration tests for the per-job escrow contract.

```sh
bun run compile
bun run test
bun run typecheck
```

Buyers keep no balance in the vault. Each job is funded directly from the buyer's wallet when they pay, using a USDC EIP-3009 `ReceiveWithAuthorization` tied to that quote's digest. Grants let an assistant spend on a buyer's behalf, within per-job, daily and total limits.

Settlement is automatic: the finance worker calls `applyDecision` to pay the builder or refund the buyer. If a USDC transfer is refused (blacklist, freeze), the amount becomes claimable and the other party is still paid.

The current Fuji deployment is `0xc8d77919e1D9A473eB8D45C729613943eaF6f034` (block 60684420).

## Deploy

```sh
bunx hardhat ignition deploy ignition/modules/PayvokeVault.ts \
  --network fuji --build-profile production --parameters /path/to/parameters.json

bunx hardhat ignition deploy ignition/modules/PayvokeVaultRoles.ts \
  --network fuji --build-profile production --parameters /path/to/parameters.json
```

Configure `FUJI_RPC_URL` and `FUJI_PRIVATE_KEY` before deploying. The parameters file needs `admin`, `adminDelay`, `feeCapBps`, `maxQuoteLifetimeSeconds` and `maxHoldSeconds` under `PayvokeVaultV2`, and `relayer`, `financeApprover`, `financeExecutor` under `PayvokeVaultV2Roles`.
