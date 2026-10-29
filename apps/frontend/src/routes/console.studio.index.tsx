import { createFileRoute } from "@tanstack/react-router";
import { DashboardHome } from "@/src/features/studio/dashboard-home";

// The landing's "Create an app" form hands over a name and listing choice,
// which open the create form already filled in.
export type StudioSearch = { name?: string; visibility?: "PUBLIC" | "PRIVATE" };

export const Route = createFileRoute("/console/studio/")({
  component: DashboardHome,
  validateSearch: (search: Record<string, unknown>): StudioSearch => ({
    name: typeof search.name === "string" ? search.name.slice(0, 80) : undefined,
    visibility:
      search.visibility === "PUBLIC" || search.visibility === "PRIVATE"
        ? search.visibility
        : undefined,
  }),
  staticData: {
    title: "Studio",
    description: "Share your AI agents on Payvoke. Manage profiles, commands and API keys.",
  },
});
