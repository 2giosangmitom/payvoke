import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Copy,
  KeyRound,
  LoaderCircle,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { authClient } from "@/src/lib/auth-client";
import {
  activateProviderApp,
  archiveProviderApp,
  archiveProviderCommand,
  createProviderCommand,
  createProviderKey,
  defaultTerms,
  formatUsdc,
  fromAtomicUsdc,
  getProviderApp,
  getStoreApp,
  listProviderKeys,
  revokeProviderKey,
  setDefaultCommand,
  suspendProviderApp,
  toAtomicUsdc,
  updateProviderApp,
  updateProviderCommand,
  type CommandInput,
  type CommandTerms,
  type ProviderAppDetail,
  type ProviderCommand,
} from "@/src/lib/apps";
import type { CommandOption } from "@/src/lib/paid-chat";
import { newThread } from "@/src/lib/paid-chat";

const optionTypes: CommandOption["type"][] = ["STRING", "INTEGER", "NUMBER", "BOOLEAN"];
const errorText = (cause: unknown) => (cause instanceof Error ? cause.message : "Request failed.");

function blankOption(): CommandOption {
  return { name: "", description: "", type: "STRING", required: false };
}

function CommandEditor({
  appId,
  command,
  open,
  onClose,
}: {
  appId: string;
  command: ProviderCommand | null;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const revision = command?.revision;
  const [name, setName] = useState(command?.name ?? "");
  const [description, setDescription] = useState(command?.description ?? "");
  const [options, setOptions] = useState<CommandOption[]>(revision?.options ?? [blankOption()]);
  const [positional, setPositional] = useState(revision?.positionalParameter ?? "");
  const [price, setPrice] = useState(revision ? fromAtomicUsdc(revision.grossAmount) : "0.01");
  const [delivery, setDelivery] = useState(String(revision?.deliverySeconds ?? 600));
  const [review, setReview] = useState(String(revision?.reviewSeconds ?? 3600));
  const [terms, setTerms] = useState<CommandTerms>(revision?.terms ?? defaultTerms());
  const [output, setOutput] = useState(
    revision?.outputSchema ? JSON.stringify(revision.outputSchema, null, 2) : "",
  );
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: (payload: CommandInput) =>
      command
        ? updateProviderCommand(appId, command.id, payload)
        : createProviderCommand(appId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["provider", "app", appId] });
      void queryClient.invalidateQueries({ queryKey: ["provider", "apps"] });
      onClose();
    },
    onError: (cause) => setError(errorText(cause)),
  });
  if (!open) return null;
  const validOptions = options.filter((option) => option.name.trim());
  const stringOptions = validOptions.filter((option) => option.type === "STRING");
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="command-editor">
        <DialogHeader>
          <DialogTitle>{command ? `Edit /${command.name}` : "New slash command"}</DialogTitle>
        </DialogHeader>
        <p className="command-dialog-description">
          Editing creates a new immutable revision. Quotes already issued keep their revision.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setError("");
            let parsedOutput: unknown;
            if (output.trim()) {
              try {
                parsedOutput = JSON.parse(output);
              } catch {
                setError("Output schema must be valid JSON.");
                return;
              }
            }
            try {
              save.mutate({
                name: name.trim(),
                description: description.trim(),
                options: validOptions,
                positionalParameter: positional || null,
                grossAmount: toAtomicUsdc(price),
                terms: {
                  ...terms,
                  deliverySeconds: Number(delivery),
                  reviewSeconds: Number(review),
                },
                ...(parsedOutput !== undefined ? { outputSchema: parsedOutput } : {}),
                ...(revision ? { expectedRevisionId: revision.id } : {}),
              });
            } catch (cause) {
              setError(errorText(cause));
            }
          }}
        >
          <div className="command-editor-grid">
            <label htmlFor="command-name">
              Command name
              <span className="command-input-prefix">
                <SlashIcon />{" "}
                <Input
                  id="command-name"
                  value={name}
                  onChange={(event) => setName(event.target.value.replace(/[^a-z0-9_]/g, ""))}
                  required
                  maxLength={32}
                  pattern="[a-z][a-z0-9_]{0,31}"
                  placeholder="summarize"
                  spellCheck={false}
                />
              </span>
            </label>
            <label htmlFor="command-price">
              Price per request (USDC)
              <Input
                id="command-price"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                inputMode="decimal"
                required
              />
            </label>
          </div>
          <label htmlFor="command-description">
            Description
            <Textarea
              id="command-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              required
              maxLength={2000}
            />
          </label>

          <fieldset className="command-options">
            <legend>Arguments</legend>
            {options.map((option, index) => (
              <div className="command-option-row" key={index}>
                <Input
                  aria-label={`Argument ${index + 1} name`}
                  value={option.name}
                  placeholder="text"
                  onChange={(event) =>
                    setOptions((current) =>
                      current.map((item, at) =>
                        at === index
                          ? { ...item, name: event.target.value.replace(/[^a-zA-Z0-9_]/g, "") }
                          : item,
                      ),
                    )
                  }
                  required
                />
                <select
                  aria-label={`Argument ${index + 1} type`}
                  value={option.type}
                  onChange={(event) =>
                    setOptions((current) =>
                      current.map((item, at) =>
                        at === index
                          ? { ...item, type: event.target.value as CommandOption["type"] }
                          : item,
                      ),
                    )
                  }
                >
                  {optionTypes.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
                <label className="command-required">
                  <input
                    type="checkbox"
                    checked={Boolean(option.required)}
                    onChange={(event) =>
                      setOptions((current) =>
                        current.map((item, at) =>
                          at === index ? { ...item, required: event.target.checked } : item,
                        ),
                      )
                    }
                  />{" "}
                  Required
                </label>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove argument ${index + 1}`}
                  disabled={options.length === 1}
                  onClick={() => setOptions((current) => current.filter((_, at) => at !== index))}
                >
                  <Trash2 size={15} />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setOptions((current) => [...current, blankOption()])}
            >
              <Plus size={14} /> Add argument
            </Button>
          </fieldset>

          <label htmlFor="command-positional">
            Free text maps to
            <select
              id="command-positional"
              value={positional}
              onChange={(event) => setPositional(event.target.value)}
            >
              <option value="">No positional argument (form only)</option>
              {stringOptions.map((option) => (
                <option key={option.name} value={option.name}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>

          <div className="command-editor-grid">
            <label htmlFor="command-delivery">
              Delivery deadline (seconds)
              <Input
                id="command-delivery"
                type="number"
                min={1}
                value={delivery}
                onChange={(event) => setDelivery(event.target.value)}
                required
              />
            </label>
            <label htmlFor="command-review">
              Review window (seconds)
              <Input
                id="command-review"
                type="number"
                min={0}
                value={review}
                onChange={(event) => setReview(event.target.value)}
                required
              />
            </label>
          </div>

          <div className="command-editor-grid">
            <label htmlFor="command-refund">
              Refund policy
              <Input
                id="command-refund"
                value={terms.refundPolicy}
                onChange={(event) =>
                  setTerms((current) => ({ ...current, refundPolicy: event.target.value }))
                }
                required
              />
            </label>
            <label htmlFor="command-side-effects">
              Side effects
              <Input
                id="command-side-effects"
                value={terms.sideEffects}
                onChange={(event) =>
                  setTerms((current) => ({ ...current, sideEffects: event.target.value }))
                }
                required
              />
            </label>
          </div>
          <label htmlFor="command-data-use">
            Data use
            <Input
              id="command-data-use"
              value={terms.dataUse}
              onChange={(event) =>
                setTerms((current) => ({ ...current, dataUse: event.target.value }))
              }
              required
            />
          </label>
          <div className="command-editor-grid">
            <label htmlFor="command-revisions">
              Included revisions
              <Input
                id="command-revisions"
                type="number"
                min={0}
                value={terms.revisionPolicy.maxIncluded}
                onChange={(event) =>
                  setTerms((current) => ({
                    ...current,
                    revisionPolicy: {
                      ...current.revisionPolicy,
                      maxIncluded: Number(event.target.value),
                    },
                  }))
                }
              />
            </label>
            <label htmlFor="command-revision-description">
              Revision scope
              <Input
                id="command-revision-description"
                value={terms.revisionPolicy.description}
                onChange={(event) =>
                  setTerms((current) => ({
                    ...current,
                    revisionPolicy: {
                      ...current.revisionPolicy,
                      description: event.target.value,
                    },
                  }))
                }
              />
            </label>
          </div>
          <details className="command-advanced">
            <summary>Output schema (optional JSON Schema)</summary>
            <Textarea
              aria-label="Output JSON schema"
              rows={5}
              value={output}
              onChange={(event) => setOutput(event.target.value)}
              placeholder='{"type":"object","properties":{"summary":{"type":"string"}}}'
              spellCheck={false}
            />
          </details>
          {error && (
            <div className="run-error" role="alert">
              {error}
            </div>
          )}
          <div className="run-payment-actions">
            <Button type="submit" disabled={save.isPending || !name.trim()}>
              {save.isPending ? <LoaderCircle size={14} className="animate-spin" /> : null}
              {command ? "Create revision" : "Create command"}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose} disabled={save.isPending}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SlashIcon() {
  return <span aria-hidden="true">/</span>;
}

function CommandsTab({ app }: { app: ProviderAppDetail }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<ProviderCommand | null | undefined>(undefined);
  const [error, setError] = useState("");
  const defaultCommand = useMutation({
    mutationFn: (commandId: string) => setDefaultCommand(app.id, commandId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["provider", "app", app.id] });
      void queryClient.invalidateQueries({ queryKey: ["provider", "apps"] });
    },
    onError: (cause) => setError(errorText(cause)),
  });
  const archive = useMutation({
    mutationFn: (commandId: string) => archiveProviderCommand(app.id, commandId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["provider", "app", app.id] });
      void queryClient.invalidateQueries({ queryKey: ["provider", "apps"] });
    },
    onError: (cause) => setError(errorText(cause)),
  });
  return (
    <div className="dashboard-panel">
      <div className="store-section-head">
        <div>
          <p className="workspace-kicker">SLASH COMMANDS</p>
          <h2>What buyers can call</h2>
        </div>
        <Button className="button-primary" onClick={() => setEditing(null)}>
          <Plus size={15} /> New command
        </Button>
      </div>
      <p className="workspace-panel-description">
        A command owns stable identity and options. Each save creates a revision. Free text routes
        to the default command&apos;s positional argument.
      </p>
      {error && (
        <div className="run-error" role="alert">
          {error}
        </div>
      )}
      {app.commands.length === 0 ? (
        <div className="store-empty">
          <h2>No commands yet.</h2>
          <span>An app needs an active command and a default command before it can be quoted.</span>
          <Button className="button-primary" onClick={() => setEditing(null)}>
            Create command
          </Button>
        </div>
      ) : (
        <div className="provider-command-list">
          {app.commands.map((command) => (
            <article key={command.id} className="provider-command">
              <div className="provider-command-top">
                <div>
                  <div className="store-command-name">
                    <code>/{command.name}</code>
                    {command.id === app.defaultCommandId && <span>DEFAULT</span>}
                  </div>
                  <p>{command.description}</p>
                </div>
                <div className="provider-command-actions">
                  {command.id !== app.defaultCommandId && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={defaultCommand.isPending}
                      onClick={() => defaultCommand.mutate(command.id)}
                    >
                      Make default
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setEditing(command)}>
                    <Pencil size={13} /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Archive ${command.name}`}
                    disabled={archive.isPending}
                    onClick={() => archive.mutate(command.id)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
              {command.revision && (
                <>
                  <div className="store-command-terms">
                    <span>{formatUsdc(command.revision.grossAmount)}</span>
                    <span>{command.revision.options.length} arguments</span>
                    <span>free text → {command.revision.positionalParameter || "form only"}</span>
                    <span>revision {command.revision.id.slice(0, 8)}</span>
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
              )}
            </article>
          ))}
        </div>
      )}
      {editing !== undefined && (
        <CommandEditor
          key={editing?.id ?? "new"}
          appId={app.id}
          command={editing}
          open
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  );
}

