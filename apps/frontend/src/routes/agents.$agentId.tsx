import { createFileRoute, type SearchSchemaInput } from "@tanstack/react-router";
import { AgentDetails } from "~/components/marketplace/agent-details";

export const Route = createFileRoute("/agents/$agentId")({
  validateSearch: (search: Record<string, unknown> & SearchSchemaInput) => ({
    tab: ["overview", "input", "output", "terms"].includes(String(search.tab))
      ? String(search.tab)
      : "overview",
  }),
  component: AgentDetails,
});
