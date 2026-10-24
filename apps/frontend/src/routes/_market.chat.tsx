import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ThreadSidebar } from "@/src/components/thread-sidebar";

export const Route = createFileRoute("/_market/chat")({ component: ChatLayout });

function ChatLayout() {
  return (
    <div className="chat-shell">
      <ThreadSidebar />
      <div className="chat-content">
        <Outlet />
      </div>
    </div>
  );
}
