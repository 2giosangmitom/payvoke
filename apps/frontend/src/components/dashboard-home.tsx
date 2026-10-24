import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, LoaderCircle, Plus, Radio } from "lucide-react";
import { useConnection } from "wagmi";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { WalletAccess } from "./wallet-access";
import { authClient } from "@/src/lib/auth-client";
import { createProviderApp, listProviderApps } from "@/src/lib/apps";

export function DashboardHome() {
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const { address } = useConnection();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"PUBLIC" | "PRIVATE">("PRIVATE");
  const [payout, setPayout] = useState("");
  const [error, setError] = useState("");
  const apps = useQuery({
    queryKey: ["provider", "apps", session?.user.id],
    queryFn: listProviderApps,
    enabled: Boolean(session),
    staleTime: 10_000,
  });
  const create = useMutation({
    mutationFn: () =>
      createProviderApp({
        name: name.trim(),
        description: description.trim() || undefined,
        payoutAddress: (payout || address || "").trim(),
        visibility,
      }),
    onSuccess: () => {
      setName("");
      setDescription("");
      setPayout("");
      setOpen(false);
      setError("");
      void queryClient.invalidateQueries({ queryKey: ["provider", "apps"] });
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Could not create app."),
  });

  if (!session)
    return (
      <main className="dashboard-shell dashboard-gate">
        <div>
          <p className="workspace-kicker">STUDIO / PROVIDER CONTROL</p>
          <h1>Operate the app behind the thread.</h1>
          <p>
            Sign in with the wallet that owns an app to manage its commands, API keys, heartbeat
            presence, and visibility in the public store.
          </p>
        </div>
        <WalletAccess label="Sign in to Studio" />
      </main>
    );

  const items = (apps.data ?? []).filter((app) => !app.archivedAt);
  return (
    <main className="dashboard-shell">
      <header className="dashboard-hero">
        <div>
          <p className="workspace-kicker">STUDIO / PROVIDER CONTROL</p>
          <h1>Your apps, commands, keys.</h1>
          <p>
            One app is one chat surface. Providers expose slash commands, rotate a single active API
            key, and keep the thread list on the buyer side.
          </p>
        </div>
        <Button className="button-primary" onClick={() => setOpen((value) => !value)}>
          <Plus size={16} /> New app
        </Button>
      </header>

      {open && (
        <section className="dashboard-create" aria-labelledby="create-app-title">
          <header>
            <div>
              <p className="workspace-kicker">NEW APP</p>
              <h2 id="create-app-title">Publish a chat surface</h2>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Close
            </Button>
          </header>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!(payout || address)) {
                setError("Connect a wallet or enter a payout address.");
                return;
              }
              create.mutate();
            }}
          >
            <label htmlFor="app-name">
              App name
              <Input
                id="app-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={80}
                placeholder="Summarizer"
              />
            </label>
            <label htmlFor="app-description">
              Description
              <Textarea
                id="app-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="What this app does and when to use it."
              />
            </label>
            <label htmlFor="app-payout">
              Payout address
              <Input
                id="app-payout"
                value={payout || address || ""}
                onChange={(event) => setPayout(event.target.value)}
                required
                placeholder="0x…"
                spellCheck={false}
              />
            </label>
            <fieldset className="dashboard-choice">
              <legend>Store visibility</legend>
              <label>
                <input
                  type="radio"
                  name="visibility"
                  checked={visibility === "PUBLIC"}
                  onChange={() => setVisibility("PUBLIC")}
                />
                <span>
                  <strong>Public</strong>
                  <small>Listed in the store for anyone to chat.</small>
                </span>
              </label>
              <label>
                <input
                  type="radio"
                  name="visibility"
                  checked={visibility === "PRIVATE"}
                  onChange={() => setVisibility("PRIVATE")}
                />
                <span>
                  <strong>Private</strong>
                  <small>Only you can open it; never listed publicly.</small>
                </span>
              </label>
            </fieldset>
            {error && (
              <div className="run-error" role="alert">
                {error}
              </div>
            )}
            <Button type="submit" disabled={create.isPending || !name.trim()}>
              {create.isPending ? <LoaderCircle className="animate-spin" /> : null} Create app
            </Button>
          </form>
        </section>
      )}

      <section className="dashboard-apps" aria-labelledby="apps-title">
        <div className="store-section-head">
          <div>
            <p className="workspace-kicker">OWNED APPS</p>
            <h2 id="apps-title">Control room</h2>
          </div>
          <span>
            {items.length} app{items.length === 1 ? "" : "s"}
          </span>
        </div>
        {apps.isPending ? (
          <div className="store-loading">
            <LoaderCircle className="animate-spin" size={18} /> Loading apps…
          </div>
        ) : apps.isError ? (
          <div className="run-error" role="alert">
            {apps.error instanceof Error ? apps.error.message : "Could not load apps."}
            <Button size="sm" onClick={() => void apps.refetch()}>
              Retry
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="store-empty">
            <p>NO APPS YET</p>
            <h2>Create the first app.</h2>
            <span>
              Then add a default command, rotate an API key, and start the provider worker.
            </span>
            <Button className="button-primary" onClick={() => setOpen(true)}>
              Create app
            </Button>
          </div>
        ) : (
          <div className="dashboard-app-list">
            {items.map((app) => (
              <Link
                key={app.id}
                to="/dashboard/apps/$appId"
                params={{ appId: app.id }}
                className="dashboard-app-row"
              >
                <div>
                  <span className={`store-status is-${app.availability.toLowerCase()}`}>
                    <i aria-hidden="true" />
                    {app.availability === "AVAILABLE" ? "Online" : app.availability.toLowerCase()}
                  </span>
                  <h3>{app.name}</h3>
                  <p>{app.description || "No description yet."}</p>
                </div>
                <div className="dashboard-app-meta">
                  <span>{app.visibility.toLowerCase()}</span>
                  <span>
                    <Radio size={12} /> {app.status.toLowerCase()}
                  </span>
                  <ArrowUpRight size={16} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
