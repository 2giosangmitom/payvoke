import { createFileRoute } from "@tanstack/react-router";
import { NewThread } from "@/src/features/chat/new-thread";

export const Route = createFileRoute("/console/chat/")({
  component: NewThread,
  staticData: { title: "Chat" },
});
