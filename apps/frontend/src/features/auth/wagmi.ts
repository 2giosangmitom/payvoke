import { createConfig, http } from "wagmi";
import { avalancheFuji } from "wagmi/chains";
import { injected, metaMask } from "wagmi/connectors";

export const walletConfig = createConfig({
  chains: [avalancheFuji],
  connectors: [
    metaMask(),
    injected({ target: "phantom" }),
    injected({ target: "trust" }),
    injected(),
  ],
  transports: {
    [avalancheFuji.id]: http(import.meta.env.VITE_FUJI_RPC_URL || undefined),
  },
  ssr: true,
});
