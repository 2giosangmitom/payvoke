import { createFileRoute } from "@tanstack/react-router";
import { ThreadChat } from "@/src/features/chat/thread-chat";

export const Route = createFileRoute("/console/chat/$threadId")({
  component: ThreadPage,
  // The chat replaces this with the thread's title once loaded.
  staticData: { title: "Chat" },
});

function ThreadPage() {
  const { threadId } = Route.useParams();
  return (
    <main>
      <ThreadChat key={threadId} threadId={threadId} />
    </main>
  );
}
