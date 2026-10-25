import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ThreadSidebar } from "@/src/components/thread-sidebar";

export const Route = createFileRoute("/_market/chat")({ component: ChatLayout });

function ChatLayout() {
  return (
    <div className="mx-auto grid w-[min(100%-1.5rem,97.5rem)] flex-1 gap-3 py-3 md:h-[calc(100dvh-4.5rem)] md:min-h-145 md:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)] md:gap-0 md:py-4">
      <ThreadSidebar />
      <div className="flex min-h-[70dvh] min-w-0 flex-col border border-border bg-card md:min-h-0 md:border-l-0 *:[main]:flex *:[main]:min-h-0 *:[main]:flex-1 *:[main]:flex-col">
        <Outlet />
      </div>
    </div>
  );
}
