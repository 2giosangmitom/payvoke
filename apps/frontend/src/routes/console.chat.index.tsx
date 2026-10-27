import { createFileRoute } from "@tanstack/react-router";
import { NewThread } from "@/src/components/new-thread";

export const Route = createFileRoute("/console/chat/")({
  component: NewThread,
  head: () => ({ meta: [{ title: "Chat · Payvoke" }] }),
});
