import { useDeferredValue, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Search, Star } from "lucide-react";
import { BlurFade } from "@/src/components/ui/blur-fade";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Spinner } from "@/src/components/ui/spinner";
import { Toggle } from "@/src/components/ui/toggle";
import { NativeSelect, NativeSelectOption } from "@/src/components/ui/native-select";
import {
  AppStatus,
  EmptyState,
  ErrorNotice,
  CardGridSkeleton,
  PageHeader,
  PageShell,
  errorMessage,
  plural,
} from "@/src/components/layout/page-kit";
import { cn } from "@/src/lib/utils";
import { authClient } from "@/src/features/auth/auth-client";
import {
  getStars,
  listStoreApps,
  starApp,
  unstarApp,
  type StoreApp,
} from "@/src/features/apps/api";
import { AgentAvatar } from "@/src/features/apps/agent-avatar";
import { OwnerLink, RatingLine, ReputationLine, UsageLine } from "@/src/features/apps/agent-facts";
import { formatUsdc } from "@/src/features/apps/format";

export function AppCard({
  app,
  starred,
  canSave,
  showOwner = true,
}: {
  app: StoreApp;
  starred: boolean;
  canSave: boolean;
  showOwner?: boolean;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const toggle = useMutation({
    mutationFn: () => (starred ? unstarApp(app.id) : starApp(app.id)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["stars"] });
      void queryClient.invalidateQueries({ queryKey: ["store"] });
    },
    onError: (cause) => setError(errorMessage(cause, "Could not save.")),
  });
  return (
    <article className="group relative flex h-full min-h-48 flex-col border border-border bg-card transition-[border-color,translate,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:border-border-strong hover:shadow-float">
      <div className="flex items-start gap-3 px-5 pt-5">
        <AgentAvatar name={app.name} imageUrl={app.imageUrl} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg leading-tight font-medium tracking-[-0.025em]">
            <Link
              to="/store/$appId"
              params={{ appId: app.id }}
              className="after:absolute after:inset-0 group-hover:text-primary"
            >
              {app.name}
            </Link>
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            {showOwner && <OwnerLink owner={app.owner} />}
            {app.availability !== "AVAILABLE" && <AppStatus availability={app.availability} />}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn("relative z-10 -mt-1 -mr-2 text-faint", starred && "text-primary")}
          aria-label={starred ? `Remove ${app.name} from saved` : `Save ${app.name}`}
          aria-pressed={starred}
          disabled={!canSave || toggle.isPending}
          title={canSave ? undefined : "Sign in to save agents"}
          onClick={() => toggle.mutate()}
        >
          <Star fill={starred ? "currentColor" : "none"} />
        </Button>
      </div>
      <p className="flex-1 px-5 pt-4 pb-5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
        {app.description || "No description yet."}
      </p>
      <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <RatingLine rating={app.rating} />
          <UsageLine jobs={app.jobs} users={app.users} />
          <ReputationLine reputation={app.reputation} />
        </div>
        <span className="ml-auto shrink-0 font-mono text-xs text-primary">
          {app.priceCap ? `up to ${formatUsdc(app.priceCap)}` : "by offer"}
        </span>
        <ArrowUpRight
          size={15}
          aria-hidden="true"
          className="text-primary transition-transform duration-200 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
        />
      </div>
      {error && (
        <p role="alert" className="relative z-10 px-5 pb-3 text-xs text-destructive">
          {error}
        </p>
      )}
    </article>
  );
}

const SORTS = [
  ["featured", "Featured"],
  ["rated", "Top rated"],
  ["hired", "Most hired"],
  ["new", "Newest"],
] as const;
type Sort = (typeof SORTS)[number][0];

// Orders the agents loaded so far; "featured" keeps the store's own order.
function sorted(items: StoreApp[], sort: Sort) {
  if (sort === "featured") return items;
  const copy = [...items];
  if (sort === "rated")
    copy.sort(
      (a, b) =>
        (b.rating.average ?? 0) - (a.rating.average ?? 0) || b.rating.count - a.rating.count,
    );
  if (sort === "hired") copy.sort((a, b) => b.jobs - a.jobs || b.users - a.users);
  if (sort === "new") copy.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return copy;
}

