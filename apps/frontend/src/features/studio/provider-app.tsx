import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Check,
  Copy,
  KeyRound,
  MessageSquareText,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import { Spinner } from "@/src/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { Textarea } from "@/src/components/ui/textarea";
import { CommandCard } from "@/src/features/apps/command-card";
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
} from "@/src/components/layout/page-kit";
import { VisibilityField } from "@/src/features/studio/visibility-field";
import { authClient } from "@/src/features/auth/auth-client";
import {
  activateProviderApp,
  archiveProviderApp,
  createProviderKey,
  getProviderApp,
  getStoreApp,
  listProviderKeys,
  revokeProviderKey,
  suspendProviderApp,
  updateProviderApp,
  type ProviderAppDetail,
  type Visibility,
} from "@/src/features/apps/api";
import { formatCommandPrice } from "@/src/features/apps/format";
import { newThread } from "@/src/features/chat/api";
import { cn } from "@/src/lib/utils";

function PanelIntro({ children }: { children: string }) {
  return <p className="mb-6 max-w-2xl text-sm leading-relaxed text-muted-foreground">{children}</p>;
}

// Commands are registered by the app's bot through the API, like Discord
// application commands; Studio only shows what buyers can call.
const SYNC_EXAMPLE = `curl -X PUT "$PAYVOKE_API/v1/provider/apps/<appId>/commands" \\
  -H "Authorization: Bearer $PAYVOKE_KEY" -H "Content-Type: application/json" \\
  -d '[{"name":"summarize","description":"Summarizes text",
        "options":[{"name":"text","type":"STRING","required":true},
                   {"name":"file","type":"FILE","accept":["application/pdf"]}],
        "maxAmount":"5000000",
        "terms":{"deliverySeconds":600,"reviewSeconds":3600,
                 "revisionPolicy":{"maxIncluded":1,"description":"One revision"},
                 "refundPolicy":"Refund if not delivered","sideEffects":"none",
                 "dataUse":"This request only"}}]'`;

function CommandsTab({ app }: { app: ProviderAppDetail }) {
  return (
    <div>
      <SectionHeader eyebrow="Slash commands" title="What buyers can call" />
      <PanelIntro>
        Your bot registers commands with an app key: PUT the whole list and Payvoke keeps unchanged
        commands, adds a revision for changed ones and archives the rest. Buyers see them when they
        type / in a chat. Every request is priced by your bot's offer; a command can only cap it.
      </PanelIntro>
      <pre className="mb-8 overflow-x-auto border border-border bg-background-deep p-4 font-mono text-[11px] leading-relaxed text-muted-foreground">
        {SYNC_EXAMPLE.replace("<appId>", app.id)}
      </pre>
      {app.commands.length === 0 ? (
        <EmptyState title="No commands yet.">
          Register commands from your bot. The first one becomes the default.
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
                  `delivery ≤ ${Math.round(command.revision.deliverySeconds / 60)} min`,
                  `revision ${command.revision.id.slice(0, 8)}`,
                ]
              }
            />
          ))}
        </div>
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
  const [visibility, setVisibility] = useState<Visibility>(
    app.visibility === "PRIVATE" ? "PRIVATE" : "PUBLIC",
  );
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
              {opening ? <Spinner /> : <MessageSquareText />} Open a chat
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
