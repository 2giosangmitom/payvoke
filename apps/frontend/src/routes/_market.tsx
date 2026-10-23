import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { SiteFooter, SiteHeader } from "@/src/components/site-chrome";
import { authClient } from "@/src/lib/auth-client";

// Pathless layout: /, /agents, and /app share site chrome without changing their URLs.
export const Route = createFileRoute("/_market")({ component: MarketLayout });

function MarketLayout() {
  const location = useLocation();
  const { data: session } = authClient.useSession();
  const isHome = location.pathname === "/";
  const inWorkspace = location.pathname === "/app";

  return (
    <div className={isHome ? "platform-layout is-home" : "platform-layout"}>
      <SiteHeader
        current={isHome ? "home" : inWorkspace ? "workspace" : "browse"}
        showWallet={!inWorkspace || Boolean(session)}
      />
      <Outlet />
      <SiteFooter />
    </div>
  );
}
