import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Check,
  Copy,
  KeyRound,
  MessageSquareText,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { NativeSelect, NativeSelectOption } from "./ui/native-select";
import { Spinner } from "./ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Textarea } from "./ui/textarea";
import { CommandCard } from "./command-card";
import {
  AppStatus,
  BackLink,
  EmptyState,
  ErrorNotice,
  FormField,
  LoadingState,
  PageHeader,
  PageShell,
  SectionHeader,
  Tag,
  errorMessage,
  plural,
} from "./page-kit";
import { VisibilityField } from "./visibility-field";
import { authClient } from "@/src/lib/auth-client";
import {
  activateProviderApp,
  archiveProviderApp,
  archiveProviderCommand,
  createProviderCommand,
  createProviderKey,
  defaultTerms,
  formatCommandPrice,
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
  type AppKind,
  type CommandInput,
  type CommandTerms,
  type ProviderAppDetail,
  type ProviderCommand,
} from "@/src/lib/apps";
import type { CommandOption } from "@/src/lib/paid-chat";
import { newThread } from "@/src/lib/paid-chat";
import { cn } from "@/src/lib/utils";

const optionTypes: CommandOption["type"][] = ["STRING", "INTEGER", "NUMBER", "BOOLEAN"];

function blankOption(): CommandOption {
  return { name: "", description: "", type: "STRING", required: false };
}

