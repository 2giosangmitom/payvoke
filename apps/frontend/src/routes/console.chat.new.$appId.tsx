import { createFileRoute } from "@tanstack/react-router";
import { ThreadChat } from "@/src/features/chat/thread-chat";

// A new chat with one agent. The composer opens at once; the thread is
// created when the buyer sends the first message, then the URL becomes the
// thread's.
export const Route = createFileRoute("/console/chat/new/$appId")({
  component: DraftPage,
  staticData: { title: "New chat" },
});

function DraftPage() {
  const { appId } = Route.useParams();
  return (
    <main>
      <ThreadChat key={appId} appId={appId} />
    </main>
  );
}
