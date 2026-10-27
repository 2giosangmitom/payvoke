import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { NetworkAvalancheFuji, TokenUSDC } from "@web3icons/react";
import { ArrowUp, ArrowUpRight, LayoutDashboard, Menu, X } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/src/components/ui/button";
import { RevealGroup, RevealItem, easeOut } from "@/src/components/ui/reveal";
import { cn } from "@/src/lib/utils";
import { ThemeToggle } from "./theme-select";
import { WalletAccess } from "./wallet-access";

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

const footerColumns = [
  {
    title: "Product",
    links: [
      { to: "/store", label: "Store" },
      { to: "/console/chat", label: "Chat" },
      { to: "/console/activity", label: "Activity" },
      { to: "/console/studio", label: "Studio" },
    ],
  },
  {
    title: "Learn",
    links: [
      { href: "/#marketplace", label: "What works today" },
      { href: "/#how-it-works", label: "How a request works" },
      { href: "/#providers", label: "For builders" },
    ],
  },
] as const;

const footerLink =
  "group inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary";

/** `clearDock` leaves room under the bottom bar for the landing's music card. */
export function SiteFooter({ clearDock = false }: { clearDock?: boolean }) {
  return (
    <footer className="relative overflow-hidden border-t border-border bg-background-deep">
      <div className="container-page grid gap-12 pt-16 pb-12 lg:grid-cols-[1.25fr_1fr] lg:gap-20 lg:pt-20">
        <RevealGroup stagger={0.08}>
          <RevealItem as="p" className="mb-4 eyebrow">
            Start here
          </RevealItem>
          <RevealItem
            as="p"
            className="max-w-lg text-[clamp(1.75rem,3.2vw,2.6rem)] leading-[1.1] font-medium tracking-[-0.045em] text-balance"
          >
            Find an app to call, or publish the one you built.
          </RevealItem>
          <RevealItem className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" render={<Link to="/store" />}>
              Browse the store <ArrowUpRight />
            </Button>
            <Button size="lg" variant="outline" render={<Link to="/console/studio" />}>
              Open Studio
            </Button>
          </RevealItem>
        </RevealGroup>

        <RevealGroup stagger={0.06} delay={0.1} className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {footerColumns.map((column) => (
            <RevealItem key={column.title} as="div">
              <h2 className="mb-4 font-mono text-[11px] tracking-widest text-faint uppercase">
                {column.title}
              </h2>
              <ul className="grid gap-3">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {"to" in link ? (
                      <Link to={link.to} className={footerLink}>
                        {link.label}
                      </Link>
                    ) : (
                      <a href={link.href} className={footerLink}>
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </RevealItem>
          ))}
          <RevealItem as="div" className="col-span-2 sm:col-span-1">
            <h2 className="mb-4 font-mono text-[11px] tracking-widest text-faint uppercase">
              Network
            </h2>
            <ul className="grid gap-3 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <NetworkAvalancheFuji size={16} aria-hidden="true" /> Avalanche Fuji
              </li>
              <li className="flex items-center gap-2">
                <TokenUSDC size={16} aria-hidden="true" /> USDC over x402
              </li>
              <li className="flex items-center gap-2">
                <span aria-hidden="true" className="size-1.5 animate-pulse bg-warning" />
                Paid runs in development
              </li>
            </ul>
          </RevealItem>
        </RevealGroup>
      </div>

      {/* The wordmark rises out of the bottom edge, one letter at a time. */}
      <div aria-hidden="true" className="container-page select-none">
        <motion.div
          initial="hidden"
          whileInView="shown"
          viewport={{ once: true, amount: 0.4 }}
          variants={{ hidden: {}, shown: { transition: { staggerChildren: 0.05 } } }}
          className="flex translate-y-[0.14em] justify-between text-[clamp(4.5rem,21vw,19rem)] leading-[0.8] font-bold tracking-[-0.07em] text-transparent [-webkit-text-stroke:1px_var(--color-border-strong)]"
        >
          {"payvoke.".split("").map((letter, index) => (
            <motion.span
              key={index}
              variants={{
                hidden: { y: "60%", opacity: 0 },
                shown: { y: 0, opacity: 1, transition: { duration: 0.8, ease: easeOut } },
              }}
              className={cn(
                "inline-block",
                letter === "." && "text-primary [-webkit-text-stroke:0]",
              )}
            >
              {letter}
            </motion.span>
          ))}
        </motion.div>
      </div>

      <div className="relative border-t border-border bg-background-deep">
        <div
          className={cn(
            "container-page flex flex-col gap-3 py-6 text-xs text-faint sm:flex-row sm:items-center sm:justify-between",
            clearDock && "pb-24 sm:pb-6 sm:pl-76",
          )}
        >
          <span className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="" aria-hidden="true" className="size-4" />© 2026 Payvoke
          </span>
          <span>Avalanche Fuji testnet. Paid runs are in development.</span>
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="inline-flex items-center gap-1.5 self-start hover:text-primary"
          >
            Back to top <ArrowUp size={13} />
          </button>
        </div>
      </div>
    </footer>
  );
}
