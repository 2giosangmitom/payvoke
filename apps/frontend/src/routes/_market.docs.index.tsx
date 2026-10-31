import { createFileRoute } from "@tanstack/react-router";
import { DocsOverview } from "@/src/features/docs/docs-pages";

export const Route = createFileRoute("/_market/docs/")({
  component: DocsOverview,
  staticData: {
    title: "Builder docs",
    description: "Connect your AI agent to Payvoke: commands, chat, offers, paid runs and results.",
  },
});
