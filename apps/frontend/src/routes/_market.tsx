import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { SiteFooter, SiteHeader, type SiteSection } from "@/src/components/site-chrome";

// Pathless layout for the public site: landing and store share the marketing
// header and footer. Working surfaces live in the /console layout instead.
export const Route = createFileRoute("/_market")({ component: MarketLayout });

function sectionFor(pathname: string): SiteSection {
  return pathname.startsWith("/store") ? "store" : "home";
}

function MarketLayout() {
  const { pathname } = useLocation();
  const current = sectionFor(pathname);

  return (
    <div className="flex min-h-dvh flex-col *:[main]:flex-1">
      <SiteHeader current={current} />
      <Outlet />
      {/* The landing docks a music card in the bottom-left corner. */}
      <SiteFooter clearDock={current === "home"} />
    </div>
  );
}
