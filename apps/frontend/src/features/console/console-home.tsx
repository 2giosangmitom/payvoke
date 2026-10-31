import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, MessagesSquare, Sparkles } from "lucide-react";
import { BlurFade } from "@/src/components/ui/blur-fade";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  ErrorNotice,
  FiguresSkeleton,
  LoadingState,
  PageHeader,
  PageShell,
  errorMessage,
} from "@/src/components/layout/page-kit";
import { ActivityLink, StageBadge } from "@/src/features/activity/activity-page";
import { stageOf } from "@/src/features/activity/activity";
import { getActivity } from "@/src/features/activity/api";
import { AgentAvatar } from "@/src/features/apps/agent-avatar";
import { PersonAvatar, RatingLine, UsageLine } from "@/src/features/apps/agent-facts";
import { getStars, listStoreApps } from "@/src/features/apps/api";
import { authClient } from "@/src/features/auth/auth-client";
import { getThreads } from "@/src/features/chat/api";
import { getProfile, getStats } from "@/src/features/people/api";
import { AmountChart } from "@/src/features/stats/day-chart";
import { FigureStrip, sum } from "@/src/features/stats/earnings";
import { usdc } from "@/src/features/wallet/api";

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;
const toUsdc = (atomic: string) => Number(BigInt(atomic)) / 1_000_000;

function greeting(now = new Date()) {
  const hour = now.getHours();
  return hour < 5
    ? "Good evening"
    : hour < 12
      ? "Good morning"
      : hour < 18
        ? "Good afternoon"
        : "Good evening";
}

function Section({
  id,
  title,
  action,
  children,
  className,
}: {
  id: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={`grid content-start gap-3 ${className ?? ""}`}>
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

function MoreLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 hover:text-foreground">
      {children} <ArrowUpRight size={13} aria-hidden="true" />
    </Link>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="border border-dashed border-border-strong/60 px-3 py-2.5 text-sm text-muted-foreground">
      {children}
    </p>
  );
}

const firstSteps = [
  {
    to: "/store",
    title: "Find an agent",
    text: "Browse the store and open a chat. Chatting costs nothing.",
  },
  {
    to: "/console/wallet",
    title: "Check your wallet",
    text: "Accepting an offer pays from your USDC on Fuji, via the vault.",
  },
  {
    to: "/console/keys",
    title: "Connect your AI assistant",
    text: "Let Claude Code or another AI assistant hire with an API key.",
  },
  {
    to: "/console/studio",
    title: "Share your own agent",
    text: "List it in the store and get paid for each job.",
  },
] as const;

type Agent = { id: string; name: string; imageUrl: string | null };

// A compact agent row: picture, name and one line under it.
function AgentRow({ agent, children }: { agent: Agent; children?: ReactNode }) {
  return (
    <li className="border-b border-border last:border-b-0">
      <Link
        to="/store/$appId"
        params={{ appId: agent.id }}
        className="group flex items-center gap-3 py-2.5 transition-colors"
      >
        <AgentAvatar name={agent.name} imageUrl={agent.imageUrl} className="size-8 text-sm" />
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="truncate text-sm font-medium group-hover:text-primary">
            {agent.name}
          </span>
          {children}
        </span>
        <ArrowUpRight
          size={14}
          aria-hidden="true"
          className="shrink-0 text-faint transition-transform duration-200 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary"
        />
      </Link>
    </li>
  );
}

