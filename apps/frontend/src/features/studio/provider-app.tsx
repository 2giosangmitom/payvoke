import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, KeyRound, MessageSquareText, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Spinner } from "@/src/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { Textarea } from "@/src/components/ui/textarea";
import {
  AppStatus,
  BackLink,
  EmptyState,
  ErrorNotice,
  FormField,
  SettingsSkeleton,
  PageShell,
  Tag,
  errorMessage,
  plural,
} from "@/src/components/layout/page-kit";
import { AgentOverview } from "@/src/features/studio/agent-overview";
import { ImageField } from "@/src/features/studio/image-field";
import { VisibilityField } from "@/src/features/studio/visibility-field";
import { CopyButton, SettingsRow } from "@/src/features/keys/settings-row";
import { authClient } from "@/src/features/auth/auth-client";
import { AgentAvatar } from "@/src/features/apps/agent-avatar";
import {
  activateProviderApp,
  archiveProviderApp,
  createProviderKey,
  getProviderApp,
  getStoreApp,
  listProviderKeys,
  removeAppImage,
  suspendProviderApp,
  updateProviderApp,
  uploadAppImage,
  type ProviderAppDetail,
  type ProviderCommand,
  type Visibility,
} from "@/src/features/apps/api";
import { formatUsdc } from "@/src/features/apps/format";
import { newThread } from "@/src/features/chat/api";

const date = (value: string | Date) =>
  new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

function useRefreshApp(appId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["provider", "app", appId] });
    void queryClient.invalidateQueries({ queryKey: ["provider", "apps"] });
    void queryClient.invalidateQueries({ queryKey: ["store"] });
  };
}

function AgentImage({ app }: { app: ProviderAppDetail }) {
  const refresh = useRefreshApp(app.id);
  return (
    <ImageField
      id="agent-image"
      name={app.name}
      label="Agent image"
      preview={<AgentAvatar name={app.name} imageUrl={app.imageUrl} className="size-20 text-3xl" />}
      hasImage={Boolean(app.imageUrl)}
      upload={(file) => uploadAppImage(app.id, file)}
      remove={() => removeAppImage(app.id)}
      onDone={refresh}
    />
  );
}

function ProfileForm({ app }: { app: ProviderAppDetail }) {
  const refresh = useRefreshApp(app.id);
  const [name, setName] = useState(app.name);
  const [description, setDescription] = useState(app.description ?? "");
  const [visibility, setVisibility] = useState<Visibility>(
    app.visibility === "PRIVATE" ? "PRIVATE" : "PUBLIC",
  );
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: () =>
      updateProviderApp(app.id, {
        name: name.trim(),
        description: description.trim() || null,
        visibility,
      }),
    onSuccess: () => {
      setSaved(true);
      refresh();
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const dirty =
    name.trim() !== app.name ||
    (description.trim() || null) !== (app.description ?? null) ||
    visibility !== app.visibility;
  return (
    <form
      className="grid gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        setError("");
        setSaved(false);
        save.mutate();
      }}
    >
      <AgentImage app={app} />
      <FormField label="Name" htmlFor="settings-name">
        <Input
          id="settings-name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setSaved(false);
          }}
          required
          maxLength={80}
        />
      </FormField>
      <FormField label="Description" htmlFor="settings-description">
        <Textarea
          id="settings-description"
          rows={3}
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
            setSaved(false);
          }}
          maxLength={2000}
          placeholder="What the agent does and when someone would hire it."
        />
      </FormField>
      <VisibilityField
        value={visibility}
        onChange={(next) => {
          setVisibility(next);
          setSaved(false);
        }}
        descriptions={{ PUBLIC: "Listed in the store.", PRIVATE: "Only you can open it." }}
      />
      {error && <ErrorNotice className="my-0">{error}</ErrorNotice>}
      <div className="flex items-center gap-4">
        <Button type="submit" disabled={save.isPending || !dirty || !name.trim()}>
          {save.isPending && <Spinner />} Save changes
        </Button>
        {saved && !dirty && (
          <span role="status" className="text-sm text-muted-foreground">
            Saved.
          </span>
        )}
      </div>
    </form>
  );
}

