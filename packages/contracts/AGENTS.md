# Contracts workspace

- Use Node 24 and root-pinned pnpm. Run `pnpm --filter contracts build`, `pnpm --filter contracts test`, then `pnpm --filter contracts exec tsc --noEmit` after contract or test changes.
- For Hardhat config, Solidity tests or `network.create()` work, read `.agents/skills/hardhat/SKILL.md` and `.agents/skills/hardhat-toolbox-viem/SKILL.md` before editing. They describe Hardhat 3's compile-first typing, local EVM fixtures and viem assertions.
- Read [`README.md`](README.md) and [`M06`](../../docs/modules/06-smart-accounts-and-payments.md) before changing account authority. The configured Fuji network is test-only; payment admission in M03 stays disabled until [`docs/verification.md`](../../docs/verification.md) is proven.
- `MockTestToken` is a local fixture. The Ignition module deploys only `PersonalAccountFactory`. Keep deployer keys and real token/treasury addresses out of source control.
