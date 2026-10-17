import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronRightIcon, MenuIcon, MessageSquareIcon, StoreIcon, UploadIcon } from "lucide-react";
import { Button } from "~/components/ui/button";
import { SignInDialog } from "~/components/sign-in-dialog";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "~/components/ui/dialog";

const navigation = [
  { to: "/", label: "Agent Store", icon: StoreIcon },
  { to: "/workspace", label: "Workspaces", icon: MessageSquareIcon },
  { to: "/provider", label: "Provider console", icon: UploadIcon },
] as const;
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [open, setOpen] = useState(false);
  const workspace = pathname.startsWith("/workspace");
  const section = pathname.startsWith("/provider")
    ? "Provider console"
    : workspace
      ? "Workspace"
      : pathname.startsWith("/agents/")
        ? "Agent details"
        : "Agent Store";
  function Sidebar({ mobile = false }: { mobile?: boolean }) {
    return (
      <div className="market-sidebar-content">
        <Link to="/" className="market-brand" onClick={() => setOpen(false)}>
          AgentNe<span>.</span>
        </Link>
        <div className="market-sidebar-body">
          <p className="market-nav-label">MARKETPLACE</p>
          <nav
            className="market-navigation"
            aria-label={mobile ? "Mobile navigation" : "Main navigation"}
          >
            {navigation.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                aria-current={
                  (
                    to === "/"
                      ? section === "Agent Store" || section === "Agent details"
                      : pathname.startsWith(to)
                  )
                    ? "page"
                    : undefined
                }
                onClick={() => setOpen(false)}
              >
                <Icon aria-hidden="true" />
                <span>{label}</span>
              </Link>
            ))}
          </nav>
          <p className="market-sidebar-note">
            Purpose-built agents.
            <br />
            Clear boundaries.
          </p>
        </div>
        <div className="market-account">
          <SignInDialog />
        </div>
      </div>
    );
  }
  return (
    <div className={`market-shell ${workspace ? "market-shell--workspace" : ""}`}>
      <a href="#main-content" className="market-skip-link">
        Skip to content
      </a>
      <aside className="market-sidebar">
        <Sidebar />
      </aside>
      <div className="market-main">
        <header className="market-topbar">
          <div className="flex min-w-0 items-center gap-3">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="market-menu-button"
                    aria-label="Open navigation"
                  />
                }
              >
                <MenuIcon />
              </DialogTrigger>
              <DialogContent className="market-mobile-navigation" showCloseButton={false}>
                <DialogTitle className="sr-only">Navigation</DialogTitle>
                <Sidebar mobile />
              </DialogContent>
            </Dialog>
            <div className="market-breadcrumb">
              <span>AgentNe</span>
              <ChevronRightIcon aria-hidden="true" />
              <span>{section}</span>
            </div>
          </div>
          <div className="market-header-actions">
            <span className="market-caption">Development</span>
            <Button
              nativeButton={false}
              variant="outline"
              size="sm"
              render={<Link to="/provider" />}
            >
              Publish an agent
            </Button>
          </div>
        </header>
        <main id="main-content" className="market-content">
          {children}
        </main>
      </div>
    </div>
  );
}
