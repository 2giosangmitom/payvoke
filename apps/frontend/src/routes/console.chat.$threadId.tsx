import { createFileRoute } from "@tanstack/react-router";
import { ThreadChat } from "@/src/components/thread-chat";

export const Route = createFileRoute("/console/chat/$threadId")({
  component: ThreadPage,
  head: () => ({ meta: [{ title: "Chat · Payvoke" }] }),
});

function ThreadPage() {
  const { threadId } = Route.useParams();
  return (
    <main>
      <ThreadChat key={threadId} threadId={threadId} />
    </main>
  );
}
