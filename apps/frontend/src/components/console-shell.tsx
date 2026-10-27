import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Activity, Blocks, House, MessagesSquare, Store } from "lucide-react";
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
} from "./ui/sidebar";
import { Separator } from "./ui/separator";
import { Eyebrow, LoadingState } from "./page-kit";
import { ThemeToggle } from "./theme-select";
import { WalletAccess } from "./wallet-access";
import { authClient } from "@/src/lib/auth-client";

const workspace = [
  { to: "/console", label: "Home", icon: House, exact: true },
  { to: "/console/chat", label: "Chat", icon: MessagesSquare, exact: false },
  { to: "/console/activity", label: "Activity", icon: Activity, exact: false },
] as const;
const build = [{ to: "/console/studio", label: "Studio", icon: Blocks, exact: false }] as const;

// Breadcrumb from the path: the console is shallow, so the section and
// whether the page sits below it are enough. Sections without a page of
// their own (a tool's form, a run) point at the list they belong to.
const crumbs: { prefix: string; label: string; to?: string }[] = [
  { prefix: "/console/chat", label: "Chat", to: "/console/chat" },
  { prefix: "/console/runs", label: "Activity", to: "/console/activity" },
  { prefix: "/console/run", label: "Run a tool" },
  { prefix: "/console/activity", label: "Activity", to: "/console/activity" },
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
        <SidebarHeader>
          <Link to="/" className="flex items-center gap-2.5 px-1.5 py-1" aria-label="Payvoke home">
            <img src="/logo.svg" alt="" aria-hidden="true" className="size-6 shrink-0" />
            <span className="text-xl leading-none font-bold tracking-[-0.065em] group-data-[collapsible=icon]:hidden">
              payvoke<span className="text-primary">.</span>
            </span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <NavGroup label="Workspace" items={workspace} pathname={pathname} />
          <NavGroup label="Build" items={build} pathname={pathname} />
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Store" render={<Link to="/store" />}>
                    <Store />
                    <span>Browse store</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="group-data-[collapsible=icon]:hidden">
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <WalletAccess />
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="min-h-0 min-w-0">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-4">
          <SidebarTrigger aria-label="Toggle navigation" />
          <Separator orientation="vertical" className="mx-1 h-4" />
          <nav
            aria-label="Breadcrumb"
            className="flex min-w-0 items-center gap-2 font-mono text-[11px] text-muted-foreground"
          >
            <Link to="/console" className="hover:text-primary">
              Console
            </Link>
            {section && (
              <>
                <span aria-hidden="true">›</span>
                {nested && section.to ? (
                  <Link to={section.to} className="truncate hover:text-primary">
                    {section.label}
                  </Link>
                ) : (
                  <span className="truncate text-foreground">{section.label}</span>
                )}
              </>
            )}
          </nav>
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto *:[main]:flex-1">
          {isPending ? (
            <LoadingState className="px-8">Checking wallet session…</LoadingState>
          ) : session ? (
            children
          ) : (
            <main className="grid place-content-center gap-4 px-6 py-16 sm:px-12">
              <Eyebrow>Console</Eyebrow>
              <h1 className="max-w-lg text-[clamp(2rem,4vw,3rem)] leading-tight font-medium tracking-[-0.05em]">
                Sign in to open your console.
              </h1>
              <p className="max-w-lg leading-7 text-muted-foreground">
                Chats, tool runs, payments and the apps you publish belong to your wallet.
              </p>
              <div>
                <WalletAccess variant="hero" label="Connect wallet" />
              </div>
            </main>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
