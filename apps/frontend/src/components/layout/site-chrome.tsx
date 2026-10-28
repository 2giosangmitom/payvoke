import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/lib/utils";
import { ThemeToggle } from "@/src/components/layout/theme-select";
import { WalletAccess } from "@/src/features/auth/wallet-access";

export type SiteSection = "home" | "store";

// The public site only browses; chats, runs, payments and Studio live in the
// console. The landing's sections are linked by hash, from any public page.
const navItems = [
  { key: "store", label: "Store", to: "/store" },
  { key: "how-it-works", label: "How it works", to: "/", hash: "how-it-works" },
  { key: "agents", label: "Coding agents", to: "/", hash: "agents" },
  { key: "questions", label: "Questions", to: "/", hash: "questions" },
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
      <span className="text-[24px] leading-none font-bold tracking-[-0.065em]">
        payvoke<span className="text-primary">.</span>
      </span>
    </Link>
  );
}

export function SiteHeader({ current }: { current: SiteSection }) {
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const { scrollY } = useScroll();
  // The bar sits flat on the page at the top and gains its edge once the
  // page moves under it.
  useMotionValueEvent(scrollY, "change", (value) => setScrolled(value > 8));

  return (
    <header
      data-scrolled={scrolled || undefined}
      className="sticky top-0 z-40 border-b border-transparent bg-background transition-colors duration-200 data-scrolled:border-border"
      onKeyDown={(event) => {
        if (event.key === "Escape" && menu) {
          setMenu(false);
          toggleRef.current?.focus();
        }
      }}
    >
      <div className="container-page flex h-16 items-center gap-3 sm:gap-6">
        <Brand />
        <nav aria-label="Main navigation" className="ml-6 hidden items-center gap-1 lg:flex">
          {navItems.map((item) => (
            <Link
              key={item.key}
              to={item.to}
              hash={"hash" in item ? item.hash : undefined}
              aria-current={current === item.key ? "page" : undefined}
              className="relative px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:text-foreground"
            >
              {current === item.key && (
                <motion.span
                  layoutId="site-nav-current"
                  aria-hidden="true"
                  className="absolute inset-x-3 -bottom-[13px] h-0.5 bg-primary"
                />
              )}
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <ThemeToggle />
          <WalletAccess />
          <Button render={<Link to="/console" />} className="group hidden h-10 px-4 sm:inline-flex">
            Open console
            <ArrowUpRight className="transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Button>
          <Button
            ref={toggleRef}
            type="button"
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label={menu ? "Close menu" : "Open menu"}
            aria-expanded={menu}
            aria-controls="site-mobile-nav"
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>
      <AnimatePresence>
        {menu && (
          <motion.nav
            id="site-mobile-nav"
            aria-label="Mobile navigation"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-x-0 top-full z-30 border-b border-border bg-background pb-4 shadow-float lg:hidden"
          >
            {navItems.map((item) => (
              <Link
                key={item.key}
                to={item.to}
                hash={"hash" in item ? item.hash : undefined}
                onClick={() => setMenu(false)}
                aria-current={current === item.key ? "page" : undefined}
                className="container-page flex items-center justify-between py-3.5 text-lg font-medium aria-[current=page]:text-primary"
              >
                {item.label}
              </Link>
            ))}
            <div className="container-page mt-2 sm:hidden">
              <Button
                render={<Link to="/console" />}
                className="h-12 w-full"
                onClick={() => setMenu(false)}
              >
                Open console <ArrowUpRight />
              </Button>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
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
