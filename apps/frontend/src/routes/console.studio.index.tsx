import { createFileRoute } from "@tanstack/react-router";
import { DashboardHome } from "@/src/features/studio/dashboard-home";

export const Route = createFileRoute("/console/studio/")({
  component: DashboardHome,
  staticData: {
    title: "Studio",
    description: "Manage Payvoke apps, commands, visibility and keys.",
  },
});
