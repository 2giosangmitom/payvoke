import { useDeferredValue, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Search, Star } from "lucide-react";
import { BlurFade } from "./ui/blur-fade";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Spinner } from "./ui/spinner";
import { Toggle } from "./ui/toggle";
import {
  AppStatus,
  EmptyState,
  ErrorNotice,
  LoadingState,
  PageHeader,
  PageShell,
  errorMessage,
  plural,
} from "./page-kit";
import { cn } from "@/src/lib/utils";
import { authClient } from "@/src/lib/auth-client";
import {
  formatUsdc,
  formatUsdcRange,
  getStars,
  listStoreApps,
  starApp,
  unstarApp,
  type StoreApp,
} from "@/src/lib/apps";

function AppCard({ app, starred, canSave }: { app: StoreApp; starred: boolean; canSave: boolean }) {
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
    <article className="group relative flex min-h-64 flex-col border border-border bg-card transition-[border-color,translate,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-float">
      <div className="flex items-center justify-between gap-3 px-5 pt-5">
        <AppStatus availability={app.availability} />
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn("relative z-10 text-faint", starred && "text-primary")}
          aria-label={starred ? `Remove ${app.name} from saved` : `Save ${app.name}`}
          aria-pressed={starred}
          disabled={!canSave || toggle.isPending}
          title={canSave ? undefined : "Sign in to save apps"}
          onClick={() => toggle.mutate()}
        >
          <Star fill={starred ? "currentColor" : "none"} />
        </Button>
      </div>
      <div className="flex-1 px-5 pt-4 pb-6">
        <h2 className="text-xl font-medium tracking-[-0.03em] break-words">
          <Link
            to="/store/$appId"
            params={{ appId: app.id }}
            className="after:absolute after:inset-0 group-hover:text-primary"
          >
            {app.name}
          </Link>
        </h2>
        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
          {app.description || "No description yet."}
        </p>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3 font-mono text-[11px] text-faint">
        <span>
          {app.kind === "AGENT" ? "agent" : "tool"} · {plural(app.commandCount, "command")}
        </span>
        <span className="text-primary">
          {app.kind === "AGENT"
            ? app.priceRange
              ? `offers ${formatUsdcRange(app.priceRange.min, app.priceRange.max)}`
              : "No price yet"
            : app.fromPrice
              ? `from ${formatUsdc(app.fromPrice)}`
              : "No price yet"}
        </span>
        <ArrowUpRight
          size={15}
          aria-hidden="true"
          className="text-primary transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
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

export function StoreDirectory() {
  const [search, setSearch] = useState("");
  const [savedOnly, setSavedOnly] = useState(false);
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
  const items = apps.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <PageShell>
      <PageHeader
        eyebrow="Store"
        title="Tools to run, agents to hire"
        description="Tools have a fixed price per run and open as a form. Agents chat with you for free and send an offer. Either way you approve a quote before anything is held, and the vault refunds work that isn't delivered."
      />
      <div className="sticky top-0 z-10 -mx-1 flex flex-col gap-3 bg-background/90 px-1 py-4 backdrop-blur sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <Search
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-faint"
          />
          <span className="sr-only">Search apps</span>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by app name or what you need done"
            className="h-11 pl-10"
          />
        </label>
        <div className="flex items-center justify-between gap-4 sm:justify-end">
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
            {apps.isPending ? "Loading…" : plural(items.length, "app")}
          </span>
        </div>
      </div>

      {apps.isError && (
        <ErrorNotice onRetry={() => void apps.refetch()}>
          {errorMessage(apps.error, "Could not load the store.")}
        </ErrorNotice>
      )}
      {apps.isPending ? (
        <LoadingState>Loading apps…</LoadingState>
      ) : items.length === 0 ? (
        <EmptyState
          className="mt-4"
          eyebrow={savedOnly ? "Saved apps" : "No matches"}
          title={savedOnly ? "You haven't saved any apps." : "Nothing matched that search."}
          action={
            savedOnly ? (
              <Button variant="outline" onClick={() => setSavedOnly(false)}>
                Show all apps
              </Button>
            ) : (
              <Button render={<Link to="/console/studio" />}>Publish an app in Studio</Button>
            )
          }
        >
          {savedOnly
            ? "Star an app and it shows up here."
            : "Try fewer words, or publish the first app yourself."}
        </EmptyState>
      ) : (
        <section aria-label="Public apps" className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
