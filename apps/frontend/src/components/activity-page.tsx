import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import {
  EmptyState,
  ErrorNotice,
  LoadingState,
  PageHeader,
  PageShell,
  errorMessage,
} from "./page-kit";
import { authClient } from "@/src/lib/auth-client";
import { stageOf, type Stage } from "@/src/lib/activity";
import { formatUsdc } from "@/src/lib/apps";
import { getActivity, type ActivityItem } from "@/src/lib/paid-chat";
import { cn } from "@/src/lib/utils";

const FILTERS = [
  ["all", "All"],
  ["attention", "Needs attention"],
  ["active", "In progress"],
  ["done", "Settled"],
] as const;
type Filter = (typeof FILTERS)[number][0];

const toneClass: Record<Stage["tone"], string> = {
  active: "border-border-strong text-foreground",
  attention: "border-warning text-warning",
  done: "border-primary text-primary",
  failed: "border-destructive text-destructive",
};

// Tool runs open their result page; agent work opens the chat it came from.
export function ActivityLink({
  item,
  children,
}: {
  item: ActivityItem;
  children: React.ReactNode;
}) {
  return item.app.kind === "TOOL" ? (
    <Link
      to="/console/runs/$invocationId"
      params={{ invocationId: item.invocationId }}
      className="hover:text-primary"
    >
      {children}
    </Link>
  ) : (
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
    <Badge variant="outline" className={cn("font-mono", toneClass[stage.tone])}>
      {stage.label}
    </Badge>
  );
}

// Every paid request with its hold state and the deadline that matters next.
export function ActivityPage() {
  const { data: session } = authClient.useSession();
  const [filter, setFilter] = useState<Filter>("all");
  const activity = useInfiniteQuery({
    queryKey: ["account", session?.user.id, "activity"],
    queryFn: ({ pageParam }) => getActivity(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    refetchInterval: 15_000,
  });
  const items = (activity.data?.pages ?? []).flatMap((page) => page.items);
  const rows = items
    .map((item) => ({ item, stage: stageOf(item) }))
    .filter(
      ({ stage }) =>
        filter === "all" ||
        stage.tone === filter ||
        (filter === "attention" && stage.tone === "failed"),
    );

  return (
    <PageShell className="pt-10">
      <PageHeader
        eyebrow="Activity"
        title="Every paid request"
        description="Each payment is held in the vault until the work is verified. This is where you see what is still running, what waits for your review and what you can reclaim."
      />
      <div role="group" aria-label="Filter activity" className="mt-8 flex flex-wrap gap-2">
        {FILTERS.map(([value, label]) => (
          <Button
            key={value}
            size="sm"
            variant={filter === value ? "default" : "outline"}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {label}
          </Button>
        ))}
      </div>
      <section className="mt-6" aria-label="Payments">
        {activity.isPending ? (
          <LoadingState>Loading activity…</LoadingState>
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
                      <strong className="font-medium break-words">{item.app.name}</strong>
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
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Next</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead className="sr-only">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ item, stage }) => (
                  <TableRow key={item.invocationId}>
                    <TableCell className="max-w-64">
                      <span className="block truncate font-medium">{item.app.name}</span>
                      <span className="font-mono text-[11px] text-faint">
                        {item.app.kind.toLowerCase()}
                        {item.commandName ? ` · /${item.commandName}` : ""}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono">{formatUsdc(item.grossAmount)}</TableCell>
                    <TableCell>
                      <StageBadge stage={stage} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{stage.detail}</TableCell>
                    <TableCell className="font-mono text-xs text-faint">
                      {new Date(item.createdAt).toLocaleString()}
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
