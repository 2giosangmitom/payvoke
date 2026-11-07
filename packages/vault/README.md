# PayvokeVault

Hardhat 3, Solidity unit/fuzz tests and viem integration tests.

Run from this directory:

```shell
bun run compile
bun run test
bun run typecheck
```

PayvokeVault v2 is a per-job escrow. Buyers keep no balance in it: every job is
funded straight from the buyer's wallet when it is paid, in one of two ways.

- `fundWithAuthorization`: the buyer signs a USDC EIP-3009 `ReceiveWithAuthorization`
  for exactly one quote: to the vault, for the gross amount, valid until the quote
  expires, with the quote's EIP-712 digest as the nonce. Only the vault can redeem it
  (`receiveWithAuthorization` requires the payee to call), so it cannot be front-run
  or used for another job. Costs the buyer no gas.
- `fundWithGrant`: a spending grant's signer signs a `DebitAuthorization` and the vault
  pulls the amount from the buyer's allowance, within the grant's per-job, per-period
  and total limits and expiry.

Grants are created, updated and revoked from buyer signatures the relayer submits
(`setGrantWithSig`, `revokeGrantWithSig`), each optionally carrying an EIP-2612
permit that sets the vault allowance in the same call. `revokeGrant` stays callable by
the buyer directly as an escape hatch. All buyer signatures go through
`SignatureChecker` and the USDC v2.2 `bytes` overloads, so EOAs, ERC-1271 wallets and
EIP-7702 accounts can pay.

Settlement (`applyDecision`, `reclaim`) pushes USDC to the buyer, provider and fee
recipient. A transfer USDC refuses (blacklist, freeze) never blocks the other party:
that amount becomes `claimable` and its owner withdraws it with `claim(to)`. The vault
holds only `totalHeld + totalClaimable`. There is no dispute path: the backend finance
worker refunds or releases automatically. Finance execution requires a separate
EIP-712 approver with the relevant refund/release role; the executor cannot approve
its own decision. Refunds never replenish grant limits or allowance.

Local tests are not a security audit or Fuji E2E proof. Deployment policy, multisig
admin and role/key ownership must be approved before deployment. Backend approvers
must also enforce actual delivery/review eligibility; the vault only knows signed deadlines.

## Ignition

Module: `ignition/modules/PayvokeVault.ts` (id `PayvokeVaultV2`). Asset defaults to Fuji USDC
(FiatToken v2.2). Supply a parameters JSON with a `PayvokeVaultV2` object containing `admin`,
`adminDelay`, `feeCapBps`, `maxQuoteLifetimeSeconds` and `maxHoldSeconds`.
Times are in seconds. Override `asset` with MockUSDC for local deployments.
Only the admin role is assigned; operational roles require explicit admin transactions.

Once the vault is ready for Fuji deployment, configure `FUJI_RPC_URL` and
`FUJI_PRIVATE_KEY` using environment variables or the Hardhat keystore, then run:

```shell
bunx hardhat ignition deploy ignition/modules/PayvokeVault.ts --network fuji --build-profile production --parameters /path/to/parameters.json
```

Then grant the backend roles with `ignition/modules/PayvokeVaultRoles.ts`, signed by the
admin key. Add a `PayvokeVaultV2Roles` object with `relayer` (settlement worker),
`financeApprover` and `financeExecutor` (finance worker) to the same parameters file:

```shell
bunx hardhat ignition deploy ignition/modules/PayvokeVaultRoles.ts --network fuji --build-profile production --parameters /path/to/parameters.json
```

The current Fuji deployment (`ignition/deployments/chain-43113`) is PayvokeVault v2,
`0xc8d77919e1D9A473eB8D45C729613943eaF6f034` (`PayvokeVaultV2#PayvokeVault`), deployed at
block 60684420 from this source with `ignition/parameters/fuji.json`. Its runtime code hash is
`0xaf6df92b68a2a7ccb878b01bf22d5219172e8df8804d8521707367ed1df0ebed`. The v1 vault
`0xd3B75D6B8BFb1372E8312EC14BDFD27f01769512` is retired: buyers withdraw any remaining
available balance from it with `withdrawAvailable`, which works even when paused.
