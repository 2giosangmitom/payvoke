import { createFileRoute } from "@tanstack/react-router";
import { ActivityPage } from "@/src/features/activity/activity-page";

export const Route = createFileRoute("/console/activity")({
  component: ActivityPage,
  staticData: {
    title: "Activity",
    description: "Every paid request, its hold and its deadlines.",
  },
});
