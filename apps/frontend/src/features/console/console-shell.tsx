import type { CSSProperties, ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  Blocks,
  ChevronRight,
  House,
  KeyRound,
  MessagesSquare,
  Store,
  Wallet,
} from "lucide-react";
import { NetworkAvalancheFuji } from "@web3icons/react";
import { Button } from "@/src/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from "@/src/components/ui/sidebar";
import { LoadingState } from "@/src/components/layout/page-kit";
import { ThemeToggle } from "@/src/components/layout/theme-select";
import { WalletAccess } from "@/src/features/auth/wallet-access";
import { authClient } from "@/src/features/auth/auth-client";
import { cn } from "@/src/lib/utils";

type NavItem = { to: string; label: string; icon: typeof House; exact: boolean };

const workspace: NavItem[] = [
  { to: "/console", label: "Home", icon: House, exact: true },
  { to: "/console/chat", label: "Chat", icon: MessagesSquare, exact: false },
  { to: "/console/activity", label: "Activity", icon: Activity, exact: false },
  { to: "/console/wallet", label: "Wallet", icon: Wallet, exact: false },
  { to: "/console/keys", label: "API keys", icon: KeyRound, exact: false },
];
const build: NavItem[] = [{ to: "/console/studio", label: "Studio", icon: Blocks, exact: false }];

const isActive = (item: NavItem, pathname: string) =>
  item.exact ? pathname === item.to || pathname === `${item.to}/` : pathname.startsWith(item.to);

// The rail marks the open screen the way the whole console marks a selection:
// one 1px jade line, here on the rail's own edge, and the icon in full ink.
const railButton =
  "relative text-muted-foreground hover:bg-transparent hover:text-foreground data-active:bg-transparent data-active:font-normal data-active:text-foreground after:absolute after:inset-y-1 after:-right-2 after:w-px data-active:after:bg-primary";

function NavGroup({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu className="gap-1.5">
          {items.map((item) => {
            const active = isActive(item, pathname);
            return (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton
                  isActive={active}
                  tooltip={item.label}
                  className={railButton}
                  render={<Link to={item.to} aria-current={active ? "page" : undefined} />}
                >
                  <item.icon strokeWidth={1.5} />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

// Phones get the rail as a bottom bar of the five working screens.
function MobileNav({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Console"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-background md:hidden"
    >
      {workspace.map((item) => {
        const active = isActive(item, pathname);
        return (
          <Link
            key={item.to}
            to={item.to}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative grid h-14 place-items-center content-center gap-1 text-[11px]",
              active ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <item.icon size={18} strokeWidth={1.5} aria-hidden />
            {item.label === "API keys" ? "Keys" : item.label}
            {active && <span aria-hidden className="absolute inset-x-4 top-0 h-px bg-primary" />}
          </Link>
        );
      })}
    </nav>
  );
}

const sections = [...workspace.slice(1), ...build];

function SignInGate() {
  return (
    <main className="grid place-items-center px-6 py-16 sm:px-12">
      <div className="grid w-full max-w-md gap-6">
        <img src="/logo.svg" alt="" aria-hidden="true" className="size-9" />
        <div className="grid gap-3">
          <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em]">
            Sign in to your console
          </h1>
          <p className="text-[15px] leading-6 text-muted-foreground">
            Your chats, payments, keys and shared agents belong to your wallet. Signing is free and
            sends no transaction.
          </p>
        </div>
        <dl className="grid border-y border-border text-sm">
          {[
            ["Chat", "Hire agents and answer what they ask"],
            ["Wallet", "Every payment the vault holds for you"],
            ["API keys", "Let coding agents hire on your behalf"],
          ].map(([term, text]) => (
            <div
              key={term}
              className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 border-b border-border py-3 last:border-b-0"
            >
              <dt className="font-medium">{term}</dt>
              <dd className="text-muted-foreground">{text}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap gap-2">
          <WalletAccess variant="hero" label="Sign in" />
          <Button size="lg" variant="ghost" render={<Link to="/store" />}>
            Browse the store
          </Button>
        </div>
      </div>
    </main>
  );
}

// The signed-in workspace: an icon rail on the page ground (labels on
// expand), a 48px top bar with the breadcrumb and the account, and the page.
export function ConsoleShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { data: session, isPending } = authClient.useSession();
  const section = sections.find((item) => isActive(item, pathname));
  const nested = section ? pathname.replace(/\/$/, "") !== section.to : false;

  return (
    <SidebarProvider
      defaultOpen={false}
      className="h-dvh min-h-0"
      style={{ "--sidebar-width": "13rem", "--sidebar-width-icon": "3.5rem" } as CSSProperties}
    >
      <Sidebar collapsible="icon" className="border-sidebar-border">
        <SidebarHeader className="h-12 justify-center">
          <Link to="/" className="flex items-center gap-2.5 px-1.5" aria-label="Payvoke home">
            <img src="/logo.svg" alt="" aria-hidden="true" className="size-6 shrink-0" />
            <span className="text-lg leading-none font-bold tracking-[-0.065em] group-data-[collapsible=icon]:hidden">
              payvoke<span className="text-primary">.</span>
            </span>
          </Link>
        </SidebarHeader>
        <SidebarContent className="pt-2">
          <NavGroup items={workspace} pathname={pathname} />
          <SidebarSeparator className="mx-auto w-5 group-data-[state=expanded]:w-auto" />
          <NavGroup items={build} pathname={pathname} />
          <SidebarGroup className="mt-auto">
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip="Find agents"
                    className={railButton}
                    render={<Link to="/store" />}
                  >
                    <Store strokeWidth={1.5} />
                    <span>Find agents</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="items-center pb-3 group-data-[state=expanded]:items-start">
          <span
            title="Avalanche Fuji testnet"
            className="flex items-center gap-2 px-2 text-xs text-muted-foreground"
          >
            <NetworkAvalancheFuji size={16} aria-label="Avalanche Fuji testnet" />
            <span className="group-data-[collapsible=icon]:hidden">Avalanche Fuji</span>
          </span>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-h-0 min-w-0">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-4">
          <SidebarTrigger aria-label="Toggle navigation" />
          <nav
            aria-label="Breadcrumb"
            className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground"
          >
            <Link to="/console" className="transition-colors hover:text-foreground">
              Console
            </Link>
            {section && (
              <>
                <ChevronRight size={14} aria-hidden="true" className="shrink-0" />
                {nested ? (
                  <Link
                    to={section.to}
                    className="truncate transition-colors hover:text-foreground"
                  >
                    {section.label}
                  </Link>
                ) : (
                  <span className="truncate text-foreground">{section.label}</span>
                )}
              </>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <WalletAccess variant="header" />
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto max-md:pb-14 *:[main]:flex-1">
          {isPending ? (
            <LoadingState className="px-8">Checking wallet session</LoadingState>
          ) : session ? (
            children
          ) : (
            <SignInGate />
          )}
        </div>
        {session && <MobileNav pathname={pathname} />}
      </SidebarInset>
    </SidebarProvider>
  );
}
