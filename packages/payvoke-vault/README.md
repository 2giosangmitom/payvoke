# Sample Hardhat 3 Project (`node:test` and `viem`)

This package contains the Hardhat 3 sample, using Node.js tests (`node:test`) and `viem` for Ethereum interactions. It does not yet implement PayvokeVault.

Hardhat setup instructions: [Getting Started guide](https://hardhat.org/docs/getting-started#getting-started-with-hardhat-3).

## Project Overview

This example project includes:

- A simple Hardhat configuration file.
- Foundry-compatible Solidity unit tests.
- TypeScript integration tests using [`node:test`](https://nodejs.org/api/test.html) and [`viem`](https://viem.sh/).
- Examples demonstrating how to connect to different types of networks, including locally simulating OP mainnet.

## Usage

### Running Tests

Run all tests:

```shell
npx hardhat test
```

Run Solidity or `node:test` tests separately:

```shell
npx hardhat test solidity
npx hardhat test nodejs
```

### Deploy the sample Counter

The sample Ignition module deploys Counter to a local chain or Sepolia. These are sample commands, not deployment instructions for PayvokeVault on Fuji.

Deploy locally:

```shell
npx hardhat ignition deploy ignition/modules/Counter.ts
```

For Sepolia, use a test account funded for gas. The Hardhat configuration reads its private key from `SEPOLIA_PRIVATE_KEY`.

Set `SEPOLIA_PRIVATE_KEY` through `hardhat-keystore` or an environment variable. To use the keystore:

```shell
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
```

Then deploy to Sepolia:

```shell
npx hardhat ignition deploy --network sepolia ignition/modules/Counter.ts
```
