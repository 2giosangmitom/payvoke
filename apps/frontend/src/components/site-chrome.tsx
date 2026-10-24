import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { WalletAccess } from "./wallet-access";
import { ThemeToggle } from "./theme-select";

type SiteSection = "home" | "store" | "chat" | "dashboard";

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
          <Link to="/store" aria-current={current === "store" ? "page" : undefined}>
            Store
          </Link>
          <Link to="/chat" aria-current={current === "chat" ? "page" : undefined}>
            Chat
          </Link>
          <Link to="/dashboard" aria-current={current === "dashboard" ? "page" : undefined}>
            Studio
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
          <Link
            to="/store"
            onClick={() => setMenu(false)}
            aria-current={current === "store" ? "page" : undefined}
          >
            Store <ArrowUpRight size={15} />
          </Link>
          <Link
            to="/chat"
            onClick={() => setMenu(false)}
            aria-current={current === "chat" ? "page" : undefined}
          >
            Chat <ArrowUpRight size={15} />
          </Link>
          <Link
            to="/dashboard"
            onClick={() => setMenu(false)}
            aria-current={current === "dashboard" ? "page" : undefined}
          >
            Studio <ArrowUpRight size={15} />
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
          <p>A place for the apps you build and the ones you need.</p>
        </div>
        <div className="footer-links">
          <a href="/#overview">Overview</a>
          <Link to="/store">Store</Link>
          <Link to="/chat">Chat</Link>
          <Link to="/dashboard">Studio</Link>
        </div>
      </div>
      <div className="page-container footer-bottom">
        <span>© 2026 Payvoke</span>
        <span>Avalanche Fuji testnet. Paid runs are in development.</span>
      </div>
    </footer>
  );
}
