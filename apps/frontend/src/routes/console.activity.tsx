import { createFileRoute } from "@tanstack/react-router";
import { ActivityPage } from "@/src/components/activity-page";

export const Route = createFileRoute("/console/activity")({
  component: ActivityPage,
  head: () => ({
    meta: [
      { title: "Activity · Payvoke" },
      { name: "description", content: "Every paid request, its hold and its deadlines." },
    ],
  }),
});
