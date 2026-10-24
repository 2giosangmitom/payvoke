import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, LoaderCircle, Star } from "lucide-react";
import { Button } from "./ui/button";
import { WalletAccess } from "./wallet-access";
import { authClient } from "@/src/lib/auth-client";
import { formatUsdc, getStoreApp, getStars, starApp, unstarApp } from "@/src/lib/apps";
import { newThread } from "@/src/lib/paid-chat";

export function StoreAppDetail({ appId }: { appId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const [error, setError] = useState("");
  const [opening, setOpening] = useState(false);
  const detail = useQuery({
    queryKey: ["store", "app", appId],
    queryFn: () => getStoreApp(appId),
    staleTime: 15_000,
  });
  const stars = useQuery({
    queryKey: ["stars", session?.user.id],
    queryFn: getStars,
    enabled: Boolean(session),
    staleTime: 15_000,
  });
  const starred = Boolean(stars.data?.some((item) => item.id === appId));
  const save = useMutation({
    mutationFn: () => (starred ? unstarApp(appId) : starApp(appId)),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["stars"] }),
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Could not save."),
  });

  async function openChat() {
    if (!session) return;
    setError("");
    setOpening(true);
    try {
      const thread = await newThread(appId);
      await navigate({ to: "/chat/$threadId", params: { threadId: thread.id } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open a thread.");
    } finally {
      setOpening(false);
    }
  }

  if (detail.isPending)
    return (
      <main className="store-shell store-detail-state">
        <LoaderCircle className="animate-spin" /> Loading app…
      </main>
    );
  if (detail.isError || !detail.data)
    return (
      <main className="store-shell store-detail-state" role="alert">
        <p>{detail.error instanceof Error ? detail.error.message : "App not found."}</p>
        <Button render={<Link to="/store" />} variant="outline">
          Back to store
        </Button>
      </main>
    );
  const app = detail.data;
  const offline = app.availability !== "AVAILABLE";
  const suspended = app.availability === "SUSPENDED";

  return (
    <main className="store-shell">
      <Link to="/store" className="store-back">
        <ArrowLeft size={15} /> Store
      </Link>
      <header className="store-detail-hero">
        <div className="store-detail-title">
          <p className="workspace-kicker">
            {app.visibility === "PRIVATE" ? "PRIVATE APP" : "PUBLIC APP"} / {app.id.slice(0, 8)}
          </p>
          <h1>{app.name}</h1>
          <p>{app.description || "No description yet."}</p>
          <div className="store-detail-tags">
            <span className={`store-status is-${app.availability.toLowerCase()}`}>
              <i aria-hidden="true" />{" "}
              {app.availability === "AVAILABLE"
                ? "Online"
                : app.availability === "SUSPENDED"
                  ? "Suspended"
                  : "Offline"}
            </span>
            <span>{app.visibility === "PUBLIC" ? "Public app" : "Private app"}</span>
            <span>
              {app.commands.length} slash command{app.commands.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        <aside className="store-detail-actions">
          <Button
            className="button-primary"
            disabled={opening || offline || !session}
            onClick={() => void openChat()}
          >
            {opening ? <LoaderCircle className="animate-spin" /> : null}
            {suspended
              ? "App suspended"
              : offline
                ? "App offline"
                : session
                  ? "Open chat"
                  : "Sign in to chat"}
          </Button>
          {!session && <WalletAccess />}
          <Button
            variant="outline"
            disabled={!session || save.isPending}
            onClick={() => save.mutate()}
          >
            <Star size={15} fill={starred ? "currentColor" : "none"} />{" "}
            {starred ? "Saved" : "Save app"}
          </Button>
          <p>
            {suspended
              ? "This app is suspended by its owner. Existing threads stay readable, but new quotes are blocked."
              : offline
                ? "New quotes are blocked until the provider heartbeat returns. Existing threads stay readable."
                : "A quote appears in the chat composer. Nothing is charged until you authorize it."}
          </p>
        </aside>
      </header>

      {error && (
        <div className="run-error" role="alert">
          {error}
        </div>
      )}

      <section className="store-commands" aria-labelledby="commands-title">
        <div className="store-section-head">
          <div>
            <p className="workspace-kicker">SLASH COMMANDS</p>
            <h2 id="commands-title">What this app can do</h2>
          </div>
          <span>Free text maps to the default command.</span>
        </div>
        {app.commands.length === 0 ? (
          <div className="store-empty">
            <h2>No commands yet.</h2>
            <span>This app has no active command revision, so it cannot be quoted.</span>
          </div>
        ) : (
          <div className="store-command-list">
            {app.commands.map((command) => (
              <article key={command.id} className="store-command">
                <div className="store-command-name">
                  <code>/{command.name}</code>
                  {command.id === app.defaultCommandId && <span>DEFAULT</span>}
                </div>
                <p>{command.description}</p>
                {command.revision ? (
                  <>
                    <div className="store-command-terms">
                      <span>{formatUsdc(command.revision.grossAmount)}</span>
                      <span>delivery ≤ {command.revision.deliverySeconds}s</span>
                      <span>review {command.revision.reviewSeconds}s</span>
                    </div>
                    <div className="store-command-options">
                      {command.revision.options.map((option) => (
                        <span key={option.name}>
                          {option.name}
                          <small>
                            {option.type.toLowerCase()}
                            {option.required ? " · required" : ""}
                          </small>
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <span className="store-command-empty">No active revision.</span>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="store-detail-note">
        <p>
          Payvoke apps share one thread list. Commands are called with <code>/name</code> inside the
          composer; free text uses this app&apos;s default command.
        </p>
        <Link to="/chat" className="text-link">
          Browse your threads <ArrowUpRight size={15} />
        </Link>
      </section>
    </main>
  );
}
