import { createFileRoute } from "@tanstack/react-router";
import { DashboardHome } from "@/src/components/dashboard-home";

export const Route = createFileRoute("/_market/dashboard/")({
  component: DashboardPage,
  head: () => ({
    meta: [
      { title: "Studio — Payvoke" },
      {
        name: "description",
        content: "Manage Payvoke apps, slash commands, visibility, and keys.",
      },
    ],
  }),
});

function DashboardPage() {
  return <DashboardHome />;
}
