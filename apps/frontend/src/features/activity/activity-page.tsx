import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Search } from "lucide-react";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { Spinner } from "@/src/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import {
  EmptyState,
  ErrorNotice,
  FiguresSkeleton,
  LoadingState,
  PageHeader,
  PageShell,
  errorMessage,
} from "@/src/components/layout/page-kit";
import { authClient } from "@/src/features/auth/auth-client";
import { relative, stageOf, type Stage } from "@/src/features/activity/activity";
import { AgentAvatar } from "@/src/features/apps/agent-avatar";
import { getStats } from "@/src/features/people/api";
import { FigureStrip } from "@/src/features/stats/earnings";
import { formatUsdc } from "@/src/features/apps/format";
import { getActivity, type ActivityItem } from "@/src/features/activity/api";
import { cn } from "@/src/lib/utils";

const toUsdc = (atomic: string) => Number(BigInt(atomic)) / 1_000_000;

const FILTERS = [
  ["all", "All"],
  ["attention", "Needs attention"],
  ["active", "In progress"],
  ["done", "Settled"],
] as const;
type Filter = (typeof FILTERS)[number][0];

// Pale pills: grey for what simply runs or settled, colour only where the
// buyer has to act or something failed.
const toneClass: Record<Stage["tone"], string> = {
  active: "border-transparent bg-muted text-foreground",
  attention: "border-warning/40 bg-warning/10 text-warning",
  done: "border-border text-muted-foreground",
  failed: "border-transparent bg-destructive-soft text-destructive",
};

// Every paid run opens the chat thread it came from.
export function ActivityLink({
  item,
  children,
}: {
  item: ActivityItem;
  children: React.ReactNode;
}) {
  return (
    <Link
      to="/console/chat/$threadId"
      params={{ threadId: item.threadId }}
      className="hover:text-primary"
    >
      {children}
    </Link>
  );
}

export function StageBadge({ stage }: { stage: Stage }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-6 flex-none px-2 font-sans text-xs tracking-normal whitespace-nowrap normal-case",
        toneClass[stage.tone],
      )}
    >
      {stage.label}
    </Badge>
  );
}

