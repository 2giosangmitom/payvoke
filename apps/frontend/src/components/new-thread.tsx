import { useDeferredValue, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowUpRight, LoaderCircle, Search } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
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
        availability: app.availability,
        visibility: app.visibility,
        commandCount: undefined as number | undefined,
      })),
  ].filter((app) => {
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
      void navigate({ to: "/chat/$threadId", params: { threadId: thread.id } }),
    onError: (cause) =>
      setError(cause instanceof Error ? cause.message : "Could not start a thread."),
    onSettled: () => setBusy(""),
  });

  return (
    <main className="new-thread-shell">
      <header className="store-hero new-thread-hero">
        <div>
          <p className="workspace-kicker">NEW THREAD / ONE INBOX</p>
          <h1>
            Pick an app.
            <br />
            Keep the conversation.
          </h1>
        </div>
        <p>
          Threads from every app live in one list. Specific apps expose slash commands; free text is
          routed to each app&apos;s default command.
        </p>
      </header>
      <div className="store-controls">
        <label className="store-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search apps to chat with</span>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search apps"
          />
        </label>
      </div>
      {!session && (
        <section className="new-thread-signin">
          <div>
            <p className="workspace-kicker">SIGN IN REQUIRED</p>
            <h2>Threads belong to your wallet.</h2>
            <span>Connect an Avalanche Fuji wallet to open a paid chat thread.</span>
          </div>
          <WalletAccess />
        </section>
      )}
      {publicApps.isPending || (Boolean(session) && owned.isPending) ? (
        <div className="store-loading">
          <LoaderCircle className="animate-spin" size={18} /> Loading apps…
        </div>
      ) : publicApps.isError ? (
        <div className="run-error" role="alert">
          {publicApps.error instanceof Error ? publicApps.error.message : "Could not load apps."}
          <Button size="sm" onClick={() => void publicApps.refetch()}>
            Retry
          </Button>
        </div>
      ) : apps.length === 0 ? (
        <div className="store-empty">
          <p>NO APPS FOUND</p>
          <h2>Your next thread starts in the store.</h2>
          <span>
            Public apps appear here as soon as their provider publishes an active command.
          </span>
          <Button render={<a href="/store" />} className="button-primary">
            Browse the store
          </Button>
        </div>
      ) : (
        <section className="new-thread-list" aria-label="Apps">
          {apps.map((app) => {
            const available = app.availability === "AVAILABLE";
            return (
              <article key={app.id} className="new-thread-app">
                <div>
                  <span className={`store-status is-${app.availability.toLowerCase()}`}>
                    <i aria-hidden="true" /> {available ? "Online" : app.availability.toLowerCase()}
                  </span>
                  <h2>{app.name}</h2>
                  <p>{app.description || "No description yet."}</p>
                </div>
                <div className="new-thread-app-actions">
                  <span>
                    {app.commandCount !== undefined
                      ? `${app.commandCount} command${app.commandCount === 1 ? "" : "s"}`
                      : app.visibility === "PRIVATE"
                        ? "Private app"
                        : "Public app"}
                  </span>
                  <Button
                    variant="outline"
                    disabled={!session || !available || busy === app.id}
                    onClick={() => start.mutate(app.id)}
                  >
                    {busy === app.id ? (
                      <LoaderCircle size={14} className="animate-spin" />
                    ) : (
                      <ArrowUpRight size={14} />
                    )}
                    {available ? "Start thread" : "Offline"}
                  </Button>
                </div>
              </article>
            );
          })}
        </section>
      )}
      {error && (
        <div className="run-error" role="alert">
          {error}
        </div>
      )}
    </main>
  );
}
