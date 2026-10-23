import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { WalletAccess } from "./wallet-access";
import { ThemeToggle } from "./theme-select";

type SiteSection = "home" | "browse" | "workspace";

function Mark({ small = false }: { small?: boolean }) {
  return (
    <img
      className={small ? "brand-mark brand-mark-small" : "brand-mark"}
      src="/logo.svg"
      alt=""
      aria-hidden="true"
    />
  );
}

export function SiteHeader({
  current,
  showWallet = true,
}: {
  current: SiteSection;
  showWallet?: boolean;
}) {
  const [menu, setMenu] = useState(false);

  return (
    <header
      className="site-header"
      onKeyDown={(event) => {
        if (event.key === "Escape" && menu) {
          setMenu(false);
          event.currentTarget.querySelector<HTMLButtonElement>(".mobile-menu-toggle")?.focus();
        }
      }}
    >
      <div className="header-inner page-container">
        <Link to="/" className="brand" aria-label="Payvoke home">
          <Mark />
          <span className="brand-word">
            payvoke<span className="brand-period">.</span>
          </span>
        </Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          <Link to="/" aria-current={current === "home" ? "page" : undefined}>
            Home
          </Link>
          <Link to="/agents" aria-current={current === "browse" ? "page" : undefined}>
            Browse agents
          </Link>
          <Link to="/app" aria-current={current === "workspace" ? "page" : undefined}>
            Workspace
          </Link>
        </nav>
        <div className="header-actions">
          <ThemeToggle />
          {showWallet && <WalletAccess />}
          <Button
            className="mobile-menu-toggle"
            type="button"
            variant="outline"
            size="icon"
            aria-label={menu ? "Close menu" : "Open menu"}
            aria-expanded={menu}
            aria-controls="site-mobile-nav"
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X size={23} /> : <Menu size={23} />}
          </Button>
        </div>
      </div>
      {menu && (
        <nav className="mobile-nav" id="site-mobile-nav" aria-label="Mobile navigation">
          <Link
            to="/"
            onClick={() => setMenu(false)}
            aria-current={current === "home" ? "page" : undefined}
          >
            Home <ArrowUpRight size={15} />
          </Link>
          <Link to="/agents" onClick={() => setMenu(false)}>
            Browse agents <ArrowUpRight size={15} />
          </Link>
          <Link to="/app" onClick={() => setMenu(false)}>
            Workspace <ArrowUpRight size={15} />
          </Link>
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="page-container footer-top">
        <div>
          <Link to="/" className="brand">
            <Mark small />
            <span className="brand-word">
              payvoke<span className="brand-period">.</span>
            </span>
          </Link>
          <p>A place for the tools you build and the ones you need.</p>
        </div>
        <div className="footer-links">
          <a href="/#overview">Overview</a>
          <Link to="/agents">Browse agents</Link>
          <a href="/#marketplace">Explore</a>
          <a href="/#providers">Providers</a>
          <Link to="/app">Workspace</Link>
        </div>
      </div>
      <div className="page-container footer-bottom">
        <span>© 2026 Payvoke</span>
        <span>Avalanche Fuji testnet. Paid runs are in development.</span>
      </div>
    </footer>
  );
}
