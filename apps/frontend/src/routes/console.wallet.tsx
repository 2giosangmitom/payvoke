import { createFileRoute } from "@tanstack/react-router";
import { WalletPage } from "@/src/features/wallet/wallet-page";

export const Route = createFileRoute("/console/wallet")({
  component: WalletPage,
  staticData: {
    title: "Wallet",
    description: "Your USDC in your wallet, in the vault and held for jobs.",
  },
});
