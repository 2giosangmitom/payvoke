import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, MessagesSquare } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  ErrorNotice,
  LoadingState,
  PageHeader,
  PageShell,
  errorMessage,
} from "@/src/components/layout/page-kit";
import { ActivityLink, StageBadge } from "@/src/features/activity/activity-page";
import { stageOf } from "@/src/features/activity/activity";
import { getActivity } from "@/src/features/activity/api";
import { authClient } from "@/src/features/auth/auth-client";
import { getThreads } from "@/src/features/chat/api";
import { getWallet, usdc } from "@/src/features/wallet/api";

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

function Section({
  id,
  title,
  action,
  children,
}: {
  id: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="grid content-start gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id={id} className="text-lg font-medium">
          {title}
        </h2>
        {action && <div className="text-sm text-muted-foreground">{action}</div>}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="border border-dashed border-border-strong/60 px-3 py-2.5 text-sm text-muted-foreground">
      {children}
    </p>
  );
}

// One divided strip: label over value, figures in tabular mono, no icons.
function Figures({ cells }: { cells: { label: string; value: ReactNode; unit?: string }[] }) {
  return (
    <dl className="grid grid-cols-2 border border-border bg-card sm:grid-cols-4 [&>div]:border-border max-sm:[&>div:nth-child(-n+2)]:border-b sm:[&>div:not(:last-child)]:border-r max-sm:[&>div:nth-child(odd)]:border-r">
      {cells.map((cell) => (
        <div key={cell.label} className="grid gap-1 px-4 py-3.5">
          <dt className="text-sm text-muted-foreground">{cell.label}</dt>
          <dd className="font-mono text-2xl tabular-nums">
            {cell.value}
            {cell.unit && <span className="ml-1 text-sm text-muted-foreground">{cell.unit}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const firstSteps = [
  {
    to: "/store",
    title: "Find an agent",
    text: "Browse the store and open a chat. Chatting is free.",
  },
  {
    to: "/console/wallet",
    title: "Check your wallet",
    text: "USDC on Fuji pays the vault when you accept an offer.",
  },
  {
    to: "/console/keys",
    title: "Connect a coding agent",
    text: "Let Claude Code hire through your access token.",
  },
  {
    to: "/console/studio",
    title: "Share your own agent",
    text: "List it in the store and get paid per job.",
  },
] as const;

// The console's first screen answers "what needs me right now": jobs waiting
// on the buyer lead, then money in flight, then work and chats in progress.
export function ConsoleHome() {
  const { data: session } = authClient.useSession();
  const activity = useQuery({
    queryKey: ["account", session?.user.id, "activity", "first"],
    queryFn: () => getActivity(),
    refetchInterval: 15_000,
  });
  const chats = useQuery({
    queryKey: ["threads", session?.user.id, ""],
    queryFn: () => getThreads(""),
    staleTime: 10_000,
  });
  const wallet = useQuery({
    queryKey: ["account", session?.user.id, "wallet"],
    queryFn: getWallet,
    refetchInterval: 30_000,
  });
  const staged = (activity.data?.items ?? []).map((item) => ({ item, stage: stageOf(item) }));
  const attention = staged.filter(
    ({ stage }) => stage.tone === "attention" || stage.tone === "failed",
  );
  const running = staged.filter(({ stage }) => stage.tone === "active");
  const answer = attention.filter(({ item }) => item.executionStatus === "WAITING_BUYER").length;
  const review = attention.filter(({ stage }) => stage.label === "In review").length;
  const held = wallet.data ? usdc(wallet.data.buyer.held.amount) : null;
  const finding = activity.data
    ? attention.length
      ? [
          answer && `${plural(answer, "job")} waiting for your answer`,
          review && `${plural(review, "result")} in review`,
          attention.length - answer - review > 0 &&
            `${plural(attention.length - answer - review, "other job")} to look at`,
        ]
          .filter(Boolean)
          .join(" · ")
      : "Nothing waits for you."
    : "Results to review, jobs in progress and your recent chats.";
  const newcomer = chats.data?.items.length === 0 && activity.data?.items.length === 0;

  return (
    <PageShell className="pt-2">
      <PageHeader
        compact
        title="Home"
        description={finding}
        actions={
          <Button render={<Link to="/console/chat" />}>
            <MessagesSquare /> New chat
          </Button>
        }
      />
      <div className="grid gap-12 py-8">
        {newcomer && (
          <section aria-label="Getting started">
            <ul className="grid border border-border sm:grid-cols-2 lg:grid-cols-4">
              {firstSteps.map((step) => (
                <li
                  key={step.to}
                  className="border-border not-last:border-b sm:max-lg:nth-[odd]:border-r lg:not-last:border-r lg:not-last:border-b-0"
                >
                  <Link
                    to={step.to}
                    className="group grid h-full gap-1 p-4 transition-colors hover:bg-muted/50"
                  >
                    <span className="flex items-center justify-between gap-2 font-medium">
                      {step.title}
                      <ArrowUpRight
                        size={14}
                        className="text-muted-foreground group-hover:text-foreground"
                        aria-hidden
                      />
                    </span>
                    <span className="text-sm text-muted-foreground">{step.text}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <Section
          id="attention"
          title="Needs you"
          action={
            <Link to="/console/activity" className="hover:text-foreground">
              All activity
            </Link>
          }
        >
          {activity.isPending ? (
            <LoadingState className="py-4">Loading jobs</LoadingState>
          ) : activity.isError ? (
            <ErrorNotice onRetry={() => void activity.refetch()}>
              {errorMessage(activity.error, "Couldn't load your jobs.")}
            </ErrorNotice>
          ) : attention.length === 0 ? (
            <Empty>
              Nothing waits for you. Questions, results to review and refunds show here.
            </Empty>
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">Jobs that need you</caption>
              <tbody>
                {attention.slice(0, 5).map(({ item, stage }) => (
                  <tr key={item.invocationId} className="border-t border-border last:border-b">
                    <td className="py-3 pr-4">
                      <ActivityLink item={item}>
                        <span className="font-medium">{item.app.name}</span>
                      </ActivityLink>
                      <span className="block text-xs text-muted-foreground">{stage.detail}</span>
                    </td>
                    <td className="py-3 pr-4 max-sm:hidden">
                      <StageBadge stage={stage} />
                    </td>
                    <td className="py-3 text-right font-mono tabular-nums">
                      {usdc(item.grossAmount)}
                      <span className="ml-1 text-xs text-muted-foreground">USDC</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section
          id="money"
          title="Money in flight"
          action={
            <Link to="/console/wallet" className="hover:text-foreground">
              Wallet
            </Link>
          }
        >
          {wallet.isError ? (
            <ErrorNotice onRetry={() => void wallet.refetch()}>
              {errorMessage(wallet.error, "Couldn't load your wallet.")}
            </ErrorNotice>
          ) : (
            <Figures
              cells={[
                { label: "Held for jobs", value: held ?? "…", unit: "USDC" },
                { label: "Running", value: activity.data ? running.length : "…" },
                { label: "In review", value: activity.data ? review : "…" },
                {
                  label: "Released to agents",
                  value: wallet.data ? usdc(wallet.data.buyer.released.amount) : "…",
                  unit: "USDC",
                },
              ]}
            />
          )}
        </Section>

        <div className="grid gap-12 lg:grid-cols-2">
          <Section id="running" title="Running now">
            {running.length === 0 ? (
              <Empty>No paid job is running.</Empty>
            ) : (
              <ul className="grid border-y border-border">
                {running.slice(0, 5).map(({ item, stage }) => (
                  <li
                    key={item.invocationId}
                    className="flex items-baseline justify-between gap-3 border-b border-border py-3 last:border-b-0"
                  >
                    <ActivityLink item={item}>
                      <span className="text-sm">{item.app.name}</span>
                    </ActivityLink>
                    <span className="text-xs text-muted-foreground">{stage.detail}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section
            id="chats"
            title="Recent chats"
            action={
              <Link to="/console/chat" className="hover:text-foreground">
                All chats
              </Link>
            }
          >
            {chats.isPending ? (
              <LoadingState className="py-4">Loading chats</LoadingState>
            ) : (chats.data?.items.length ?? 0) === 0 ? (
              <Empty>No chats yet. Pick an agent in the store to start one.</Empty>
            ) : (
              <ul className="grid border-y border-border">
                {chats.data?.items.slice(0, 5).map((thread) => (
                  <li key={thread.id} className="border-b border-border last:border-b-0">
                    <Link
                      to="/console/chat/$threadId"
                      params={{ threadId: thread.id }}
                      className="flex items-baseline justify-between gap-3 py-3 hover:text-primary"
                    >
                      <span className="truncate text-sm">{thread.title || thread.app.name}</span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                        {new Date(thread.lastMessageAt).toLocaleDateString()}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </PageShell>
  );
}
