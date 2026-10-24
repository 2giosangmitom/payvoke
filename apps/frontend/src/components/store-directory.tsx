import { useDeferredValue, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, LoaderCircle, Search, Star } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { authClient } from "@/src/lib/auth-client";
import {
  formatUsdc,
  getStars,
  listStoreApps,
  starApp,
  unstarApp,
  type StoreApp,
} from "@/src/lib/apps";

function Availability({ status }: { status: StoreApp["availability"] }) {
  const label =
    status === "AVAILABLE" ? "Online" : status === "SUSPENDED" ? "Suspended" : "Offline";
  return (
    <span className={`store-status is-${status.toLowerCase()}`}>
      <i aria-hidden="true" /> {label}
    </span>
  );
}

function AppCard({ app, starred, canSave }: { app: StoreApp; starred: boolean; canSave: boolean }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const toggle = useMutation({
    mutationFn: () => (starred ? unstarApp(app.id) : starApp(app.id)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["stars"] });
      void queryClient.invalidateQueries({ queryKey: ["store"] });
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Could not save."),
  });
  return (
    <article className="store-card">
      <div className="store-card-top">
        <Availability status={app.availability} />
        <button
          type="button"
          className={starred ? "store-star is-saved" : "store-star"}
          aria-label={starred ? `Remove ${app.name} from saved` : `Save ${app.name}`}
          aria-pressed={starred}
          disabled={!canSave || toggle.isPending}
          title={canSave ? undefined : "Sign in to save apps"}
          onClick={() => toggle.mutate()}
        >
          <Star size={16} fill={starred ? "currentColor" : "none"} />
        </button>
      </div>
      <Link to="/store/$appId" params={{ appId: app.id }} className="store-card-body">
        <h2>{app.name}</h2>
        <p>{app.description || "A Payvoke app with slash commands and a shared thread."}</p>
      </Link>
      <div className="store-card-meta">
        <span>
          {app.commandCount} command{app.commandCount === 1 ? "" : "s"}
        </span>
        <span>{app.fromPrice ? `from ${formatUsdc(app.fromPrice)}` : "No price yet"}</span>
      </div>
      <div className="store-card-foot">
        <Link to="/store/$appId" params={{ appId: app.id }} className="store-open">
          Inspect <ArrowUpRight size={14} />
        </Link>
        {error && (
          <span className="store-card-error" role="alert">
            {error}
          </span>
        )}
      </div>
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
    <main className="store-shell">
      <header className="store-hero">
        <div>
          <p className="workspace-kicker">PUBLIC APPS / SHARED CHAT</p>
          <h1>
            One conversation.
            <br />
            Every app you need.
          </h1>
        </div>
        <p>
          Apps publish slash commands into one shared chat. Pick an app, open a thread, and pay per
          request only when you authorize a quote.
        </p>
      </header>
      <div className="store-controls">
        <label className="store-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search apps</span>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search apps, commands, or what you need done"
          />
        </label>
        <div className="store-controls-meta">
          {canSave && (
            <button
              type="button"
              className={savedOnly ? "store-saved-filter is-active" : "store-saved-filter"}
              aria-pressed={savedOnly}
              onClick={() => setSavedOnly((value) => !value)}
            >
              <Star size={13} fill={savedOnly ? "currentColor" : "none"} /> Saved
            </button>
          )}
          <span className="store-count">
            {apps.isPending ? "Loading…" : `${items.length} app${items.length === 1 ? "" : "s"}`}
          </span>
        </div>
      </div>

      {apps.isError && (
        <div className="run-error" role="alert">
          {apps.error instanceof Error ? apps.error.message : "Could not load the store."}{" "}
          <Button size="sm" onClick={() => void apps.refetch()}>
            Retry
          </Button>
        </div>
      )}
      {apps.isPending ? (
        <div className="store-loading">
          <LoaderCircle className="animate-spin" size={18} /> Reading the store…
        </div>
      ) : items.length === 0 ? (
        <div className="store-empty">
          <p>{savedOnly ? "SAVED APPS" : "NO PUBLIC APPS YET"}</p>
          <h2>{savedOnly ? "No saved apps yet." : "Nothing matched that request."}</h2>
          <span>
            {savedOnly
              ? "Star an app to keep it in this list."
              : "Try a broader search, or open Studio to publish the first app."}
          </span>
          {savedOnly ? (
            <Button variant="outline" onClick={() => setSavedOnly(false)}>
              Show all apps
            </Button>
          ) : (
            <Button render={<Link to="/dashboard" />} className="button-primary">
              Open Studio
            </Button>
          )}
        </div>
      ) : (
        <section className="store-grid" aria-label="Public apps">
          {items.map((app) => (
            <AppCard key={app.id} app={app} starred={saved.has(app.id)} canSave={canSave} />
          ))}
        </section>
      )}
      {apps.hasNextPage && (
        <div className="store-more">
          <Button
            variant="outline"
            disabled={apps.isFetchingNextPage}
            onClick={() => void apps.fetchNextPage()}
          >
            {apps.isFetchingNextPage ? <LoaderCircle className="animate-spin" /> : null} Load more
            apps
          </Button>
        </div>
      )}
    </main>
  );
}
