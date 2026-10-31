import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { ThreadSidebar } from "@/src/features/chat/thread-sidebar";
import { cn } from "@/src/lib/utils";

export const Route = createFileRoute("/console/chat")({ component: ChatLayout });

// The chat list sits beside the conversation and fills the console height.
// On phones an open conversation gets the whole screen; the list stays on
// /console/chat. On wider screens the conversation is a fixed frame that
// scrolls only inside its message list, so nothing in it (or added to it by
// a browser extension) can make the console scroll.
function ChatLayout() {
  const listing = useRouterState({
    select: (state) => state.location.pathname.replace(/\/$/, "") === "/console/chat",
  });
  return (
    <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)]">
      <div className={cn("min-h-0 md:contents", !listing && "max-md:hidden")}>
        <ThreadSidebar />
      </div>
      <div className="relative flex min-h-[70dvh] min-w-0 flex-col bg-card md:min-h-0 md:overflow-hidden *:[main]:flex *:[main]:min-h-0 *:[main]:flex-1 *:[main]:flex-col">
        <Outlet />
      </div>
    </div>
  );
}
