import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, LayoutDashboard, Menu, X } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/lib/utils";
import { ThemeToggle } from "@/src/components/layout/theme-select";
import { WalletAccess } from "@/src/features/auth/wallet-access";

export type SiteSection = "home" | "store";

// The public site only browses; chats, runs, payments and Studio live in the console.
const navItems = [
  { section: "home", to: "/", label: "Home" },
  { section: "store", to: "/store", label: "Store" },
] as const;

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <Link to="/" className="inline-flex shrink-0 items-center gap-2.5" aria-label="Payvoke home">
      <img
        src="/logo.svg"
        alt=""
        aria-hidden="true"
        className={cn("block", small ? "size-6" : "size-7")}
      />
      <span className="text-[24px] leading-none font-bold tracking-[-0.065em] min-[360px]:text-[28px]">
        payvoke<span className="text-primary">.</span>
      </span>
    </Link>
  );
}

export function SiteHeader({ current }: { current: SiteSection }) {
  const [menu, setMenu] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  return (
    <header
      className="relative z-20 border-b border-border bg-background"
      onKeyDown={(event) => {
        if (event.key === "Escape" && menu) {
          setMenu(false);
          toggleRef.current?.focus();
        }
      }}
    >
      <div className="container-page flex min-h-18 items-center justify-between gap-3 sm:gap-6">
        <Brand />
        <nav aria-label="Main navigation" className="ml-auto hidden items-center gap-6 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.section}
              to={item.to}
              aria-current={current === item.section ? "page" : undefined}
              className="text-[13px] font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-primary aria-[current=page]:text-primary aria-[current=page]:underline aria-[current=page]:underline-offset-[6px]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1.5 min-[360px]:gap-3">
          <ThemeToggle />
          <WalletAccess />
          <Button render={<Link to="/console" />} className="hidden sm:inline-flex">
            <LayoutDashboard /> Console
          </Button>
          <Button
            ref={toggleRef}
            type="button"
            variant="outline"
            size="icon"
            className="md:hidden"
            aria-label={menu ? "Close menu" : "Open menu"}
            aria-expanded={menu}
            aria-controls="site-mobile-nav"
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>
      {menu && (
        <nav
          id="site-mobile-nav"
          aria-label="Mobile navigation"
          className="absolute inset-x-0 top-full z-30 border-b border-border bg-background shadow-float animate-in fade-in-0 slide-in-from-top-2 md:hidden"
        >
          {navItems.map((item) => (
            <Link
              key={item.section}
              to={item.to}
              onClick={() => setMenu(false)}
              aria-current={current === item.section ? "page" : undefined}
              className="container-page flex items-center justify-between border-b border-border py-4 text-base font-medium last:border-b-0 aria-[current=page]:text-primary"
            >
              {item.label} <ArrowUpRight size={15} />
            </Link>
          ))}
          <Link
            to="/console"
            onClick={() => setMenu(false)}
            className="container-page flex items-center justify-between py-4 text-base font-medium text-primary"
          >
            Open console <ArrowUpRight size={15} />
          </Link>
        </nav>
      )}
    </header>
  );
}

const footerLinks = [
  { to: "/store", label: "Store" },
  { to: "/console/chat", label: "Chats" },
  { to: "/console/studio", label: "Studio" },
] as const;

/** `clearDock` leaves room for the landing's music card in the bottom-left corner. */
export function SiteFooter({ clearDock = false }: { clearDock?: boolean }) {
  return (
    <footer
      className={cn(
        "container-page grid gap-2 pt-24 pb-8 text-sm text-muted-foreground sm:grid-cols-[1fr_auto_1fr] sm:items-baseline sm:gap-6 sm:pt-32",
        clearDock && "pb-24 sm:pb-20",
      )}
    >
      <span>Payvoke, AI agents for hire on Avalanche</span>
      <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
        {footerLinks.map((link) => (
          <Link key={link.to} to={link.to} className="text-foreground hover:text-primary">
            {link.label}
          </Link>
        ))}
      </nav>
      <span className="sm:text-right">© 2026 · Avalanche Fuji testnet</span>
    </footer>
  );
}
