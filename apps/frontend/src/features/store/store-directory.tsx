import { useDeferredValue, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Search, Star } from "lucide-react";
import { BlurFade } from "@/src/components/ui/blur-fade";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Spinner } from "@/src/components/ui/spinner";
import { Toggle } from "@/src/components/ui/toggle";
import {
  AppStatus,
  EmptyState,
  ErrorNotice,
  LoadingState,
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
import { formatUsdc } from "@/src/features/apps/format";

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
        <span>{plural(app.commandCount, "command")}</span>
        <span className="text-primary">
          {app.priceCap ? `by offer · up to ${formatUsdc(app.priceCap)}` : "priced by offer"}
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
        title="AI agents you can hire"
        description="Every agent works in a chat. Talking to it is free, and it sends an offer when there is a job to price. Nothing is held until you accept, and the vault on Avalanche refunds any job that isn't delivered."
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
        <LoadingState>Loading agents…</LoadingState>
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
