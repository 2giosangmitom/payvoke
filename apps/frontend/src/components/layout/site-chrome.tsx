import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { NetworkAvalancheFuji } from "@web3icons/react";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/lib/utils";
import { ThemeToggle } from "@/src/components/layout/theme-select";
import { WalletAccess } from "@/src/features/auth/wallet-access";
import { DiaTextReveal } from "@/src/components/ui/dia-text-reveal";

export type SiteSection = "home" | "store" | "docs";

// The public site only browses; chats, runs, payments and Studio live in the
// console. The landing's sections are linked by hash, from any public page.
const navItems = [
  { key: "store", label: "Store", to: "/store" },
  { key: "docs", label: "Docs", to: "/docs" },
  { key: "how-it-works", label: "How it works", to: "/", hash: "how-it-works" },
  { key: "agents", label: "AI assistants", to: "/", hash: "agents" },
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

const footerGroups = [
  {
    title: "Hire",
    links: [
      { to: "/store", label: "Store" },
      { to: "/console/chat", label: "Chats" },
      { to: "/console/keys", label: "API keys" },
    ],
  },
  {
    title: "Build",
    links: [
      { to: "/console/studio", label: "Studio" },
      { to: "/docs", label: "Docs" },
    ],
  },
] as const;

/** `clearDock` leaves room for the landing's music card in the bottom-left corner. */
export function SiteFooter({ clearDock = false }: { clearDock?: boolean }) {
  return (
    <footer
      className={cn(
        "container-page grid gap-12 pt-14 pb-8",
        // The landing ends on a full-bleed field, which already closes the page.
        clearDock ? "pb-24 sm:pb-20" : "mt-24 border-t border-border sm:mt-32",
      )}
    >
      <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-12 lg:gap-8">
        <div className="grid content-start gap-4 lg:col-span-5">
          <Brand small />
          <p className="max-w-sm text-[15px] leading-relaxed text-muted-foreground">
            A store for AI agents. You pay per job, and a vault on Avalanche holds the payment until
            the work arrives.
          </p>
        </div>
        {footerGroups.map((group) => (
          <nav
            key={group.title}
            aria-label={group.title}
            className="grid content-start gap-3 lg:col-span-2"
          >
            <span className="text-sm font-medium">{group.title}</span>
            {group.links.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="text-[15px] text-muted-foreground transition-colors duration-150 hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        ))}
        <div className="grid content-start gap-3 lg:col-span-3">
          <span className="text-sm font-medium">Network</span>
          <span className="flex items-center gap-2.5 text-[15px] text-muted-foreground">
            <NetworkAvalancheFuji size={22} aria-hidden="true" />
            Avalanche Fuji
          </span>
        </div>
      </div>

      {clearDock && (
        // The name, large, swept once by a jade band as it scrolls into view.
        <DiaTextReveal
          text="payvoke"
          colors={["var(--t-brand)", "var(--color-primary-soft)", "var(--t-brand)"]}
          textColor="var(--t-brand)"
          duration={1.8}
          className="-ml-[0.04em] block pb-[0.12em] text-[clamp(4.5rem,22.5vw,21rem)] leading-[0.9] font-bold tracking-[-0.07em] select-none"
        />
      )}

      <div className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground">
        <span>© 2026 Payvoke</span>
        <span>Built on Avalanche</span>
      </div>
    </footer>
  );
}
