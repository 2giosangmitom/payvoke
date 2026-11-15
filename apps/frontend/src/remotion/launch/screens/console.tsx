import { memo, type ReactNode } from "react";
import { NetworkAvalancheFuji } from "@web3icons/react";
import {
  Activity,
  Blocks,
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  House,
  KeyRound,
  MessagesSquare,
  Moon,
  PanelLeft,
  Plus,
  Search,
  Store,
  Wallet,
} from "lucide-react";
import { AgentAvatar } from "@/src/features/apps/agent-avatar";
import { cn } from "@/src/lib/utils";
import { wallet } from "@/src/remotion/launch/mock";

export const Logo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 28 28" fill="none" aria-hidden className={className}>
    <g transform="rotate(-8 14 14)" fill="#509475">
      <path d="M3 3h6v6H3zM19 3h6v6h-6zM3 19h6v6H3zM19 19h6v6h-6z" />
      <path d="M11 3h6v6h-6zM3 11h6v6H3zM19 11h6v6h-6zM11 19h6v6h-6z" opacity=".18" />
      <path d="M11 11h6v6h-6z" fill="#bcd6cb" />
    </g>
  </svg>
);

// The signed-in console around every work screen: the icon rail, the
// breadcrumb bar and, for chat, the thread list. Copied from console-shell
// and the landing film.

const rail = [House, MessagesSquare, Activity, Wallet, KeyRound];
const build = [Blocks, CircleUserRound];

export const Rail = memo(function Rail({ active }: { active: number }) {
  return (
    <div className="flex w-14 shrink-0 flex-col items-center border-r border-sidebar-border bg-sidebar text-muted-foreground">
      <div className="grid h-12 place-items-center">
        <Logo className="size-6" />
      </div>
      <div className="grid gap-1.5 pt-2">
        {rail.map((Icon, index) => (
          <span
            key={index}
            className={cn(
              "relative grid size-9 place-items-center",
              index === active &&
                "text-foreground after:absolute after:inset-y-1 after:-right-2.5 after:w-px after:bg-primary",
            )}
          >
            <Icon size={18} strokeWidth={1.5} />
          </span>
        ))}
      </div>
      <span className="my-3 h-px w-5 bg-sidebar-border" />
      <div className="grid gap-1.5">
        {build.map((Icon, index) => (
          <span key={index} className="grid size-9 place-items-center">
            <Icon size={18} strokeWidth={1.5} />
          </span>
        ))}
      </div>
      <div className="mt-auto grid justify-items-center gap-3 pb-4">
        <Store size={18} strokeWidth={1.5} />
        <NetworkAvalancheFuji size={16} aria-hidden="true" />
      </div>
    </div>
  );
});

export const TopBar = memo(function TopBar({ section }: { section: string }) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
      <PanelLeft size={16} className="text-muted-foreground" />
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        Console <ChevronRight size={14} /> <span className="text-foreground">{section}</span>
      </span>
      <span className="ml-auto grid size-8 place-items-center text-muted-foreground">
        <Moon size={16} />
      </span>
      <span className="flex h-8 items-center gap-2 border border-border-strong px-3 font-mono text-xs">
        <span className="size-1.5 bg-primary" />
        {wallet}
        <ChevronDown size={14} className="text-muted-foreground" />
      </span>
    </div>
  );
});

export function ConsoleShell({
  section,
  active,
  children,
}: {
  section: string;
  active: number;
  children: ReactNode;
}) {
  return (
    <div className="absolute inset-0 flex">
      <Rail active={active} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar section={section} />
        <div className="relative flex min-h-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

const threads = [
  { title: "Doanh thu 2026", app: "CSV Analyst" },
  { title: "CV cho vị trí Data", app: "CV Mentor" },
  { title: "Review #482 auth flow", app: "PR Reviewer" },
  { title: "Hợp đồng v3 vs v4", app: "Contract Compare" },
  { title: "Docs sang tiếng Nhật", app: "Docs Translator" },
] as const;

export const ThreadList = memo(function ThreadList() {
  return (
    <div className="flex w-[260px] shrink-0 flex-col border-r border-border bg-background-deep p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-primary">Threads</p>
        <span className="flex h-7 items-center gap-1.5 border border-border-strong px-2.5 text-xs">
          <Plus size={14} /> New
        </span>
      </div>
      <span className="relative mt-4 mb-3 flex h-9 items-center gap-2 border border-input bg-background px-3 text-sm text-faint">
        <Search size={14} /> Search threads
      </span>
      <div className="grid gap-1">
        {threads.map((thread, index) => (
          <div
            key={thread.title}
            className={cn(
              "relative flex min-w-0 items-center gap-3 py-2.5 pr-2 pl-3",
              "before:absolute before:inset-y-1.5 before:left-0 before:w-px",
              index === 0 && "bg-card before:bg-primary",
            )}
          >
            <AgentAvatar name={thread.app} className="size-8 text-sm" />
            <span className="grid min-w-0 gap-1">
              <span className="truncate text-[13px] font-semibold">{thread.title}</span>
              <small className="flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground">
                <span className="size-1.5 shrink-0 bg-primary" />
                {thread.app}
              </small>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
});
