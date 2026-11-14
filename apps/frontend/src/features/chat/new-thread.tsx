import { useDeferredValue, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Search, Star, Store } from "lucide-react";
import { BlurFade } from "@/src/components/ui/blur-fade";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  EmptyState,
  ErrorNotice,
  StatusDot,
  errorMessage,
  plural,
} from "@/src/components/layout/page-kit";
import { WalletAccess } from "@/src/features/auth/wallet-access";
import { authClient } from "@/src/features/auth/auth-client";
import { AgentAvatar } from "@/src/features/apps/agent-avatar";
import { getStars, listProviderApps } from "@/src/features/apps/api";
import { cn } from "@/src/lib/utils";

type Pick = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  availability: string;
  commandCount?: number;
};

const matches = (app: Pick, q: string) =>
  !q || app.name.toLowerCase().includes(q) || (app.description ?? "").toLowerCase().includes(q);

function AgentPick({ app, note, onStart }: { app: Pick; note: string; onStart: () => void }) {
  const available = app.availability === "AVAILABLE";
  return (
    <button
      type="button"
      disabled={!available}
      onClick={onStart}
      className="group flex w-full items-center gap-4 border border-border bg-background p-4 text-left transition-[border-color,background-color] duration-150 ease-out hover:border-primary/50 hover:bg-primary-soft/40 focus-visible:border-primary focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border disabled:hover:bg-background"
    >
      <AgentAvatar name={app.name} imageUrl={app.imageUrl} className="size-11" />
      <span className="grid min-w-0 flex-1 gap-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-medium">{app.name}</span>
          <StatusDot availability={app.availability} />
        </span>
        <span className="line-clamp-1 text-sm text-muted-foreground">
          {app.description || "No description yet."}
        </span>
        <span className="font-mono text-[11px] text-faint">
          {available ? note : "Offline right now"}
        </span>
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "grid size-9 shrink-0 place-items-center border border-border text-muted-foreground transition-[color,border-color,translate] duration-150 ease-out group-hover:border-primary group-hover:text-primary group-enabled:group-hover:translate-x-0.5",
        )}
      >
        <ArrowRight size={16} />
      </span>
      <span className="sr-only">Start a chat with {app.name}</span>
    </button>
  );
}

function PickSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-busy="true" className="grid gap-3 lg:grid-cols-2">
      <span className="sr-only">Loading your agents</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-4 border border-border bg-background p-4">
          <Skeleton className="size-11 shrink-0" />
          <div className="grid flex-1 gap-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3.5 w-4/5" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="size-9 shrink-0" />
        </div>
      ))}
    </div>
  );
}

function Group({
  id,
  icon,
  title,
  count,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="grid gap-3">
      <h2 id={id} className="flex items-center gap-2 text-sm font-medium">
        <span className="text-primary">{icon}</span>
        {title}
        <span className="font-mono text-xs text-faint tabular-nums">{count}</span>
      </h2>
      {children}
    </section>
  );
}

// A new chat starts from the agents the buyer already chose: the ones they
// saved in the store and the ones they share themselves. Finding new agents
// is the store's job, so this screen does not search it.
export function NewThread() {
  const navigate = useNavigate();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const user = session?.user.id;
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search).trim().toLowerCase();
  const stars = useQuery({
    queryKey: ["stars", user],
    queryFn: getStars,
    enabled: Boolean(user),
    staleTime: 20_000,
  });
  const owned = useQuery({
    queryKey: ["provider", "apps", user],
    queryFn: listProviderApps,
    enabled: Boolean(user),
    staleTime: 20_000,
  });
  const savedApps: Pick[] = (stars.data ?? []).filter((app) => app.status !== "ARCHIVED");
  const savedIds = new Set(savedApps.map((app) => app.id));
  const ownApps: Pick[] = (owned.data ?? [])
    .filter((app) => !app.archivedAt && !savedIds.has(app.id))
    .map((app) => ({
      id: app.id,
      name: app.name,
      description: app.description,
      imageUrl: app.imageUrl ?? null,
      availability: app.availability,
    }));
  const saved = savedApps.filter((app) => matches(app, q));
  const own = ownApps.filter((app) => matches(app, q));
  const total = savedApps.length + ownApps.length;
  const loading = sessionPending || (Boolean(user) && (stars.isPending || owned.isPending));

  // Opens the chat straight away; the thread is created on the first message.
  const start = (appId: string) =>
    void navigate({ to: "/console/chat/new/$appId", params: { appId } });

  const pick = (app: Pick, note: string) => (
    <AgentPick key={app.id} app={app} note={note} onStart={() => start(app.id)} />
  );

  return (
    <main className="overflow-y-auto">
      <div className="mx-auto grid w-full max-w-4xl gap-8 px-5 py-10 sm:px-8 lg:py-14">
        <BlurFade>
          <header className="grid gap-3">
            <h1 className="text-[clamp(1.75rem,3.5vw,2.5rem)] leading-[1.1] font-medium tracking-[-0.04em]">
              Who do you want to talk to?
            </h1>
            <p className="max-w-xl leading-7 text-muted-foreground">
              Pick one of your saved agents. Chatting is free; an agent sends an offer before any
              job is charged.
            </p>
          </header>
        </BlurFade>

        {!session && !sessionPending ? (
          <section className="flex flex-col justify-between gap-4 border border-border-strong bg-background-deep p-5 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-medium">Sign in to chat</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Chats belong to your wallet. Connect an Avalanche Fuji wallet to start one.
              </p>
            </div>
            <WalletAccess />
          </section>
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="relative flex-1">
                <Search
                  size={16}
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-faint"
                />
                <span className="sr-only">Filter your agents</span>
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Filter your agents"
                  className="h-11 pl-10"
                  disabled={loading || total === 0}
                />
              </label>
              <Button variant="outline" size="lg" className="h-11" render={<Link to="/store" />}>
                <Store /> Find agents in the store
              </Button>
            </div>

            {stars.isError && (
              <ErrorNotice onRetry={() => void stars.refetch()}>
                {errorMessage(stars.error, "Could not load your saved agents.")}
              </ErrorNotice>
            )}

            {loading ? (
              <PickSkeleton />
            ) : total === 0 ? (
              <EmptyState
                eyebrow="No saved agents"
                title="Save an agent to chat with it."
                action={
                  <Button render={<Link to="/store" />}>
                    <Store /> Browse the store
                  </Button>
                }
              >
                Star an agent in the store and it shows up here, ready for a new chat.
              </EmptyState>
            ) : saved.length + own.length === 0 ? (
              <p className="border border-dashed border-border-strong/60 px-4 py-6 text-center text-sm text-muted-foreground">
                None of your agents match “{search.trim()}”.
              </p>
            ) : (
              <div className="grid gap-8">
                {saved.length > 0 && (
                  <Group
                    id="saved-agents"
                    icon={<Star size={14} fill="currentColor" aria-hidden="true" />}
                    title="Saved agents"
                    count={saved.length}
                  >
                    <div className="grid gap-3 lg:grid-cols-2">
                      {saved.map((app) =>
                        pick(
                          app,
                          app.commandCount !== undefined
                            ? plural(app.commandCount, "command")
                            : "Saved",
                        ),
                      )}
                    </div>
                  </Group>
                )}
                {own.length > 0 && (
                  <Group
                    id="own-agents"
                    icon={<span className="block size-2 bg-primary" aria-hidden="true" />}
                    title="Your agents"
                    count={own.length}
                  >
                    <div className="grid gap-3 lg:grid-cols-2">
                      {own.map((app) => pick(app, "You share this agent"))}
                    </div>
                  </Group>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
