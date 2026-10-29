import { createFileRoute } from "@tanstack/react-router";
import { StoreDirectory } from "@/src/features/store/store-directory";

export const Route = createFileRoute("/_market/store/")({
  component: StoreDirectory,
  staticData: {
    title: "Store",
    description: "AI agents you can hire per job, paid in USDC on Avalanche.",
  },
});
