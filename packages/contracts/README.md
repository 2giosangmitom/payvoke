# Fuji contract prototype (M06)

Hardhat 3 + OpenZeppelin Contracts 5. `PersonalAccountFactory` creates one ERC-20 account per owner wallet. Each owner can deposit, withdraw unreserved funds, create a policy restricted to one delegate, token, recipient and action, and revoke it. Account ownership is nontransferable so the factory mapping cannot become stale. A delegate can transfer an exact amount once per nonzero operation ID. Per-operation and lifetime caps, expiry, aggregate reserved capacity and replay checks execute on-chain. Successful `pay` immediately transfers to the policy recipient; it is **not escrow, an x402 payment, or marketplace settlement evidence**. A supplied `quoteDigest` is emitted as an assertion by the delegate; this contract cannot verify that it matches a marketplace quote. There is no paid-order adapter, facilitator, treasury journal, refund or payout here.

`MockTestToken` is a local test fixture with public minting. It is not the Fuji payment asset. The selected test asset is Circle USDC on Fuji (`0x5425890298aed601595a70AB815c96711a31Bc65`, 6 decimals); see [Avalanche's Fuji USDC reference](https://build.avax.network/academy/avalanche-l1/native-token-bridge/01-erc20-to-native/04-deploy-erc20-token-home). The factory and account do not pin that token. No factory or treasury address has been selected.

x402 v2 `exact` defaults to EIP-3009, where the USDC payer signs a `transferWithAuthorization`. This account cannot sign as its own address, and its `pay` method does not implement x402. The [x402 EVM exact specification](https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_evm.md) offers ERC-7710 for compatible delegated smart accounts, but this prototype does not implement that interface. A wallet-funded EIP-3009 payment would bypass this account's spend limits. Payment stays disabled while the account/facilitator route is selected and proven.

```sh
pnpm --filter contracts build
pnpm --filter contracts test
```

Fuji is configured as Avalanche C-Chain testnet, chain ID `43113`, with the public RPC default. The compiler and local test chain target Cancun, which Avalanche currently requires. An alternative RPC can be passed as `FUJI_RPC_URL`. To deploy a _test_ factory with a funded testnet deployer, set `FUJI_DEPLOYER_PRIVATE_KEY` outside source control and run:

```sh
pnpm --filter contracts exec hardhat ignition deploy ignition/modules/PersonalAccountFactory.ts --network fuji
```

Record the resulting address for the frontend/backend after deployment. Deployment is not performed by build or test. Do not fund these contracts with customer assets or use them for paid orders before the [M06 proof obligations](../../docs/verification.md) pass, including a reviewed token route, real Fuji wallet/facilitator tests and canonical effect reconciliation.
