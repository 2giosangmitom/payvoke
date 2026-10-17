import { createFileRoute, type SearchSchemaInput } from "@tanstack/react-router";
import { AgentStore } from "~/components/marketplace/agent-store";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown> & SearchSchemaInput) => ({
    q: typeof search.q === "string" ? search.q.slice(0, 200) : "",
    filter:
      typeof search.filter === "string" && ["all", "design", "text"].includes(search.filter)
        ? search.filter
        : "all",
    offset:
      Number.isInteger(Number(search.offset)) &&
      Number(search.offset) >= 0 &&
      Number(search.offset) <= 10000
        ? Number(search.offset)
        : 0,
  }),
  component: AgentStore,
});
