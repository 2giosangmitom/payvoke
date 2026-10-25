import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/lib/utils";
import { ThemeToggle } from "./theme-select";
import { WalletAccess } from "./wallet-access";

export type SiteSection = "home" | "store" | "chat" | "dashboard";

const navItems = [
  { section: "home", to: "/", label: "Home" },
  { section: "store", to: "/store", label: "Store" },
  { section: "chat", to: "/chat", label: "Chat" },
  { section: "dashboard", to: "/dashboard", label: "Studio" },
] as const;

function Brand({ small = false }: { small?: boolean }) {
  return (
    <Link to="/" className="inline-flex shrink-0 items-center gap-2.5" aria-label="Payvoke home">
      <img
        src="/logo.svg"
        alt=""
        aria-hidden="true"
        className={cn("block", small ? "size-6" : "size-7")}
      />
      <span className="text-[28px] leading-none font-bold tracking-[-0.065em]">
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
      <div className="container-page flex min-h-18 items-center justify-between gap-6">
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
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <WalletAccess />
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
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background-deep">
      <div className="container-page flex flex-col justify-between gap-10 py-12 sm:flex-row">
        <div>
          <Brand small />
          <p className="mt-4 max-w-72 text-sm leading-relaxed text-muted-foreground">
            Apps with slash commands, made by independent developers.
          </p>
        </div>
        <nav
          aria-label="Footer"
          className="flex flex-wrap items-start gap-6 text-[13px] text-muted-foreground"
        >
          <a href="/#how-it-works" className="hover:text-primary">
            How it works
          </a>
          {navItems.slice(1).map((item) => (
            <Link key={item.section} to={item.to} className="hover:text-primary">
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="container-page flex flex-col justify-between gap-2 border-t border-border py-6 text-xs leading-relaxed text-faint sm:flex-row">
        <span>© 2026 Payvoke</span>
        <span>Avalanche Fuji testnet. Paid runs are in development.</span>
      </div>
    </footer>
  );
}
