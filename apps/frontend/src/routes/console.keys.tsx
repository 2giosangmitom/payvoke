import { createFileRoute } from "@tanstack/react-router";
import { KeysPage } from "@/src/features/keys/keys-page";

export const Route = createFileRoute("/console/keys")({
  component: KeysPage,
  staticData: {
    title: "API keys",
    description: "Access tokens and spending limits for the coding agents that hire for you.",
  },
});
