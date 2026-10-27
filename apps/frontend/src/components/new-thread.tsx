import { useDeferredValue, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Search } from "lucide-react";
import { BlurFade } from "./ui/blur-fade";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Spinner } from "./ui/spinner";
import {
  AppStatus,
  EmptyState,
  ErrorNotice,
  Eyebrow,
  LoadingState,
  errorMessage,
  plural,
} from "./page-kit";
import { WalletAccess } from "./wallet-access";
import { authClient } from "@/src/lib/auth-client";
import { listProviderApps, listStoreApps } from "@/src/lib/apps";
import { newThread } from "@/src/lib/paid-chat";

export function NewThread() {
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const [search, setSearch] = useState("");
  const deferred = useDeferredValue(search);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const publicApps = useQuery({
    queryKey: ["store", "new-thread", deferred],
    queryFn: () => listStoreApps({ q: deferred }),
    staleTime: 20_000,
  });
  const owned = useQuery({
    queryKey: ["provider", "apps", session?.user.id],
    queryFn: listProviderApps,
    enabled: Boolean(session),
    staleTime: 20_000,
  });
  const seen = new Set<string>();
  const apps = [
    ...(publicApps.data?.items ?? []).map((app) => ({
      id: app.id,
      name: app.name,
      description: app.description,
      kind: app.kind,
      availability: app.availability,
      visibility: app.visibility,
      commandCount: app.commandCount,
    })),
    ...(owned.data ?? [])
      .filter((app) => {
        if (app.archivedAt) return false;
        const q = deferred.trim().toLowerCase();
        return (
          !q ||
          app.name.toLowerCase().includes(q) ||
          (app.description ?? "").toLowerCase().includes(q)
        );
      })
      .map((app) => ({
        id: app.id,
        name: app.name,
        description: app.description,
        kind: app.kind,
        availability: app.availability,
        visibility: app.visibility,
        commandCount: undefined as number | undefined,
      })),
  ].filter((app) => {
    // Tools run from a form, not a chat.
    if (app.kind !== "AGENT") return false;
    if (seen.has(app.id)) return false;
    seen.add(app.id);
    return true;
  });
  const start = useMutation({
    mutationFn: (appId: string) => newThread(appId),
    onMutate: (appId) => {
      setBusy(appId);
      setError("");
    },
    onSuccess: (thread) =>
      void navigate({ to: "/console/chat/$threadId", params: { threadId: thread.id } }),
    onError: (cause) => setError(errorMessage(cause, "Could not start a thread.")),
    onSettled: () => setBusy(""),
  });

  return (
    <main className="overflow-y-auto px-5 py-10 sm:px-10 lg:px-14">
      <BlurFade>
        <header className="max-w-2xl">
          <Eyebrow className="mb-4">New chat</Eyebrow>
          <h1 className="text-[clamp(2rem,4vw,3.25rem)] leading-[1.05] font-medium tracking-[-0.05em]">
            Which agent do you want to talk to?
          </h1>
          <p className="mt-4 leading-7 text-muted-foreground">
            Chatting is free. Describe the job; the agent replies and sends an offer with a price,
            and you pay only if you accept. Tools run from a form instead: open one from the{" "}
            <Link to="/store" className="text-primary hover:underline">
              store
            </Link>
            .
          </p>
        </header>
      </BlurFade>
      <label className="relative mt-8 block max-w-2xl">
        <Search
          size={16}
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-faint"
        />
        <span className="sr-only">Search agents to chat with</span>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search apps"
          className="h-11 pl-10"
        />
      </label>
      {!session && (
        <section className="mt-6 flex max-w-2xl flex-col justify-between gap-4 border border-border-strong bg-background-deep p-5 sm:flex-row sm:items-center">
          <div>
            <Eyebrow className="mb-2">Sign in required</Eyebrow>
            <h2 className="text-lg font-medium">Threads belong to your wallet.</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Connect an Avalanche Fuji wallet to open a thread.
            </p>
          </div>
          <WalletAccess />
        </section>
      )}
      <div className="mt-8">
        {publicApps.isPending || (Boolean(session) && owned.isPending) ? (
          <LoadingState>Loading apps…</LoadingState>
        ) : publicApps.isError ? (
          <ErrorNotice onRetry={() => void publicApps.refetch()}>
            {errorMessage(publicApps.error, "Could not load apps.")}
          </ErrorNotice>
        ) : apps.length === 0 ? (
          <EmptyState
            eyebrow="No agents found"
            title="No agent to chat with yet."
            action={<Button render={<Link to="/store" />}>Browse the store</Button>}
          >
            Public agents appear here once their owner publishes a command.
          </EmptyState>
        ) : (
          <section aria-label="Apps" className="grid gap-3 xl:grid-cols-2">
            {apps.map((app, index) => {
              const available = app.availability === "AVAILABLE";
              return (
                <BlurFade key={app.id} inView delay={Math.min(index, 8) * 0.04}>
                  <article className="flex h-full flex-col justify-between gap-5 border border-border bg-background p-5 transition-colors hover:border-border-strong">
                    <div className="min-w-0">
                      <AppStatus availability={app.availability} />
                      <h2 className="mt-3 text-lg font-medium tracking-[-0.02em] break-words">
                        {app.name}
                      </h2>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {app.description || "No description yet."}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-[11px] text-faint">
                        {app.commandCount !== undefined
                          ? plural(app.commandCount, "command")
                          : app.visibility === "PRIVATE"
                            ? "Private app"
                            : "Public app"}
                      </span>
                      <Button
                        variant="outline"
                        disabled={!session || !available || busy === app.id}
                        onClick={() => start.mutate(app.id)}
                      >
                        {busy === app.id ? <Spinner /> : <ArrowUpRight />}
                        {available ? "Start chat" : "Offline"}
                      </Button>
                    </div>
                  </article>
                </BlurFade>
              );
            })}
          </section>
        )}
        {error && <ErrorNotice>{error}</ErrorNotice>}
      </div>
    </main>
  );
}
