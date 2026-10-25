import { createFileRoute } from "@tanstack/react-router";
import { NewThread } from "@/src/components/new-thread";

export const Route = createFileRoute("/_market/chat/")({
  component: NewThreadPage,
  head: () => ({
    meta: [
      { title: "Chat · Payvoke" },
      { name: "description", content: "One thread list for every Payvoke app." },
    ],
  }),
});

function NewThreadPage() {
  return <NewThread />;
}
