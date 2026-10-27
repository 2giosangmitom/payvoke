import { createFileRoute } from "@tanstack/react-router";
import { DashboardHome } from "@/src/components/dashboard-home";

export const Route = createFileRoute("/console/studio/")({
  component: DashboardHome,
  head: () => ({
    meta: [
      { title: "Studio · Payvoke" },
      { name: "description", content: "Manage Payvoke apps, commands, visibility and keys." },
    ],
  }),
});
