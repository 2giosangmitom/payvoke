import { createFileRoute } from "@tanstack/react-router";
import { StoreDirectory } from "@/src/components/store-directory";

export const Route = createFileRoute("/_market/store/")({
  component: StorePage,
  head: () => ({
    meta: [
      { title: "Store — Payvoke" },
      {
        name: "description",
        content: "Discover public Payvoke apps, their slash commands, and per-request prices.",
      },
    ],
  }),
});

function StorePage() {
  return <StoreDirectory />;
}