// Every paid request with its hold state and the deadline that matters next.
export function ActivityPage() {
  const { data: session } = authClient.useSession();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const stats = useQuery({
    queryKey: ["account", session?.user.id, "stats"],
    queryFn: getStats,
    refetchInterval: 60_000,
  });
  const activity = useInfiniteQuery({
    queryKey: ["account", session?.user.id, "activity"],
    queryFn: ({ pageParam }) => getActivity(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    refetchInterval: 15_000,
  });
  const items = (activity.data?.pages ?? []).flatMap((page) => page.items);
  const staged = items.map((item) => ({ item, stage: stageOf(item) }));
  const matches = (value: Filter, tone: Stage["tone"]) =>
    value === "all" || tone === value || (value === "attention" && tone === "failed");
  const needle = search.trim().toLowerCase();
  const rows = staged.filter(
    ({ item, stage }) =>
      matches(filter, stage.tone) &&
      (!needle ||
        item.app.name.toLowerCase().includes(needle) ||
        (item.commandName ?? "").toLowerCase().includes(needle)),
  );

  return (
    <PageShell className="pt-2">
      <PageHeader
        compact
        title="Activity"
        description="Every job you paid for: running, in review or reclaimable."
      />
      <div className="mt-6">
        {stats.data ? (
          <FigureStrip
            figures={[
              { label: "Jobs hired", value: stats.data.buyer.jobs },
              {
                label: "Held now",
                value: toUsdc(stats.data.buyer.held),
                unit: "USDC",
                decimals: 2,
              },
              {
                label: "Paid to agents",
                value: toUsdc(stats.data.buyer.released),
                unit: "USDC",
                decimals: 2,
              },
              {
                label: "Refunded",
                value: toUsdc(stats.data.buyer.refunded),
                unit: "USDC",
                decimals: 2,
              },
            ]}
          />
        ) : (
          <FiguresSkeleton />
        )}
      </div>
      <div className="mt-8 flex flex-col gap-3 border-b border-border sm:flex-row sm:items-end sm:justify-between">
        <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
          <TabsList variant="line" aria-label="Filter activity" className="h-10 gap-4 px-0">
            {FILTERS.map(([value, label]) => (
              <TabsTrigger
                key={value}
                value={value}
                className="px-0 group-data-horizontal/tabs:after:bottom-[-4px] after:bg-primary"
              >
                {label}
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {staged.filter(({ stage }) => matches(value, stage.tone)).length}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <label className="relative mb-2 sm:w-64">
          <Search
            size={15}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint"
          />
          <span className="sr-only">Search by agent or command</span>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search agent or command"
            className="h-9 pl-9"
          />
        </label>
      </div>
      <section className="mt-6" aria-label="Payments">
        {activity.isPending ? (
          <LoadingState rows={6}>Loading activity</LoadingState>
        ) : activity.isError ? (
          <ErrorNotice onRetry={() => void activity.refetch()}>
            {errorMessage(activity.error, "Could not load activity.")}
          </ErrorNotice>
        ) : rows.length === 0 ? (
          <EmptyState
            eyebrow={items.length ? "Nothing here" : "No payments yet"}
            title={items.length ? "No request matches this filter." : "Nothing paid yet."}
            action={<Button render={<Link to="/store" />}>Browse the store</Button>}
          >
            Paid tool runs and accepted agent offers show up here with their deadlines.
          </EmptyState>
        ) : (
          <>
            {/* Cards on small screens, a table from md up. */}
            <ul className="grid gap-2 md:hidden">
              {rows.map(({ item, stage }) => (
                <li key={item.invocationId} className="grid gap-2 border border-border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <ActivityLink item={item}>
                      <span className="flex min-w-0 items-center gap-2.5">
                        <AgentAvatar
                          name={item.app.name}
                          imageUrl={item.app.imageUrl}
                          className="size-7 text-xs"
                        />
                        <strong className="font-medium break-words">{item.app.name}</strong>
                      </span>
                    </ActivityLink>
                    <StageBadge stage={stage} />
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatUsdc(item.grossAmount)} ·{" "}
                    {item.commandName ? `/${item.commandName}` : ""}
                  </span>
                  <span className="text-xs text-faint">{stage.detail}</span>
                </li>
              ))}
            </ul>
            <Table className="hidden md:table">
              <TableHeader>
                <TableRow>
                  <TableHead>App</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Next</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead className="sr-only">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ item, stage }) => (
                  <TableRow key={item.invocationId}>
                    <TableCell className="max-w-72">
                      <span className="flex min-w-0 items-center gap-3">
                        <AgentAvatar
                          name={item.app.name}
                          imageUrl={item.app.imageUrl}
                          className="size-8 text-sm"
                        />
                        <span className="grid min-w-0">
                          <span className="truncate font-medium">{item.app.name}</span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {item.commandName ? `/${item.commandName}` : "offer"}
                          </span>
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatUsdc(item.grossAmount)}
                    </TableCell>
                    <TableCell>
                      <StageBadge stage={stage} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{stage.detail}</TableCell>
                    <TableCell
                      className="font-mono text-xs text-muted-foreground tabular-nums"
                      title={new Date(item.createdAt).toLocaleString()}
                    >
                      {relative(Date.parse(item.createdAt) / 1000)}
                    </TableCell>
                    <TableCell>
                      <ActivityLink item={item}>
                        <ArrowUpRight size={16} aria-label="Open" />
                      </ActivityLink>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {activity.hasNextPage && (
              <Button
                variant="outline"
                className="mt-4"
                disabled={activity.isFetchingNextPage}
                onClick={() => void activity.fetchNextPage()}
              >
                {activity.isFetchingNextPage && <Spinner />} Load more
              </Button>
            )}
          </>
        )}
      </section>
    </PageShell>
  );
}