function CommandEditor({
  appId,
  kind,
  command,
  open,
  onClose,
}: {
  appId: string;
  kind: AppKind;
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
  const [price, setPrice] = useState(
    revision?.grossAmount ? fromAtomicUsdc(revision.grossAmount) : "0.01",
  );
  // Agents publish the range their offers must fall within.
  const [minPrice, setMinPrice] = useState(
    revision?.minGrossAmount ? fromAtomicUsdc(revision.minGrossAmount) : "0.01",
  );
  const [maxPrice, setMaxPrice] = useState(
    revision?.maxGrossAmount ? fromAtomicUsdc(revision.maxGrossAmount) : "1",
  );
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
    onError: (cause) => setError(errorMessage(cause)),
  });
  if (!open) return null;
  const validOptions = options.filter((option) => option.name.trim());
  const stringOptions = validOptions.filter((option) => option.type === "STRING");
  const updateOption = (index: number, patch: Partial<CommandOption>) =>
    setOptions((current) =>
      current.map((item, at) => (at === index ? { ...item, ...patch } : item)),
    );

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{command ? `Edit /${command.name}` : "New slash command"}</DialogTitle>
          <DialogDescription>
            Saving creates a new revision. Quotes that were already issued keep the old one.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-5"
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
                ...(kind === "AGENT"
                  ? {
                      minGrossAmount: toAtomicUsdc(minPrice),
                      maxGrossAmount: toAtomicUsdc(maxPrice),
                    }
                  : { grossAmount: toAtomicUsdc(price) }),
                terms: {
                  ...terms,
                  deliverySeconds: Number(delivery),
                  reviewSeconds: Number(review),
                },
                ...(parsedOutput !== undefined ? { outputSchema: parsedOutput } : {}),
                ...(revision ? { expectedRevisionId: revision.id } : {}),
              });
            } catch (cause) {
              setError(errorMessage(cause));
            }
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Command name" htmlFor="command-name">
              <div className="flex items-center border border-input bg-background-deep pl-3 font-mono text-primary focus-within:border-ring">
                <span aria-hidden="true">/</span>
                <Input
                  id="command-name"
                  value={name}
                  onChange={(event) => setName(event.target.value.replace(/[^a-z0-9_]/g, ""))}
                  required
                  maxLength={32}
                  pattern="[a-z][a-z0-9_]{0,31}"
                  placeholder="summarize"
                  spellCheck={false}
                  className="border-0 bg-transparent pl-1 font-mono focus-visible:ring-0"
                />
              </div>
            </FormField>
            {kind === "AGENT" ? (
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Lowest offer (USDC)" htmlFor="command-min-price">
                  <Input
                    id="command-min-price"
                    value={minPrice}
                    onChange={(event) => setMinPrice(event.target.value)}
                    inputMode="decimal"
                    required
                    className="font-mono"
                  />
                </FormField>
                <FormField label="Highest offer (USDC)" htmlFor="command-max-price">
                  <Input
                    id="command-max-price"
                    value={maxPrice}
                    onChange={(event) => setMaxPrice(event.target.value)}
                    inputMode="decimal"
                    required
                    className="font-mono"
                  />
                </FormField>
              </div>
            ) : (
              <FormField label="Price per request (USDC)" htmlFor="command-price">
                <Input
                  id="command-price"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  inputMode="decimal"
                  required
                  className="font-mono"
                />
              </FormField>
            )}
          </div>
          <FormField label="Description" htmlFor="command-description">
            <Textarea
              id="command-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              required
              maxLength={2000}
            />
          </FormField>

          <fieldset className="grid gap-2 border border-border p-4">
            <legend className="px-1 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
              Arguments
            </legend>
            {options.map((option, index) => (
              <div
                key={index}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_auto_auto]"
              >
                <Input
                  aria-label={`Argument ${index + 1} name`}
                  value={option.name}
                  placeholder="text"
                  onChange={(event) =>
                    updateOption(index, { name: event.target.value.replace(/[^a-zA-Z0-9_]/g, "") })
                  }
                  required
                  className="font-mono"
                />
                <NativeSelect
                  aria-label={`Argument ${index + 1} type`}
                  value={option.type}
                  onChange={(event) =>
                    updateOption(index, { type: event.target.value as CommandOption["type"] })
                  }
                  className="w-full"
                >
                  {optionTypes.map((type) => (
                    <NativeSelectOption key={type}>{type}</NativeSelectOption>
                  ))}
                </NativeSelect>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox
                    checked={Boolean(option.required)}
                    onCheckedChange={(checked) => updateOption(index, { required: checked })}
                  />
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
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-1 justify-self-start"
              onClick={() => setOptions((current) => [...current, blankOption()])}
            >
              <Plus /> Add argument
            </Button>
          </fieldset>

          <FormField label="Plain text maps to" htmlFor="command-positional">
            <NativeSelect
              id="command-positional"
              value={positional}
              onChange={(event) => setPositional(event.target.value)}
              className="w-full"
            >
              <NativeSelectOption value="">Nothing (always open the form)</NativeSelectOption>
              {stringOptions.map((option) => (
                <NativeSelectOption key={option.name} value={option.name}>
                  {option.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Delivery deadline (seconds)" htmlFor="command-delivery">
              <Input
                id="command-delivery"
                type="number"
                min={1}
                value={delivery}
                onChange={(event) => setDelivery(event.target.value)}
                required
              />
            </FormField>
            <FormField label="Review window (seconds)" htmlFor="command-review">
              <Input
                id="command-review"
                type="number"
                min={0}
                value={review}
                onChange={(event) => setReview(event.target.value)}
                required
              />
            </FormField>
            <FormField label="Refund policy" htmlFor="command-refund">
              <Input
                id="command-refund"
                value={terms.refundPolicy}
                onChange={(event) =>
                  setTerms((current) => ({ ...current, refundPolicy: event.target.value }))
                }
                required
              />
            </FormField>
            <FormField label="Side effects" htmlFor="command-side-effects">
              <Input
                id="command-side-effects"
                value={terms.sideEffects}
                onChange={(event) =>
                  setTerms((current) => ({ ...current, sideEffects: event.target.value }))
                }
                required
              />
            </FormField>
          </div>
          <FormField label="Data use" htmlFor="command-data-use">
            <Input
              id="command-data-use"
              value={terms.dataUse}
              onChange={(event) =>
                setTerms((current) => ({ ...current, dataUse: event.target.value }))
              }
              required
            />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Included revisions" htmlFor="command-revisions">
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
            </FormField>
            <FormField label="Revision scope" htmlFor="command-revision-description">
              <Input
                id="command-revision-description"
                value={terms.revisionPolicy.description}
                onChange={(event) =>
                  setTerms((current) => ({
                    ...current,
                    revisionPolicy: { ...current.revisionPolicy, description: event.target.value },
                  }))
                }
              />
            </FormField>
          </div>
          <details className="group border border-border">
            <summary className="px-4 py-3 font-mono text-xs text-muted-foreground group-open:border-b group-open:border-border hover:text-primary">
              Output schema (optional JSON Schema)
            </summary>
            <Textarea
              aria-label="Output JSON schema"
              rows={5}
              value={output}
              onChange={(event) => setOutput(event.target.value)}
              placeholder='{"type":"object","properties":{"summary":{"type":"string"}}}'
              spellCheck={false}
              className="border-0 font-mono text-xs"
            />
          </details>
          {error && <ErrorNotice className="my-0">{error}</ErrorNotice>}
          <div className="flex gap-2">
            <Button type="submit" disabled={save.isPending || !name.trim()}>
              {save.isPending && <Spinner />}
              {command ? "Save new revision" : "Create command"}
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

function PanelIntro({ children }: { children: string }) {
  return <p className="mb-6 max-w-2xl text-sm leading-relaxed text-muted-foreground">{children}</p>;
}

function CommandsTab({ app }: { app: ProviderAppDetail }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<ProviderCommand | null | undefined>(undefined);
  const [error, setError] = useState("");
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["provider", "app", app.id] });
    void queryClient.invalidateQueries({ queryKey: ["provider", "apps"] });
  };
  const defaultCommand = useMutation({
    mutationFn: (commandId: string) => setDefaultCommand(app.id, commandId),
    onSuccess: refresh,
    onError: (cause) => setError(errorMessage(cause)),
  });
  const archive = useMutation({
    mutationFn: (commandId: string) => archiveProviderCommand(app.id, commandId),
    onSuccess: refresh,
    onError: (cause) => setError(errorMessage(cause)),
  });
  return (
    <div>
      <SectionHeader
        eyebrow="Slash commands"
        title="What buyers can call"
        aside={
          <Button onClick={() => setEditing(null)}>
            <Plus /> New command
          </Button>
        }
      />
      <PanelIntro>
        A command keeps its name and options; every save adds a revision. Plain text in a thread
        goes to the default command&apos;s positional argument.
      </PanelIntro>
      {error && <ErrorNotice>{error}</ErrorNotice>}
      {app.commands.length === 0 ? (
        <EmptyState
          title="No commands yet."
          action={<Button onClick={() => setEditing(null)}>Create command</Button>}
        >
          The app needs at least one command, set as default, before it can quote a price.
        </EmptyState>
      ) : (
        <div className="grid gap-3">
          {app.commands.map((command) => (
            <CommandCard
              key={command.id}
              name={command.name}
              description={command.description}
              isDefault={command.id === app.defaultCommandId}
              revision={command.revision}
              terms={
                command.revision && [
                  formatCommandPrice(command.revision),
                  plural(command.revision.options.length, "argument"),
                  `plain text → ${command.revision.positionalParameter || "form only"}`,
                  `revision ${command.revision.id.slice(0, 8)}`,
                ]
              }
              actions={
                <>
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
                    <Pencil /> Edit
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Archive ${command.name}`}
                    disabled={archive.isPending}
                    onClick={() => archive.mutate(command.id)}
                  >
                    <Trash2 />
                  </Button>
                </>
              }
            />
          ))}
        </div>
      )}
      {editing !== undefined && (
        <CommandEditor
          key={editing?.id ?? "new"}
          appId={app.id}
          kind={app.kind}
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
    onError: (cause) => setError(errorMessage(cause)),
  });
  const revoke = useMutation({
    mutationFn: (keyId: string) => revokeProviderKey(app.id, keyId),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["provider", "app", app.id, "keys"] }),
    onError: (cause) => setError(errorMessage(cause)),
  });
  const active = keys.data?.find((key) => !key.revokedAt && Date.parse(key.expiresAt) > Date.now());
  return (
    <div>
      <SectionHeader
        eyebrow="Provider API keys"
        title="One active key for your worker"
        aside={
          <Button onClick={() => (active ? setConfirm(true) : create.mutate())}>
            {create.isPending ? <Spinner /> : active ? <RotateCcw /> : <KeyRound />}
            {active ? "Rotate key" : "Create key"}
          </Button>
        }
      />
      <PanelIntro>
        Your worker sends this bearer key with events, reports and command writes. Rotating revokes
        the old key right away. The secret is shown once and is never cached in the browser.
      </PanelIntro>
      {secret && (
        <div
          role="status"
          className="mb-6 grid gap-4 border border-primary bg-primary-soft p-5 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
        >
          <div className="min-w-0">
            <strong className="text-sm">Copy this key now. You won&apos;t see it again.</strong>
            <code className="mt-2 block font-mono text-xs break-all">{secret}</code>
          </div>
          <Button
            variant="outline"
            onClick={() => void navigator.clipboard.writeText(secret).then(() => setCopied(true))}
          >
            {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy key"}
          </Button>
          <Button variant="ghost" onClick={() => setSecret("")}>
            Dismiss
          </Button>
        </div>
      )}
      {error && <ErrorNotice>{error}</ErrorNotice>}
      {keys.isPending ? (
        <LoadingState>Loading keys…</LoadingState>
      ) : (keys.data ?? []).length === 0 ? (
        <EmptyState title="No keys yet.">
          Create one when your worker is ready to connect.
        </EmptyState>
      ) : (
        <div className="grid border-t border-border">
          {keys.data?.map((key) => {
            const revoked = Boolean(key.revokedAt);
            const expired = Date.parse(key.expiresAt) <= Date.now();
            return (
              <article
                key={key.id}
                className={cn(
                  "flex flex-col justify-between gap-3 border-b border-border py-4 sm:flex-row sm:items-center",
                  (revoked || expired) && "opacity-55",
                )}
              >
                <div className="grid gap-1">
                  <code className="font-mono text-sm">{key.prefix}…</code>
                  <span className="font-mono text-[10px] text-faint">{key.scopes.join(" · ")}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rotate the active key?</DialogTitle>
            <DialogDescription>
              The current key stops working immediately. Put the new secret in your worker&apos;s
              deployment before it reconnects.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button disabled={create.isPending} onClick={() => create.mutate()}>
              {create.isPending && <Spinner />} Rotate key
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

function DangerRow({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow: string;
  title: string;
  children: string;
  action: React.ReactNode;
}) {
  return (
    <section className="flex flex-col justify-between gap-4 border-t border-border py-6 sm:flex-row sm:items-center">
      <div className="max-w-xl">
        <p className="mb-2 eyebrow">{eyebrow}</p>
        <h3 className="text-lg font-medium">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{children}</p>
      </div>
      {action}
    </section>
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
    onError: (cause) => setError(errorMessage(cause)),
  });
  const status = useMutation({
    mutationFn: () =>
      app.status === "ACTIVE" ? suspendProviderApp(app.id) : activateProviderApp(app.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["provider", "app", app.id] });
      void queryClient.invalidateQueries({ queryKey: ["provider", "apps"] });
      void queryClient.invalidateQueries({ queryKey: ["store"] });
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const archive = useMutation({
    mutationFn: () => archiveProviderApp(app.id),
    onSuccess: () => void navigate({ to: "/console/studio" }),
    onError: (cause) => setError(errorMessage(cause)),
  });
  return (
    <div>
      <SectionHeader
        eyebrow="App settings"
        title="Listing and payout"
        aside={<AppStatus availability={app.availability} />}
      />
      <form
        className="grid max-w-2xl gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          save.mutate();
        }}
      >
        <FormField label="App name" htmlFor="settings-name">
          <Input
            id="settings-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={80}
          />
        </FormField>
        <FormField label="Description" htmlFor="settings-description">
          <Textarea
            id="settings-description"
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={2000}
          />
        </FormField>
        <FormField label="Payout address" htmlFor="settings-payout">
          <Input
            id="settings-payout"
            value={payout}
            onChange={(event) => setPayout(event.target.value)}
            required
            spellCheck={false}
            className="font-mono"
          />
        </FormField>
        <VisibilityField
          value={visibility === "PUBLIC" ? "PUBLIC" : "PRIVATE"}
          onChange={setVisibility}
          descriptions={{ PUBLIC: "Listed in the store.", PRIVATE: "Only you can open it." }}
        />
        <Button type="submit" size="lg" className="justify-self-start" disabled={save.isPending}>
          {save.isPending && <Spinner />} Save settings
        </Button>
      </form>
      {error && <ErrorNotice>{error}</ErrorNotice>}
      <div className="mt-12">
        <DangerRow
          eyebrow="Availability"
          title={app.status === "ACTIVE" ? "Suspend this app" : "Reactivate this app"}
          action={
            <Button variant="outline" disabled={status.isPending} onClick={() => status.mutate()}>
              {status.isPending && <Spinner />}
              {app.status === "ACTIVE" ? "Suspend app" : "Activate app"}
            </Button>
          }
        >
          {app.status === "ACTIVE"
            ? "Suspending stops new threads and quotes. Existing threads stay readable."
            : "Reactivating brings back the store listing, and quotes resume once the worker checks in."}
        </DangerRow>
        <DangerRow
          eyebrow="Archive"
          title="Archive this app"
          action={
            <Button
              variant="destructive"
              disabled={archive.isPending}
              onClick={() => {
                if (window.confirm("Archive this app? Existing threads remain readable."))
                  archive.mutate();
              }}
            >
              <Trash2 /> Archive app
            </Button>
          }
        >
          Threads and paid receipts are kept, but the app leaves the store and can&apos;t take new
          requests.
        </DangerRow>
      </div>
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
      <PageShell>
        <PageHeader
          eyebrow="Studio"
          title="Sign in to manage this app."
          description="App controls belong to the wallet that owns the app."
          actions={
            <Button variant="outline" render={<Link to="/console/studio" />}>
              Back to Studio
            </Button>
          }
        />
      </PageShell>
    );
  if (app.isPending)
    return (
      <PageShell>
        <LoadingState className="pt-20">Loading app…</LoadingState>
      </PageShell>
    );
  if (app.isError || !app.data)
    return (
      <PageShell className="pt-16">
        <ErrorNotice>{app.error ? errorMessage(app.error) : "App not found."}</ErrorNotice>
        <Button render={<Link to="/console/studio" />} variant="outline">
          Back to Studio
        </Button>
      </PageShell>
    );
  const data = app.data;
  return (
    <PageShell>
      <BackLink to="/console/studio">Studio</BackLink>
      <PageHeader
        className="pt-8 lg:pt-10"
        eyebrow={`App / ${data.id.slice(0, 8)}`}
        title={data.name}
        description={
          <>
            {data.description || "No description yet."}
            <span className="mt-5 flex flex-wrap gap-2">
              <AppStatus availability={data.availability} />
              <Tag>{data.kind.toLowerCase()}</Tag>
              <Tag>{data.visibility.toLowerCase()}</Tag>
              <Tag>{plural(data.commands.length, "command")}</Tag>
              <Tag>
                heartbeat{" "}
                {data.lastHeartbeatAt
                  ? new Date(data.lastHeartbeatAt).toLocaleTimeString()
                  : "never"}
              </Tag>
            </span>
          </>
        }
        actions={
          <>
            <Button
              size="lg"
              disabled={opening || data.availability !== "AVAILABLE"}
              onClick={() => {
                if (data.kind === "TOOL") {
                  void navigate({ to: "/console/run/$appId", params: { appId: data.id } });
                  return;
                }
                setOpening(true);
                setError("");
                void newThread(data.id)
                  .then((thread) =>
                    navigate({ to: "/console/chat/$threadId", params: { threadId: thread.id } }),
                  )
                  .catch((cause) => setError(errorMessage(cause)))
                  .finally(() => setOpening(false));
              }}
            >
              {opening ? <Spinner /> : <MessageSquareText />}{" "}
              {data.kind === "TOOL" ? "Try the tool" : "Open a chat"}
            </Button>
            {data.visibility === "PUBLIC" && publicApp.data && (
              <Button
                size="lg"
                variant="outline"
                render={<Link to="/store/$appId" params={{ appId: data.id }} />}
              >
                Store page <ArrowUpRight />
              </Button>
            )}
          </>
        }
      />
      {error && <ErrorNotice>{error}</ErrorNotice>}
      <Tabs defaultValue="commands" className="mt-8 gap-8">
        <TabsList
          variant="line"
          className="h-auto w-full justify-start gap-6 border-b border-border p-0"
        >
          {[
            ["commands", "Commands"],
            ["keys", "API keys"],
            ["settings", "Settings"],
          ].map(([value, label]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="flex-none px-0 pb-3 text-[15px] after:bottom-[-1px] after:bg-primary data-active:text-foreground"
            >
              {label}
            </TabsTrigger>
          ))}
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
    </PageShell>
  );
}