export function StoreDirectory() {
  const [search, setSearch] = useState("");
  const [savedOnly, setSavedOnly] = useState(false);
  const [sort, setSort] = useState<Sort>("featured");
  const deferred = useDeferredValue(search);
  const { data: session } = authClient.useSession();
  const canSave = Boolean(session);
  const apps = useInfiniteQuery({
    queryKey: ["store", "list", deferred, savedOnly],
    queryFn: ({ pageParam }) => listStoreApps({ q: deferred, cursor: pageParam, saved: savedOnly }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 20_000,
  });
  const stars = useQuery({
    queryKey: ["stars", session?.user.id],
    queryFn: getStars,
    enabled: canSave,
    staleTime: 20_000,
  });
  const saved = new Set((stars.data ?? []).map((item) => item.id));
  const items = sorted(apps.data?.pages.flatMap((page) => page.items) ?? [], sort);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Store"
        title="Find the right agent"
        description="Browse agents shared by builders and hire one for your next job."
      />
      <div className="sticky top-0 z-10 -mx-1 flex flex-col gap-3 bg-background/90 px-1 py-4 backdrop-blur sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <Search
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-faint"
          />
          <span className="sr-only">Search agents</span>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search agents or tasks"
            className="h-11 pl-10"
          />
        </label>
        <div className="flex items-center gap-3">
          <label className="sr-only" htmlFor="store-sort">
            Sort agents
          </label>
          <NativeSelect
            id="store-sort"
            value={sort}
            onChange={(event) => setSort(event.target.value as Sort)}
            className="[&_select]:h-11"
          >
            {SORTS.map(([value, label]) => (
              <NativeSelectOption key={value} value={value}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {canSave && (
            <Toggle
              variant="outline"
              pressed={savedOnly}
              onPressedChange={setSavedOnly}
              className="h-11 px-3.5 text-sm data-pressed:border-primary data-pressed:text-primary"
            >
              <Star fill={savedOnly ? "currentColor" : "none"} /> Saved
            </Toggle>
          )}
          <span
            className="ml-auto font-mono text-xs whitespace-nowrap text-faint"
            aria-live="polite"
          >
            {apps.isPending ? <Skeleton className="h-3 w-12" /> : plural(items.length, "agent")}
          </span>
        </div>
      </div>

      {apps.isError && (
        <ErrorNotice onRetry={() => void apps.refetch()}>
          {errorMessage(apps.error, "Could not load the store.")}
        </ErrorNotice>
      )}
      {apps.isPending ? (
        <CardGridSkeleton className="mt-4" />
      ) : items.length === 0 ? (
        <EmptyState
          className="mt-4"
          eyebrow={savedOnly ? "Saved agents" : "No matches"}
          title={savedOnly ? "You haven't saved any agents." : "Nothing matched that search."}
          action={
            savedOnly ? (
              <Button variant="outline" onClick={() => setSavedOnly(false)}>
                Show all apps
              </Button>
            ) : (
              <Button render={<Link to="/console/studio" />}>Share an agent in Studio</Button>
            )
          }
        >
          {savedOnly
            ? "Star an agent and it shows up here."
            : "Try fewer words, or share the first agent yourself."}
        </EmptyState>
      ) : (
        <section
          aria-label="Public agents"
          className="mt-6 grid gap-4 pb-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {items.map((app, index) => (
            <BlurFade key={app.id} inView delay={Math.min(index, 8) * 0.04}>
              <AppCard app={app} starred={saved.has(app.id)} canSave={canSave} />
            </BlurFade>
          ))}
        </section>
      )}
      {apps.hasNextPage && (
        <div className="mt-10 flex justify-center">
          <Button
            variant="outline"
            size="lg"
            disabled={apps.isFetchingNextPage}
            onClick={() => void apps.fetchNextPage()}
          >
            {apps.isFetchingNextPage && <Spinner />} Load more
          </Button>
        </div>
      )}
    </PageShell>
  );
}
