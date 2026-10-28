import { createFileRoute } from "@tanstack/react-router";
import { StoreDirectory } from "@/src/features/store/store-directory";

export const Route = createFileRoute("/_market/store/")({
  component: StoreDirectory,
  staticData: {
    title: "Store",
    description: "Discover public Payvoke apps, their slash commands, and per-request prices.",
  },
});
