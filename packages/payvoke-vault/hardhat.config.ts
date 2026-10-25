import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable, defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.34",
        settings: {
          evmVersion: "cancun",
          viaIR: true,
          optimizer: { enabled: true, runs: 200 },
        },
      },
      production: {
        version: "0.8.34",
        settings: {
          evmVersion: "cancun",
          viaIR: true,
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  // Hardhat's built-in Fuji descriptor falls back to the Etherscan v2 API. Point it
  // at Routescan, which backs testnet.snowtrace.io and needs no real API key.
  chainDescriptors: {
    43113: {
      name: "Avalanche Fuji",
      blockExplorers: {
        etherscan: {
          name: "SnowTrace",
          url: "https://testnet.snowtrace.io",
          apiUrl: "https://api.routescan.io/v2/network/testnet/evm/43113/etherscan",
        },
      },
    },
  },
  verify: {
    etherscan: { apiKey: "routescan" },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    fuji: {
      type: "http",
      chainType: "l1",
      chainId: 43113,
      url: configVariable("FUJI_RPC_URL"),
      accounts: [configVariable("FUJI_PRIVATE_KEY")],
    },
  },
});
