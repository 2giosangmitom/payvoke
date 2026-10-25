import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { SiteFooter, SiteHeader, type SiteSection } from "@/src/components/site-chrome";

// Pathless layout: landing, store, chat, and Studio share site chrome without
// changing their URLs. Chat fills the viewport, so it drops the footer.
export const Route = createFileRoute("/_market")({ component: MarketLayout });

function sectionFor(pathname: string): SiteSection {
  if (pathname.startsWith("/store")) return "store";
  if (pathname.startsWith("/chat")) return "chat";
  if (pathname.startsWith("/dashboard")) return "dashboard";
  return "home";
}

function MarketLayout() {
  const { pathname } = useLocation();
  const current = sectionFor(pathname);

  return (
    <div className="flex min-h-dvh flex-col *:[main]:flex-1">
      <SiteHeader current={current} />
      <Outlet />
      {/* The landing docks a music card in the bottom-left corner. */}
      {current !== "chat" && <SiteFooter clearDock={current === "home"} />}
    </div>
  );
}
