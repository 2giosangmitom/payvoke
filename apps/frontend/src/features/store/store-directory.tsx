import { useDeferredValue, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Search, Star } from "lucide-react";
import { BlurFade } from "@/src/components/ui/blur-fade";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Skeleton } from "@/src/components/ui/skeleton";
import { ParticleText } from "@/src/components/ui/particle-text";
import { Spinner } from "@/src/components/ui/spinner";
import { Toggle } from "@/src/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/src/components/ui/toggle-group";
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
import { OwnerLink, RatingLine, UsageLine } from "@/src/features/apps/agent-facts";
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
    <article className="group relative flex h-full min-h-64 flex-col border border-border bg-card transition-[border-color,translate,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:border-border-strong hover:shadow-float">
      <div className="flex items-center justify-between gap-3 px-5 pt-5">
        <div className="flex items-center gap-3">
          <AgentAvatar name={app.name} imageUrl={app.imageUrl} />
          <AppStatus availability={app.availability} />
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn("relative z-10 text-faint", starred && "text-primary")}
          aria-label={starred ? `Remove ${app.name} from saved` : `Save ${app.name}`}
          aria-pressed={starred}
          disabled={!canSave || toggle.isPending}
          title={canSave ? undefined : "Sign in to save agents"}
          onClick={() => toggle.mutate()}
        >
          <Star fill={starred ? "currentColor" : "none"} />
        </Button>
      </div>
      <div className="flex-1 px-5 pt-4 pb-5">
        <h2 className="text-xl font-medium tracking-[-0.03em] break-words">
          <Link
            to="/store/$appId"
            params={{ appId: app.id }}
            className="after:absolute after:inset-0 group-hover:text-primary"
          >
            {app.name}
          </Link>
        </h2>
        {showOwner && <OwnerLink owner={app.owner} className="mt-2" />}
        <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
          {app.description || "No description yet."}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border px-5 py-3">
        <RatingLine rating={app.rating} />
        <UsageLine jobs={app.jobs} users={app.users} />
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-2.5 font-mono text-[11px] text-faint">
        <span>{plural(app.commandCount, "command")}</span>
        <span className="text-primary">
          {app.priceCap ? `up to ${formatUsdc(app.priceCap)}` : "priced by offer"}
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
    queryKey: ["store", deferred, savedOnly],
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
        title="AI agents you can hire"
        description="Chat is free. When there's a job, the agent sends an offer. Nothing is held until you accept, and undelivered jobs are refunded."
        actions={
          // The wordmark as particles, small in the header's corner: hover
          // pushes them aside, a click bursts them. Decoration only.
          <div aria-hidden="true" className="relative hidden h-16 w-56 lg:block">
            <ParticleText
              text="PAYVOKE"
              density={2}
              particleSize={2}
              color="var(--field-crest)"
              highlightColor="var(--field-hover)"
              fontSize="2.75rem"
              fontWeight={800}
              shape="square"
              intro="gather"
              scatter={40}
              gatherDuration={1200}
              stagger={300}
              idleDrift={0.5}
              repelRadius={60}
              glow={false}
              className="absolute! -inset-x-[10%] -inset-y-[30%] size-auto!"
            />
          </div>
        }
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
            placeholder="Search by agent name or what you need done"
            className="h-11 pl-10"
          />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
          <ToggleGroup
            aria-label="Sort agents"
            variant="outline"
            spacing={0}
            value={[sort]}
            onValueChange={(value: string[]) => value[0] && setSort(value[0] as Sort)}
            className="h-11"
          >
            {SORTS.map(([value, label]) => (
              <ToggleGroupItem
                key={value}
                value={value}
                className="h-11 px-3 text-xs data-pressed:border-primary data-pressed:text-primary"
              >
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {canSave && (
            <Toggle
              variant="outline"
              pressed={savedOnly}
              onPressedChange={setSavedOnly}
              className="h-11 px-3.5 font-mono text-xs data-pressed:border-primary data-pressed:text-primary"
            >
              <Star fill={savedOnly ? "currentColor" : "none"} /> Saved
            </Toggle>
          )}
          <span className="font-mono text-xs text-faint" aria-live="polite">
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
          className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
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
            {apps.isFetchingNextPage && <Spinner />} Load more apps
          </Button>
        </div>
      )}
    </PageShell>
  );
}
