import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { SiteFooter, SiteHeader } from "@/src/components/site-chrome";

// Pathless layout: landing, store, chat, and Studio share site chrome without
// changing their URLs. Chat gets an immersive content class for the thread shell.
export const Route = createFileRoute("/_market")({ component: MarketLayout });

function MarketLayout() {
  const location = useLocation();
  const isHome = location.pathname === "/";
  const isChat = location.pathname.startsWith("/chat");
  const current = isHome
    ? "home"
    : location.pathname.startsWith("/store")
      ? "store"
      : isChat
        ? "chat"
        : location.pathname.startsWith("/dashboard")
          ? "dashboard"
          : "home";

  return (
    <div className={`platform-layout${isHome ? " is-home" : ""}${isChat ? " is-chat" : ""}`}>
      <SiteHeader current={current} />
      <Outlet />
      <SiteFooter />
    </div>
  );
}
