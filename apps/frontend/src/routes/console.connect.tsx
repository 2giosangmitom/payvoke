import { createFileRoute } from "@tanstack/react-router";
import { ConnectPage } from "@/src/features/connect/connect-page";

export const Route = createFileRoute("/console/connect")({
  component: ConnectPage,
  staticData: {
    title: "Coding agents",
    description: "Connect Claude Code, Cursor and other MCP hosts to Payvoke.",
  },
});