function KeysTab({ app }: { app: ProviderAppDetail }) {
  const queryClient = useQueryClient();
  const [secret, setSecret] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const keys = useQuery({
    queryKey: ["provider", "app", app.id, "keys"],
    queryFn: () => listProviderKeys(app.id),
    staleTime: 10_000,
  });
  const create = useMutation({
    mutationFn: () => createProviderKey(app.id),
    onSuccess: (data) => {
      setSecret(data.secret);
      setConfirm(false);
      setCopied(false);
      void queryClient.invalidateQueries({ queryKey: ["provider", "app", app.id, "keys"] });
    },
    onError: (cause) => setError(errorText(cause)),
  });
  const revoke = useMutation({
    mutationFn: (keyId: string) => revokeProviderKey(app.id, keyId),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["provider", "app", app.id, "keys"] }),
    onError: (cause) => setError(errorText(cause)),
  });
  const active = keys.data?.find((key) => !key.revokedAt && Date.parse(key.expiresAt) > Date.now());
  return (
    <div className="dashboard-panel">
      <div className="store-section-head">
        <div>
          <p className="workspace-kicker">PROVIDER API KEYS</p>
          <h2>One active machine key</h2>
        </div>
        <Button
          className="button-primary"
          onClick={() => (active ? setConfirm(true) : create.mutate())}
        >
          {create.isPending ? (
            <LoaderCircle size={14} className="animate-spin" />
          ) : active ? (
            <RotateCcw size={14} />
          ) : (
            <KeyRound size={14} />
          )}
          {active ? "Rotate key" : "Create key"}
        </Button>
      </div>
      <p className="workspace-panel-description">
        The worker uses this bearer key for events, reports, and command writes. Rotating revokes
        the previous key immediately. The secret is shown once and never stored in the browser
        cache.
      </p>
      {secret && (
        <div className="provider-secret" role="status">
          <div>
            <strong>Copy this key now. It will not be shown again.</strong>
            <code>{secret}</code>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(secret).then(() => setCopied(true));
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy key"}
          </Button>
          <Button variant="ghost" onClick={() => setSecret("")}>
            Dismiss
          </Button>
        </div>
      )}
      {error && (
        <div className="run-error" role="alert">
          {error}
        </div>
      )}
      {keys.isPending ? (
        <div className="store-loading">
          <LoaderCircle size={16} className="animate-spin" /> Loading keys…
        </div>
      ) : (keys.data ?? []).length === 0 ? (
        <div className="store-empty">
          <h2>No keys yet.</h2>
          <span>Create one when the provider worker is ready to connect.</span>
        </div>
      ) : (
        <div className="provider-key-list">
          {keys.data?.map((key) => {
            const revoked = Boolean(key.revokedAt);
            const expired = Date.parse(key.expiresAt) <= Date.now();
            return (
              <article
                key={key.id}
                className={revoked || expired ? "provider-key is-off" : "provider-key"}
              >
                <div>
                  <code>{key.prefix}…</code>
                  <span>{key.scopes.join(" · ")}</span>
                </div>
                <div>
                  <span>
                    {revoked ? "Revoked" : expired ? "Expired" : "Active"} · expires{" "}
                    {new Date(key.expiresAt).toLocaleString()}
                  </span>
                  {!revoked && !expired && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={revoke.isPending}
                      onClick={() => revoke.mutate(key.id)}
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent className="thread-rename-dialog">
          <DialogHeader>
            <DialogTitle>Rotate the active key?</DialogTitle>
          </DialogHeader>
          <p className="command-dialog-description">
            The current worker key will stop working immediately. Update the provider deployment
            with the new secret before it reconnects.
          </p>
          <div className="run-payment-actions">
            <Button disabled={create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? <LoaderCircle size={14} className="animate-spin" /> : null} Rotate
              key
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SettingsTab({ app }: { app: ProviderAppDetail }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState(app.name);
  const [description, setDescription] = useState(app.description ?? "");
  const [visibility, setVisibility] = useState(app.visibility);
  const [payout, setPayout] = useState(app.payoutAddress);
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: () =>
      updateProviderApp(app.id, {
        name: name.trim(),
        description: description.trim() || null,
        visibility,
        payoutAddress: payout.trim(),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["provider", "app", app.id] });
      void queryClient.invalidateQueries({ queryKey: ["provider", "apps"] });
    },
    onError: (cause) => setError(errorText(cause)),
  });
  const status = useMutation({
    mutationFn: () =>
      app.status === "ACTIVE" ? suspendProviderApp(app.id) : activateProviderApp(app.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["provider", "app", app.id] });
      void queryClient.invalidateQueries({ queryKey: ["provider", "apps"] });
      void queryClient.invalidateQueries({ queryKey: ["store"] });
    },
    onError: (cause) => setError(errorText(cause)),
  });
  const archive = useMutation({
    mutationFn: () => archiveProviderApp(app.id),
    onSuccess: () => void navigate({ to: "/dashboard" }),
    onError: (cause) => setError(errorText(cause)),
  });
  return (
    <div className="dashboard-panel">
      <div className="store-section-head">
        <div>
          <p className="workspace-kicker">APP SETTINGS</p>
          <h2>Public face, private controls</h2>
        </div>
        <span className={`store-status is-${app.availability.toLowerCase()}`}>
          <i aria-hidden="true" /> {app.availability.toLowerCase()}
        </span>
      </div>
      <form
        className="provider-settings"
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          save.mutate();
        }}
      >
        <label htmlFor="settings-name">
          App name
          <Input
            id="settings-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={80}
          />
        </label>
        <label htmlFor="settings-description">
          Description
          <Textarea
            id="settings-description"
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={2000}
          />
        </label>
        <label htmlFor="settings-payout">
          Payout address
          <Input
            id="settings-payout"
            value={payout}
            onChange={(event) => setPayout(event.target.value)}
            required
            spellCheck={false}
          />
        </label>
        <fieldset className="dashboard-choice">
          <legend>Store visibility</legend>
          <label>
            <input
              type="radio"
              name="settings-visibility"
              checked={visibility === "PUBLIC"}
              onChange={() => setVisibility("PUBLIC")}
            />
            <span>
              <strong>Public</strong>
              <small>Listed in the store.</small>
            </span>
          </label>
          <label>
            <input
              type="radio"
              name="settings-visibility"
              checked={visibility === "PRIVATE"}
              onChange={() => setVisibility("PRIVATE")}
            />
            <span>
              <strong>Private</strong>
              <small>Owner-only, never listed.</small>
            </span>
          </label>
        </fieldset>
        <Button type="submit" className="button-primary" disabled={save.isPending}>
          {save.isPending ? <LoaderCircle size={14} className="animate-spin" /> : null} Save
          settings
        </Button>
      </form>
      {error && (
        <div className="run-error" role="alert">
          {error}
        </div>
      )}
      <section className="provider-danger">
        <div>
          <p className="workspace-kicker">PRESENCE</p>
          <h3>{app.status === "ACTIVE" ? "Suspend this app" : "Reactivate this app"}</h3>
          <p>
            {app.status === "ACTIVE"
              ? "Suspending blocks new threads and quotes. Existing threads stay readable."
              : "Reactivating restores the store listing and new quotes once the heartbeat returns."}
          </p>
        </div>
        <Button variant="outline" disabled={status.isPending} onClick={() => status.mutate()}>
          {status.isPending ? <LoaderCircle size={14} className="animate-spin" /> : null}
          {app.status === "ACTIVE" ? "Suspend app" : "Activate app"}
        </Button>
      </section>
      <section className="provider-danger">
        <div>
          <p className="workspace-kicker">ARCHIVE</p>
          <h3>Remove this app from your control room</h3>
          <p>
            Archiving keeps historical threads and paid receipts, but blocks new quotes and removes
            the app from the store.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={archive.isPending}
          onClick={() => {
            if (window.confirm("Archive this app? Existing threads remain readable."))
              archive.mutate();
          }}
        >
          <Trash2 size={14} /> Archive app
        </Button>
      </section>
    </div>
  );
}

export function ProviderAppPage({ appId }: { appId: string }) {
  const navigate = useNavigate();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const { data: session } = authClient.useSession();
  const app = useQuery({
    queryKey: ["provider", "app", appId],
    queryFn: () => getProviderApp(appId),
    enabled: Boolean(session),
    refetchInterval: 15_000,
  });
  const publicApp = useQuery({
    queryKey: ["store", "app", appId],
    queryFn: () => getStoreApp(appId),
    enabled: Boolean(session && app.data?.visibility === "PUBLIC"),
  });
  if (!session)
    return (
      <main className="dashboard-shell dashboard-gate">
        <div>
          <h1>Sign in to manage this app.</h1>
          <p>Provider controls are scoped to the wallet that owns the app.</p>
        </div>
        <Link to="/dashboard">Back to Studio</Link>
      </main>
    );
  if (app.isPending)
    return (
      <main className="dashboard-shell store-detail-state">
        <LoaderCircle className="animate-spin" /> Loading app…
      </main>
    );
  if (app.isError || !app.data)
    return (
      <main className="dashboard-shell store-detail-state" role="alert">
        {app.error ? errorText(app.error) : "App not found."}
        <Button render={<Link to="/dashboard" />} variant="outline">
          Back to Studio
        </Button>
      </main>
    );
  const data = app.data;
  return (
    <main className="dashboard-shell dashboard-app-shell">
      <Link to="/dashboard" className="store-back">
        <ArrowLeft size={15} /> Studio
      </Link>
      <header className="dashboard-app-head">
        <div>
          <p className="workspace-kicker">APP / {data.id.slice(0, 8)}</p>
          <h1>{data.name}</h1>
          <p>{data.description || "No description yet."}</p>
          <div className="store-detail-tags">
            <span className={`store-status is-${data.availability.toLowerCase()}`}>
              <i aria-hidden="true" /> {data.availability.toLowerCase()}
            </span>
            <span>{data.visibility.toLowerCase()}</span>
            <span>{data.commands.length} commands</span>
            <span>
              heartbeat{" "}
              {data.lastHeartbeatAt ? new Date(data.lastHeartbeatAt).toLocaleTimeString() : "never"}
            </span>
          </div>
        </div>
        <div className="dashboard-app-head-actions">
          <Button
            className="button-primary"
            disabled={opening || data.availability !== "AVAILABLE"}
            onClick={() => {
              setOpening(true);
              setError("");
              void newThread(data.id)
                .then((thread) =>
                  navigate({ to: "/chat/$threadId", params: { threadId: thread.id } }),
                )
                .catch((cause) => setError(errorText(cause)))
                .finally(() => setOpening(false));
            }}
          >
            {opening ? <LoaderCircle size={14} className="animate-spin" /> : null} Open chat
          </Button>
          {data.visibility === "PUBLIC" && publicApp.data && (
            <Button
              variant="outline"
              render={<Link to="/store/$appId" params={{ appId: data.id }} />}
            >
              Store page <ArrowUpRight size={14} />
            </Button>
          )}
        </div>
      </header>
      {error && (
        <div className="run-error" role="alert">
          {error}
        </div>
      )}
      <Tabs defaultValue="commands" className="dashboard-tabs">
        <TabsList>
          <TabsTrigger value="commands">Commands</TabsTrigger>
          <TabsTrigger value="keys">API keys</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="commands">
          <CommandsTab app={data} />
        </TabsContent>
        <TabsContent value="keys">
          <KeysTab app={data} />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsTab app={data} />
        </TabsContent>
      </Tabs>
    </main>
  );
}
