import { useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "~/lib/api";
import {
  apiFailure,
  errorMessage,
  isActiveInvocation,
  type CommandRevision,
  type CommandInvocation,
} from "~/lib/provider-commands";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "~/components/ui/dialog";
import { Choice, ErrorState, LoadingState, Notice, Pagination, StatusBadge } from "./shared";
import { CommandForm, InvocationCard } from "./command-invocation";

export function ApplicationConsole({ accountId }: { accountId: string }) {
  const search = useSearch({ from: "/provider" });
  const navigate = useNavigate({ from: "/provider" });
  const client = useQueryClient();
  const key = ["provider", accountId, "applications"];
  const applications = useQuery({
    queryKey: key,
    refetchInterval: 3000,
    queryFn: async ({ signal }) => {
      const result = await api.GET("/v1/provider/applications", { signal });
      if (!result.data) throw apiFailure(result.error);
      return result.data;
    },
  });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const operation = useRef<{ name: string; id: string } | null>(null);
  const selected = search.application
    ? applications.data?.find((app) => app.id === search.application)
    : applications.data?.[0];
  async function create(event: FormEvent) {
    event.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    setError("");
    try {
      if (operation.current?.name !== name.trim())
        operation.current = { name: name.trim(), id: crypto.randomUUID() };
      const result = await api.POST("/v1/provider/applications", { body: operation.current });
      if (!result.data) throw apiFailure(result.error);
      await client.invalidateQueries({ queryKey: key });
      operation.current = null;
      setOpen(false);
      setName("");
      await navigate({
        search: { section: "applications", application: result.data.id, view: "keys" },
      });
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Provider applications" className="gateway-console">
      <div className="gateway-section-heading">
        <p className="text-muted-foreground">
          One application per focused agent. Keys stay on your provider server.
        </p>
        <Button variant="outline" onClick={() => setOpen(true)}>
          Create application
        </Button>
      </div>
      {applications.isPending ? (
        <LoadingState label="Loading applications…" />
      ) : applications.error ? (
        <ErrorState
          message={applications.error.message}
          retry={() => void applications.refetch()}
        />
      ) : !applications.data?.length ? (
        <div className="market-state">
          <p>No applications yet. Create one, issue an API key, then connect your provider SDK.</p>
        </div>
      ) : (
        <>
          <div className="gateway-application-picker">
            <Choice
              label="Application"
              value={selected?.id ?? ""}
              options={applications.data.map((app) => ({ value: app.id, label: app.name }))}
              onChange={(application) =>
                void navigate({ search: { section: "applications", application, view: "keys" } })
              }
            />
            {selected && (
              <StatusBadge status={selected.gatewayConnected ? "connected" : "offline"} />
            )}
          </div>
          {selected ? (
            <>
              <p className="market-caption market-mono">Application {selected.id}</p>
              <nav className="market-tabs" aria-label="Application sections">
                {["keys", "commands", "playground"].map((view) => (
                  <Link
                    key={view}
                    to="/provider"
                    search={{ section: "applications", application: selected.id, view }}
                    className={`market-tab ${search.view === view ? "market-tab--active" : ""}`}
                    aria-current={search.view === view ? "page" : undefined}
                  >
                    {view === "keys" ? "API keys" : view === "commands" ? "Commands" : "Playground"}
                  </Link>
                ))}
              </nav>
              <ApplicationDetails
                key={`${selected.id}-${search.view}`}
                accountId={accountId}
                applicationId={selected.id}
                view={search.view}
              />
            </>
          ) : (
            <Notice>Application unavailable. Select an application you own.</Notice>
          )}
        </>
      )}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!busy) setOpen(next);
        }}
      >
        <DialogContent className="gateway-dialog">
          <DialogTitle>Create application</DialogTitle>
          <DialogDescription>
            A focused agent with its own API keys, command revisions and Gateway connection.
          </DialogDescription>
          <form className="gateway-form" onSubmit={create}>
            <label htmlFor="application-name">
              Application name <span className="text-destructive">*</span>
            </label>
            <Input
              id="application-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={100}
              disabled={busy}
            />
            {error && (
              <p role="alert" className="market-form-error">
                {error}
              </p>
            )}
            <div className="gateway-actions">
              <Button
                variant="outline"
                type="button"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !name.trim()}>
                {busy ? "Creating…" : "Create application"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ApplicationDetails({
  accountId,
  applicationId,
  view,
}: {
  accountId: string;
  applicationId: string;
  view: string;
}) {
  const commands = useQuery({
    queryKey: ["provider", accountId, "commands", applicationId],
    staleTime: 0,
    refetchOnWindowFocus: view !== "playground",
    refetchOnReconnect: view !== "playground",
    refetchInterval: view === "playground" ? false : 5000,
    queryFn: async ({ signal }) => {
      const result = await api.GET("/v1/provider/applications/{applicationId}/commands", {
        params: { path: { applicationId } },
        signal,
      });
      if (result.error || !result.response.ok) throw apiFailure(result.error);
      return result.data ?? null;
    },
  });
  if (view === "keys")
    return <ApplicationKeys accountId={accountId} applicationId={applicationId} />;
  if (commands.isPending) return <LoadingState label="Loading registered commands…" />;
  if (commands.error)
    return <ErrorState message={commands.error.message} retry={() => void commands.refetch()} />;
  if (!commands.data)
    return (
      <div className="market-card market-state">
        <h2>No commands registered</h2>
        <p>
          Register commands from your provider SDK using a key with commands:write scope.
          Registration is an explicit deployment step.
        </p>
      </div>
    );
  if (view === "playground")
    return (
      <Playground
        key={commands.data.id}
        accountId={accountId}
        applicationId={applicationId}
        revision={commands.data}
      />
    );
  return (
    <section className="market-card">
      <div className="gateway-section-heading">
        <h2>Registered commands</h2>
        <span className="market-caption">Immutable revision</span>
      </div>
      <p className="market-caption market-mono mt-2">{commands.data.id}</p>
      {commands.data.commands.length ? (
        commands.data.commands.map((command) => (
          <article className="gateway-command-row" key={command.name}>
            <h3>/{command.name}</h3>
            <p className="text-muted-foreground mt-2">{command.description}</p>
            <pre className="market-code">{JSON.stringify(command.inputSchema, null, 2)}</pre>
          </article>
        ))
      ) : (
        <p className="mt-4 text-muted-foreground">This revision declares no commands.</p>
      )}
      <p className="market-caption mt-4">
        Changing commands creates a new revision. Existing listings and invocations keep their
        pinned revision.
      </p>
    </section>
  );
}

function ApplicationKeys({
  accountId,
  applicationId,
}: {
  accountId: string;
  applicationId: string;
}) {
  const client = useQueryClient();
  const key = ["provider", accountId, "keys", applicationId];
  const keys = useQuery({
    queryKey: key,
    staleTime: 0,
    queryFn: async ({ signal }) => {
      const result = await api.GET("/v1/provider/applications/{applicationId}/keys", {
        params: { path: { applicationId } },
        signal,
      });
      if (!result.data) throw apiFailure(result.error);
      return result.data;
    },
  });
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [scope, setScope] = useState("gateway");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  async function create(event: FormEvent) {
    event.preventDefault();
    if (busy || !label.trim()) return;
    setBusy(true);
    setError("");
    try {
      const scopes: ("gateway:connect" | "commands:write")[] =
        scope === "both"
          ? ["gateway:connect", "commands:write"]
          : scope === "commands"
            ? ["commands:write"]
            : ["gateway:connect"];
      const result = await api.POST("/v1/provider/applications/{applicationId}/keys", {
        params: { path: { applicationId } },
        body: { label: label.trim(), scopes },
      });
      if (!result.data) throw apiFailure(result.error);
      setSecret(result.data.secret);
    } catch (error) {
      setError(
        error instanceof TypeError
          ? "The response was lost. Check the key list and revoke any key whose secret you could not save before creating another."
          : errorMessage(error),
      );
    } finally {
      await client.invalidateQueries({ queryKey: key });
      setBusy(false);
    }
  }
  async function revoke() {
    if (!revokeId || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.DELETE("/v1/provider/applications/{applicationId}/keys/{keyId}", {
        params: { path: { applicationId, keyId: revokeId } },
      });
      if (!result.data) throw apiFailure(result.error);
      await client.invalidateQueries({ queryKey: key });
      setRevokeId(null);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  function dismissSecret() {
    setSecret("");
    setLabel("");
    setScope("gateway");
    setCopied(false);
    setOpen(false);
    setError("");
  }
  return (
    <section className="market-card">
      <header className="gateway-section-heading">
        <h2>API keys</h2>
        <Button
          variant="outline"
          onClick={() => {
            setError("");
            setOpen(true);
          }}
        >
          Create API key
        </Button>
      </header>
      <p className="market-caption mt-2">
        Keys expire after 90 days. Create a replacement before revoking a key in use.
      </p>
      {keys.isPending ? (
        <LoadingState label="Loading API keys…" />
      ) : keys.error ? (
        <ErrorState message={keys.error.message} retry={() => void keys.refetch()} />
      ) : !keys.data?.length ? (
        <p className="py-8 text-muted-foreground">
          No API keys yet. Create a narrowly scoped key for your provider server.
        </p>
      ) : (
        <ul className="gateway-key-list">
          {keys.data.map((item) => (
            <li key={item.id}>
              <div className="min-w-0">
                <h3>{item.label}</h3>
                <p className="market-caption market-mono">{item.prefix}…</p>
                <p className="market-caption">{item.scopes.join(" · ")}</p>
                <p className="market-caption">
                  Expires {new Date(item.expiresAt).toLocaleDateString()}
                </p>
              </div>
              {item.revokedAt ? (
                <StatusBadge status="revoked" />
              ) : (
                <div className="gateway-key-actions">
                  {new Date(item.expiresAt) <= new Date() && <StatusBadge status="expired" />}
                  <Button
                    variant="ghost"
                    className="gateway-danger"
                    onClick={() => {
                      setError("");
                      setRevokeId(item.id);
                    }}
                  >
                    Revoke
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!busy && !secret) {
            setOpen(next);
            setError("");
          }
        }}
      >
        <DialogContent className="gateway-dialog" showCloseButton={!secret && !busy}>
          <DialogTitle>{secret ? "Save your API key" : "Create API key"}</DialogTitle>
          <DialogDescription>
            {secret
              ? "This secret is shown only once. Store it on your provider server, never in browser storage, source code or a manifest."
              : "Only the selected application can use this key. It expires after 90 days."}
          </DialogDescription>
          {secret ? (
            <div className="gateway-form">
              <Input
                aria-label="New API key secret"
                readOnly
                value={secret}
                className="font-mono"
              />
              <div className="gateway-actions">
                <Button
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(secret)
                      .then(() => setCopied(true))
                      .catch(() =>
                        setError("Clipboard unavailable. Select and copy the secret manually."),
                      );
                  }}
                >
                  {copied ? "Copied" : "Copy key"}
                </Button>
                <Button onClick={dismissSecret}>I saved the key</Button>
              </div>
            </div>
          ) : (
            <form className="gateway-form" onSubmit={create}>
              <label htmlFor="key-label">
                Key label <span className="text-destructive">*</span>
              </label>
              <Input
                id="key-label"
                required
                maxLength={100}
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                disabled={busy}
              />
              <label>Permissions</label>
              <Choice
                label="Key permissions"
                value={scope}
                disabled={busy}
                options={[
                  { value: "gateway", label: "Connect to Gateway" },
                  { value: "commands", label: "Register commands" },
                  { value: "both", label: "Register commands + connect" },
                ]}
                onChange={setScope}
              />
              <div className="gateway-actions">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={busy}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={busy || !label.trim()}>
                  {busy ? "Creating…" : "Create key"}
                </Button>
              </div>
            </form>
          )}
          {error && (
            <p role="alert" className="market-form-error">
              {error}
            </p>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!revokeId}
        onOpenChange={(next) => {
          if (!busy && !next) setRevokeId(null);
        }}
      >
        <DialogContent className="gateway-dialog">
          <DialogTitle>Revoke API key?</DialogTitle>
          <DialogDescription>
            This immediately blocks new authentication. Gateway connections using the key will close
            on their next authorization check. Running external work may not stop.
          </DialogDescription>
          {error && (
            <p role="alert" className="market-form-error">
              {error}
            </p>
          )}
          <div className="gateway-actions">
            <Button variant="outline" disabled={busy} onClick={() => setRevokeId(null)}>
              Cancel
            </Button>
            <Button
              variant="ghost"
              className="gateway-danger"
              disabled={busy}
              onClick={() => void revoke()}
            >
              {busy ? "Revoking…" : "Revoke key"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function Playground({
  accountId,
  applicationId,
  revision,
}: {
  accountId: string;
  applicationId: string;
  revision: CommandRevision;
}) {
  const client = useQueryClient();
  const search = useSearch({ from: "/provider" });
  const navigate = useNavigate({ from: "/provider" });
  const [name, setName] = useState(revision.commands[0]?.name ?? "");
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const key = ["provider", accountId, "invocations", applicationId];
  const invocations = useQuery<CommandInvocation[]>({
    queryKey: [...key, offset],
    staleTime: 0,
    refetchInterval: (query) => (query.state.data?.some(isActiveInvocation) ? 1000 : false),
    queryFn: async ({ signal }) => {
      const result = await api.GET("/v1/provider/applications/{applicationId}/dev-invocations", {
        params: { path: { applicationId }, query: { offset } },
        signal,
      });
      if (!result.data) throw apiFailure(result.error);
      return result.data;
    },
  });
  const command = revision.commands.find((command) => command.name === name);
  const focused = useQuery<CommandInvocation>({
    queryKey: [...key, "focused", search.invocation],
    enabled: !!search.invocation,
    staleTime: 0,
    refetchInterval: (query) =>
      query.state.data && isActiveInvocation(query.state.data) ? 1000 : false,
    queryFn: async ({ signal }) => {
      const result = await api.GET(
        "/v1/provider/applications/{applicationId}/dev-invocations/{invocationId}",
        { params: { path: { applicationId, invocationId: search.invocation! } }, signal },
      );
      if (!result.data) throw apiFailure(result.error);
      return result.data;
    },
  });
  async function run(id: string, input: Record<string, string>) {
    try {
      const result = await api.POST("/v1/provider/applications/{applicationId}/dev-invocations", {
        params: { path: { applicationId } },
        body: { id, revisionId: revision.id, command: name, input },
      });
      if (!result.data) throw apiFailure(result.error);
      setOffset(0);
      await navigate({
        search: {
          section: "applications",
          application: applicationId,
          view: "playground",
          invocation: result.data.id,
        },
      });
    } finally {
      await client.invalidateQueries({ queryKey: key });
    }
  }
  return (
    <div className="gateway-playground">
      <section className="market-card">
        <h2>Run a development command</h2>
        <p className="market-caption mt-2 mb-4">
          Owner-only sandbox. The provider receives only these inputs, not your workspace history or
          credentials.
        </p>
        {revision.commands.length ? (
          <>
            <Choice
              label="Command"
              value={name}
              disabled={busy}
              options={revision.commands.map((command) => ({
                value: command.name,
                label: `/${command.name}`,
              }))}
              onChange={setName}
            />
            {command && (
              <CommandForm
                key={`${revision.id}-${name}`}
                command={command}
                revisionId={revision.id}
                onRun={run}
                onBusyChange={setBusy}
              />
            )}
          </>
        ) : (
          <p>No commands in this revision.</p>
        )}
      </section>
      <section className="market-card">
        <h2>Invocation history</h2>
        <p className="market-caption mt-2">
          Reloading reads saved status; it does not run a command again.
        </p>
        {focused.error && (
          <ErrorState message={focused.error.message} retry={() => void focused.refetch()} />
        )}
        {focused.data &&
          !invocations.data?.some((invocation) => invocation.id === focused.data.id) && (
            <InvocationCard invocation={focused.data} />
          )}
        {invocations.isPending ? (
          <LoadingState label="Loading invocations…" />
        ) : invocations.error ? (
          <ErrorState
            message={invocations.error.message}
            retry={() => void invocations.refetch()}
          />
        ) : invocations.data?.length ? (
          invocations.data.map((invocation) => (
            <InvocationCard key={invocation.id} invocation={invocation} />
          ))
        ) : (
          <p className="py-8 text-muted-foreground">
            No invocations yet. Choose a command and confirm its inputs to run it.
          </p>
        )}
        <Pagination
          offset={offset}
          hasMore={invocations.data?.length === 50}
          onChange={setOffset}
          label="Invocation history pages"
        />
      </section>
    </div>
  );
}
