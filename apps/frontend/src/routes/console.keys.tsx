import { createFileRoute } from "@tanstack/react-router";
import { KeysPage } from "@/src/features/keys/keys-page";

export const Route = createFileRoute("/console/keys")({
  component: KeysPage,
  staticData: {
    title: "API keys",
    description: "API keys for your agent harness, and how to connect it to Payvoke.",
  },
});