// Like a bot token: one working key, shown in full only right after it is
// generated. Resetting revokes the old key on the spot.
function ApiKeyPanel({ app }: { app: ProviderAppDetail }) {
  const queryClient = useQueryClient();
  const [secret, setSecret] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const keys = useQuery({
    queryKey: ["provider", "app", app.id, "keys"],
    queryFn: () => listProviderKeys(app.id),
    staleTime: 10_000,
  });
  const issue = useMutation({
    mutationFn: () => createProviderKey(app.id),
    onSuccess: (data) => {
      setSecret(data.secret);
      setConfirm(false);
      void queryClient.invalidateQueries({ queryKey: ["provider", "app", app.id, "keys"] });
      void queryClient.invalidateQueries({ queryKey: ["provider", "apps"] });
    },
    onError: (cause) => {
      setConfirm(false);
      setError(errorMessage(cause));
    },
  });
  if (keys.isPending)
    return (
      <div role="status" aria-busy="true" className="grid gap-3">
        <span className="sr-only">Loading the key</span>
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3.5 w-64" />
        <Skeleton className="h-8 w-32" />
      </div>
    );
  if (keys.isError)
    return (
      <ErrorNotice className="my-0" onRetry={() => void keys.refetch()}>
        {errorMessage(keys.error, "Could not load the key.")}
      </ErrorNotice>
    );
  const latest = keys.data[0];
  const active = latest && !latest.revokedAt ? latest : null;
  const generate = () => {
    setError("");
    if (active) setConfirm(true);
    else issue.mutate();
  };
  return (
    <div className="grid gap-4">
      {secret ? (
        <div role="status" className="grid gap-3 border border-primary bg-primary-soft p-4">
          <p className="text-sm font-medium">
            Copy your new key now. For your security it won&apos;t be shown again.
          </p>
          <code className="block bg-background-deep p-3 font-mono text-xs leading-relaxed break-all">
            {secret}
          </code>
          <div className="flex flex-wrap gap-2">
            <CopyButton value={secret} label="Copy key" />
            <Button variant="ghost" size="sm" onClick={() => setSecret("")}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-1">
          <code className="font-mono text-sm break-all">
            {active ? `pvk_${active.prefix}.${"•".repeat(16)}` : "No key"}
          </code>
          <p className="text-sm text-muted-foreground">
            {active
              ? `Created ${date(active.createdAt)} · ${
                  active.lastUsedAt ? `last used ${date(active.lastUsedAt)}` : "not used yet"
                }`
              : "Your agent can't take jobs until it has a key."}
          </p>
        </div>
      )}
      {error && <ErrorNotice className="my-0">{error}</ErrorNotice>}
      <Button
        variant={active ? "outline" : "default"}
        className="justify-self-start"
        disabled={issue.isPending}
        onClick={generate}
      >
        {issue.isPending ? <Spinner /> : active ? <RotateCcw /> : <KeyRound />}
        {active ? "Reset key" : "Generate key"}
      </Button>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset the API key?</DialogTitle>
            <DialogDescription>
              The current key stops working immediately and can&apos;t be used again. Your agent is
              disconnected until you give it the new key.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={issue.isPending} onClick={() => issue.mutate()}>
              {issue.isPending && <Spinner />} Yes, reset key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CommandRow({ command, isDefault }: { command: ProviderCommand; isDefault: boolean }) {
  const revision = command.revision;
  return (
    <li className="grid gap-2 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <code className="font-mono text-sm text-primary break-all">/{command.name}</code>
          {isDefault && <Tag>Default</Tag>}
        </div>
        <p className="mt-1 text-sm leading-6">{command.description}</p>
        {revision && revision.options.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            {revision.options
              .map((option) => `${option.name}${option.required ? "" : " (optional)"}`)
              .join(", ")}
          </p>
        )}
      </div>
      <div className="text-sm text-muted-foreground sm:text-right">
        {revision ? (
          <>
            <p className="font-mono tabular-nums text-foreground">
              {revision.maxGrossAmount ? `≤ ${formatUsdc(revision.maxGrossAmount)}` : "By offer"}
            </p>
            <p className="text-xs">{Math.round(revision.deliverySeconds / 60)} min delivery</p>
          </>
        ) : (
          <p className="text-xs">Not active</p>
        )}
      </div>
    </li>
  );
}

function CommandList({ app }: { app: ProviderAppDetail }) {
  if (app.commands.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        No commands yet. They appear here once your agent registers them.
      </p>
    );
  return (
    <ul className="grid divide-y divide-border">
      {app.commands.map((command) => (
        <CommandRow
          key={command.id}
          command={command}
          isDefault={command.id === app.defaultCommandId}
        />
      ))}
    </ul>
  );
}

function AvailabilityPanel({ app }: { app: ProviderAppDetail }) {
  const navigate = useNavigate();
  const refresh = useRefreshApp(app.id);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState("");
  const active = app.status === "ACTIVE";
  const status = useMutation({
    mutationFn: () => (active ? suspendProviderApp(app.id) : activateProviderApp(app.id)),
    onSuccess: refresh,
    onError: (cause) => setError(errorMessage(cause)),
  });
  const archive = useMutation({
    mutationFn: () => archiveProviderApp(app.id),
    onSuccess: () => void navigate({ to: "/console/studio" }),
    onError: (cause) => {
      setArchiving(false);
      setError(errorMessage(cause));
    },
  });
  return (
    <div className="grid divide-y divide-border">
      <div className="flex flex-col justify-between gap-3 pb-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium">{active ? "Pause new jobs" : "Take jobs again"}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {active
              ? "Stops new chats and offers. Existing chats stay readable."
              : "Brings back the store listing; offers resume once your agent checks in."}
          </p>
        </div>
        <Button
          variant="outline"
          className="shrink-0"
          disabled={status.isPending}
          onClick={() => status.mutate()}
        >
          {status.isPending && <Spinner />}
          {active ? "Suspend agent" : "Activate agent"}
        </Button>
      </div>
      <div className="flex flex-col justify-between gap-3 pt-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium">Archive</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Removes the agent from the store and revokes its key. Chats and paid receipts are kept.
          </p>
        </div>
        <Button variant="destructive" className="shrink-0" onClick={() => setArchiving(true)}>
          <Trash2 /> Archive agent
        </Button>
      </div>
      {error && <ErrorNotice className="mb-0">{error}</ErrorNotice>}
      <Dialog open={archiving} onOpenChange={setArchiving}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive {app.name}?</DialogTitle>
            <DialogDescription>
              It leaves the store, its key stops working and it can&apos;t take new jobs. Existing
              chats and receipts stay readable.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setArchiving(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={archive.isPending}
              onClick={() => archive.mutate()}
            >
              {archive.isPending && <Spinner />} Archive agent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export type AgentTab = "overview" | "settings";

export function ProviderAppPage({
  appId,
  tab,
  onTab,
}: {
  appId: string;
  tab: AgentTab;
  onTab: (tab: AgentTab) => void;
}) {
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
        <EmptyState
          className="mt-10"
          title="Sign in to manage this agent"
          action={
            <Button variant="outline" render={<Link to="/console/studio" />}>
              Back to Studio
            </Button>
          }
        >
          Its settings belong to the wallet that owns it.
        </EmptyState>
      </PageShell>
    );
  if (app.isPending)
    return (
      <PageShell>
        <div role="status" aria-busy="true">
          <span className="sr-only">Loading agent</span>
          <Skeleton className="mt-8 h-5 w-20" />
          <div className="flex flex-col gap-6 border-b border-border pt-6 pb-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-5">
              <Skeleton className="size-16 shrink-0" />
              <div className="grid gap-3">
                <Skeleton className="h-7 w-56" />
                <Skeleton className="h-4 w-72 max-w-full" />
              </div>
            </div>
            <div className="flex gap-3">
              <Skeleton className="h-9 w-32" />
              <Skeleton className="h-9 w-28" />
            </div>
          </div>
        </div>
        <SettingsSkeleton rows={4} label="Loading agent settings" />
      </PageShell>
    );
  if (app.isError || !app.data)
    return (
      <PageShell className="pt-16">
        <ErrorNotice>{app.error ? errorMessage(app.error) : "Agent not found."}</ErrorNotice>
        <Button render={<Link to="/console/studio" />} variant="outline">
          Back to Studio
        </Button>
      </PageShell>
    );
  const data = app.data;
  return (
    <PageShell>
      <BackLink to="/console/studio">Studio</BackLink>
      <header className="flex flex-col gap-6 pt-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-5">
          <AgentAvatar name={data.name} imageUrl={data.imageUrl} className="size-16 text-2xl" />
          <div className="min-w-0">
            <h1 className="text-2xl leading-tight font-semibold tracking-[-0.025em] break-words">
              {data.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
              <AppStatus availability={data.availability} />
              <span>{data.visibility === "PUBLIC" ? "Public" : "Private"}</span>
              <span>{plural(data.commands.length, "command")}</span>
              <span>
                {data.lastHeartbeatAt
                  ? `Checked in ${new Date(data.lastHeartbeatAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}`
                  : "Never checked in"}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
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
              variant="outline"
              render={<Link to="/store/$appId" params={{ appId: data.id }} />}
            >
              Store page <ArrowUpRight />
            </Button>
          )}
        </div>
      </header>
      {error && <ErrorNotice>{error}</ErrorNotice>}

      <Tabs value={tab} onValueChange={(value) => onTab(value as AgentTab)} className="mt-6 gap-0">
        <TabsList
          variant="line"
          aria-label="Agent views"
          className="h-10 w-full justify-start gap-5 border-b border-border px-0"
        >
          {(
            [
              ["overview", "Overview"],
              ["settings", "Settings"],
            ] as const
          ).map(([value, label]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="flex-none px-0 group-data-horizontal/tabs:after:bottom-[-4px] after:bg-primary"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview" className="pt-6">
          <AgentOverview appId={data.id} onSetup={() => onTab("settings")} />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsRow
            id="agent-profile"
            title="Profile"
            description="How buyers see this agent in the store and in their chats."
          >
            <ProfileForm app={data} />
          </SettingsRow>
          <SettingsRow
            id="agent-key"
            title="API key"
            description={
              <>
                Your agent connects to Payvoke with this key. You see it only once, when you
                generate or reset it. The{" "}
                <Link to="/docs" className="text-primary hover:underline">
                  builder docs
                </Link>{" "}
                show how to use it.
              </>
            }
          >
            <ApiKeyPanel app={data} />
          </SettingsRow>
          <SettingsRow
            id="agent-commands"
            title="Commands"
            description="What buyers can ask this agent for. The agent registers its own commands."
          >
            <CommandList app={data} />
          </SettingsRow>
          <SettingsRow
            id="agent-availability"
            title="Availability"
            description="Pause the agent for a while, or retire it for good."
          >
            <AvailabilityPanel app={data} />
          </SettingsRow>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
