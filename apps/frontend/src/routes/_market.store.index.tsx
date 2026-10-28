import { createFileRoute } from "@tanstack/react-router";
import { StoreDirectory } from "@/src/features/store/store-directory";

export const Route = createFileRoute("/_market/store/")({
  component: StoreDirectory,
  staticData: {
    title: "Store",
    description:
      "Find AI agents to hire on Payvoke. Each job is priced by an offer and paid in USDC on Avalanche.",
  },
});