// The console's first screen answers "what needs me right now": jobs waiting
// on the buyer lead, then money, then work and chats in progress, then
// agents worth opening.
export function ConsoleHome() {
  const { data: session } = authClient.useSession();
  const user = session?.user.id;
  const profile = useQuery({ queryKey: ["account", "profile", user], queryFn: getProfile });
  const activity = useQuery({
    queryKey: ["account", user, "activity", "first"],
    queryFn: () => getActivity(),
    refetchInterval: 15_000,
  });
  const chats = useQuery({
    queryKey: ["threads", user, ""],
    queryFn: () => getThreads(""),
    staleTime: 10_000,
  });
  const stats = useQuery({
    queryKey: ["account", user, "stats"],
    queryFn: getStats,
    refetchInterval: 60_000,
  });
  const saved = useQuery({ queryKey: ["stars", user], queryFn: getStars, staleTime: 20_000 });
  const store = useQuery({
    // Not the store page's key: that one caches infinite-query pages.
    queryKey: ["store", "home"],
    queryFn: () => listStoreApps(),
    staleTime: 60_000,
  });

  const staged = (activity.data?.items ?? []).map((item) => ({ item, stage: stageOf(item) }));
  const attention = staged.filter(
    ({ stage }) => stage.tone === "attention" || stage.tone === "failed",
  );
  const running = staged.filter(({ stage }) => stage.tone === "active");
  const answer = attention.filter(({ item }) => item.executionStatus === "WAITING_BUYER").length;
  const review = attention.filter(({ stage }) => stage.label === "In review").length;
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
      : "All caught up. Nothing is waiting on you."
    : "Your jobs, results to review and recent chats.";
  const newcomer = chats.data?.items.length === 0 && activity.data?.items.length === 0;
  const buyer = stats.data?.buyer;
  const provider = stats.data?.provider;
  const savedIds = new Set((saved.data ?? []).map((item) => item.id));
  // Agents worth a look: the best rated the viewer hasn't saved.
  const discover = [...(store.data?.items ?? [])]
    .filter((app) => !savedIds.has(app.id) && app.availability === "AVAILABLE")
    .sort((a, b) => (b.rating.average ?? 0) - (a.rating.average ?? 0) || b.jobs - a.jobs)
    .slice(0, 4);

  return (
    <PageShell className="pt-2">
      <PageHeader
        compact
        title={
          <span className="flex items-center gap-3">
            {profile.data ? (
              <PersonAvatar person={profile.data} className="size-9 text-base" />
            ) : (
              <Skeleton className="size-9" />
            )}
            <span className="min-w-0 truncate">
              {greeting()}
              {profile.data?.displayName ? `, ${profile.data.displayName}` : ""}
            </span>
          </span>
        }
        description={finding}
        actions={
          <>
            <Button variant="outline" render={<Link to="/store" />}>
              <Sparkles /> Find agents
            </Button>
            <Button render={<Link to="/console/chat" />}>
              <MessagesSquare /> New chat
            </Button>
          </>
        }
      />
      <div className="grid gap-12 py-8">
        {newcomer && (
          <BlurFade>
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
          </BlurFade>
        )}

        <Section
          id="attention"
          title="Needs you"
          action={<MoreLink to="/console/activity">All activity</MoreLink>}
        >
          {activity.isPending ? (
            <LoadingState rows={2}>Loading jobs</LoadingState>
          ) : activity.isError ? (
            <ErrorNotice onRetry={() => void activity.refetch()}>
              {errorMessage(activity.error, "Couldn't load your jobs.")}
            </ErrorNotice>
          ) : attention.length === 0 ? (
            <Empty>Nothing needs you right now.</Empty>
          ) : (
            <ul className="grid border-y border-border">
              {attention.slice(0, 5).map(({ item, stage }) => (
                <li
                  key={item.invocationId}
                  className="flex items-center gap-3 border-b border-border py-3 last:border-b-0"
                >
                  <AgentAvatar
                    name={item.app.name}
                    imageUrl={item.app.imageUrl}
                    className="size-8 text-sm"
                  />
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <ActivityLink item={item}>
                      <span className="truncate font-medium">{item.app.name}</span>
                    </ActivityLink>
                    <span className="text-xs text-muted-foreground">{stage.detail}</span>
                  </div>
                  <span className="max-sm:hidden">
                    <StageBadge stage={stage} />
                  </span>
                  <span className="text-right font-mono text-sm tabular-nums">
                    {usdc(item.grossAmount)}
                    <span className="ml-1 text-xs text-muted-foreground">USDC</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          id="money"
          title="Your money"
          action={<MoreLink to="/console/wallet">Wallet</MoreLink>}
        >
          {stats.isPending ? (
            <FiguresSkeleton />
          ) : stats.isError || !buyer ? (
            <ErrorNotice onRetry={() => void stats.refetch()}>
              {errorMessage(stats.error, "Couldn't load your figures.")}
            </ErrorNotice>
          ) : (
            <FigureStrip
              figures={[
                {
                  label: "Held for jobs",
                  value: toUsdc(buyer.held),
                  unit: "USDC",
                  decimals: 2,
                  note: `${plural(running.length, "job")} running`,
                },
                {
                  label: "Paid to agents",
                  value: toUsdc(buyer.released),
                  unit: "USDC",
                  decimals: 2,
                },
                {
                  label: "Refunded to you",
                  value: toUsdc(buyer.refunded),
                  unit: "USDC",
                  decimals: 2,
                },
                { label: "Jobs hired", value: buyer.jobs, note: `${review} in review` },
              ]}
            />
          )}
        </Section>

        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Section id="spending" title="Spending, last 30 days">
            <div className="border border-border bg-card p-4">
              {buyer ? (
                <AmountChart series={buyer.series} label="Spent" />
              ) : (
                <Skeleton className="h-48" />
              )}
            </div>
          </Section>
          <Section id="top-agents" title="Agents you hire most">
            {!buyer ? (
              <LoadingState rows={3}>Loading agents</LoadingState>
            ) : buyer.topApps.length === 0 ? (
              <Empty>Agents you pay for show up here.</Empty>
            ) : (
              <ul className="grid border-y border-border">
                {buyer.topApps.map((app) => (
                  <AgentRow
                    key={app.id}
                    agent={{
                      id: app.id,
                      name: app.name,
                      imageUrl:
                        store.data?.items.find((item) => item.id === app.id)?.imageUrl ?? null,
                    }}
                  >
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">
                      {usdc(app.amount)} USDC
                    </span>
                  </AgentRow>
                ))}
              </ul>
            )}
          </Section>
        </div>

        {provider && (
          <Section
            id="earning"
            title="Your agents"
            action={<MoreLink to="/console/profile">Earnings</MoreLink>}
          >
            <div className="grid gap-4 border border-border bg-card p-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
              <dl className="grid content-start gap-4">
                <div className="grid gap-1">
                  <dt className="text-sm text-muted-foreground">Earned after fees</dt>
                  <dd className="font-mono text-3xl tabular-nums">
                    {usdc(sum(provider.released, provider.held))}
                    <span className="ml-1 text-sm text-muted-foreground">USDC</span>
                  </dd>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Paid jobs</dt>
                    <dd className="font-mono tabular-nums">{provider.jobs}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Users</dt>
                    <dd className="font-mono tabular-nums">{provider.users}</dd>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-self-start"
                  render={<Link to="/console/studio" />}
                >
                  Open Studio
                </Button>
              </dl>
              <AmountChart series={provider.series} label="Earned" className="h-40" />
            </div>
          </Section>
        )}

        <div className="grid gap-12 lg:grid-cols-2">
          <Section id="running" title="Running now">
            {activity.isPending ? (
              <LoadingState rows={2}>Loading jobs</LoadingState>
            ) : running.length === 0 ? (
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
            action={<MoreLink to="/console/chat">All chats</MoreLink>}
          >
            {chats.isPending ? (
              <LoadingState rows={3}>Loading chats</LoadingState>
            ) : (chats.data?.items.length ?? 0) === 0 ? (
              <Empty>No chats yet. Pick an agent in the store to start one.</Empty>
            ) : (
              <ul className="grid border-y border-border">
                {chats.data?.items.slice(0, 5).map((thread) => (
                  <li key={thread.id} className="border-b border-border last:border-b-0">
                    <Link
                      to="/console/chat/$threadId"
                      params={{ threadId: thread.id }}
                      className="flex items-center gap-3 py-2.5 hover:text-primary"
                    >
                      <AgentAvatar
                        name={thread.app.name}
                        imageUrl={thread.app.imageUrl}
                        className="size-7 text-xs"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {thread.title || thread.app.name}
                      </span>
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

        <div className="grid gap-12 lg:grid-cols-2">
          <Section id="saved" title="Saved agents" action={<MoreLink to="/store">Store</MoreLink>}>
            {saved.isPending ? (
              <LoadingState rows={3}>Loading saved agents</LoadingState>
            ) : (saved.data?.length ?? 0) === 0 ? (
              <Empty>Star an agent in the store to keep it here.</Empty>
            ) : (
              <ul className="grid border-y border-border">
                {saved.data!.slice(0, 5).map((app) => (
                  <AgentRow key={app.id} agent={app}>
                    <span className="truncate text-xs text-muted-foreground">
                      {app.description || "No description yet."}
                    </span>
                  </AgentRow>
                ))}
              </ul>
            )}
          </Section>
          <Section id="discover" title="Worth a look">
            {store.isPending ? (
              <LoadingState rows={3}>Loading agents</LoadingState>
            ) : discover.length === 0 ? (
              <Empty>No other agent is online right now.</Empty>
            ) : (
              <ul className="grid border-y border-border">
                {discover.map((app) => (
                  <AgentRow key={app.id} agent={app}>
                    <span className="flex flex-wrap items-center gap-x-3">
                      <RatingLine rating={app.rating} />
                      <UsageLine jobs={app.jobs} users={app.users} />
                    </span>
                  </AgentRow>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </PageShell>
  );
}
