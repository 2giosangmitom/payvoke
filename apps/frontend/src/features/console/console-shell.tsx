import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  Blocks,
  ChevronRight,
  House,
  MessagesSquare,
  Store,
  SquareTerminal,
} from "lucide-react";
import { NetworkAvalancheFuji } from "@web3icons/react";
import { BlurFade } from "@/src/components/ui/blur-fade";
import { Button } from "@/src/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/src/components/ui/sidebar";
import { Separator } from "@/src/components/ui/separator";
import { LoadingState } from "@/src/components/layout/page-kit";
import { ThemeToggle } from "@/src/components/layout/theme-select";
import { WalletAccess } from "@/src/features/auth/wallet-access";
import { authClient } from "@/src/features/auth/auth-client";

const workspace = [
  { to: "/console", label: "Home", icon: House, exact: true },
  { to: "/console/chat", label: "Chat", icon: MessagesSquare, exact: false },
  { to: "/console/activity", label: "Activity", icon: Activity, exact: false },
  { to: "/console/connect", label: "Coding agents", icon: SquareTerminal, exact: false },
] as const;
const build = [{ to: "/console/studio", label: "Studio", icon: Blocks, exact: false }] as const;

// Breadcrumb from the path: the console is shallow, so the section and
// whether the page sits below it are enough.
const crumbs: { prefix: string; label: string; to?: string }[] = [
  { prefix: "/console/chat", label: "Chat", to: "/console/chat" },
  { prefix: "/console/activity", label: "Activity", to: "/console/activity" },
  { prefix: "/console/connect", label: "Coding agents", to: "/console/connect" },
  { prefix: "/console/studio", label: "Studio", to: "/console/studio" },
];

function NavGroup({
  label,
  items,
  pathname,
}: {
  label: string;
  items: readonly { to: string; label: string; icon: typeof House; exact: boolean }[];
  pathname: string;
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            return (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton
                  isActive={active}
                  tooltip={item.label}
                  render={<Link to={item.to} aria-current={active ? "page" : undefined} />}
                >
                  <item.icon />
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

const gatePoints = [
  { icon: MessagesSquare, text: "Chats with the agents you hire" },
  { icon: Activity, text: "Every held payment and its next deadline" },
  { icon: Blocks, text: "Studio, for the agents you share" },
];

// The signed-in workspace: a collapsible sidebar (a sheet on mobile) and a
// thin top bar. No marketing header or footer, so pages get the full height.
export function ConsoleShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { data: session, isPending } = authClient.useSession();
  const section = crumbs.find(
    ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  const nested = section ? pathname.replace(/\/$/, "") !== section.prefix : false;

  return (
    <SidebarProvider className="h-dvh min-h-0">
      <Sidebar collapsible="icon">
        <SidebarHeader className="h-14 justify-center">
          <Link to="/" className="flex items-center gap-2.5 px-1.5" aria-label="Payvoke home">
            <img src="/logo.svg" alt="" aria-hidden="true" className="size-6 shrink-0" />
            <span className="text-xl leading-none font-bold tracking-[-0.065em] group-data-[collapsible=icon]:hidden">
              payvoke<span className="text-primary">.</span>
            </span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <NavGroup label="Workspace" items={workspace} pathname={pathname} />
          <NavGroup label="Build" items={build} pathname={pathname} />
          <SidebarGroup className="mt-auto">
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Store" render={<Link to="/store" />}>
                    <Store />
                    <span>Find agents</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="gap-1 border-t border-sidebar-border group-data-[collapsible=icon]:hidden">
          <p className="flex items-center gap-2 px-2 pt-1 text-xs text-muted-foreground">
            <NetworkAvalancheFuji size={14} aria-hidden="true" /> Avalanche Fuji testnet
          </p>
          <WalletAccess variant="header" />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="min-h-0 min-w-0">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-4">
          <SidebarTrigger aria-label="Toggle navigation" />
          <Separator
            orientation="vertical"
            className="mx-1 data-vertical:h-4 data-vertical:self-center"
          />
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
                {nested && section.to ? (
                  <Link
                    to={section.to}
                    className="truncate transition-colors hover:text-foreground"
                  >
                    {section.label}
                  </Link>
                ) : (
                  <span className="truncate font-medium text-foreground">{section.label}</span>
                )}
              </>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              className="hidden h-9 sm:inline-flex"
              render={<Link to="/store" />}
            >
              <Store /> Store
            </Button>
            <ThemeToggle />
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto *:[main]:flex-1">
          {isPending ? (
            <LoadingState className="px-8">Checking wallet session…</LoadingState>
          ) : session ? (
            children
          ) : (
            <main className="grid place-items-center px-6 py-16 sm:px-12">
              <BlurFade className="grid w-full max-w-md gap-6">
                <img src="/logo.svg" alt="" aria-hidden="true" className="size-10" />
                <div className="grid gap-3">
                  <h1 className="text-[clamp(1.75rem,3vw,2.25rem)] leading-tight font-semibold tracking-[-0.04em]">
                    Sign in to your console
                  </h1>
                  <p className="text-[15px] leading-6 text-muted-foreground">
                    Your chats, payments and shared agents belong to your wallet. Signing is free
                    and sends no transaction.
                  </p>
                </div>
                <ul className="grid gap-px bg-border">
                  {gatePoints.map((point) => (
                    <li
                      key={point.text}
                      className="flex items-center gap-3 bg-background px-1 py-3 text-[15px]"
                    >
                      <point.icon size={18} className="shrink-0 text-primary" aria-hidden="true" />
                      {point.text}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                  <WalletAccess variant="hero" label="Sign in" />
                  <Button size="lg" variant="ghost" render={<Link to="/store" />}>
                    Browse the store
                  </Button>
                </div>
              </BlurFade>
            </main>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
