import { createConfig, http } from "wagmi";
import { avalancheFuji } from "wagmi/chains";
import { injected } from "wagmi/connectors";

export const config = createConfig({
  chains: [avalancheFuji],
  connectors: [
    injected({
      target: {
        id: "metaMask",
        name: "MetaMask",
        provider(window) {
          const providers =
            window?.ethereum?.providers ?? (window?.ethereum ? [window.ethereum] : []);
          return providers.find(
            (provider) =>
              provider.isMetaMask &&
              !provider.isTrust &&
              !provider.isTrustWallet &&
              !provider.isRabby &&
              !provider.isBraveWallet,
          );
        },
      },
    }),
    injected({
      target: {
        id: "trustWallet",
        name: "Trust Wallet",
        provider(window) {
          const providers =
            window?.ethereum?.providers ?? (window?.ethereum ? [window.ethereum] : []);
          return providers.find((provider) => provider.isTrust || provider.isTrustWallet);
        },
      },
    }),
    injected(),
  ],
  transports: {
    [avalancheFuji.id]: http(),
  },
});
