import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Plus, Radio, X } from "lucide-react";
import { useConnection } from "wagmi";
import { BlurFade } from "./ui/blur-fade";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Spinner } from "./ui/spinner";
import { Textarea } from "./ui/textarea";
import {
  AppStatus,
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
    onError: (cause) => setError(errorMessage(cause, "Could not create app.")),
  });

  if (!session)
    return (
      <PageShell>
        <PageHeader
          eyebrow="Studio"
          title="Run the app behind the thread."
          description="Sign in with the wallet that owns your apps to manage their commands, API keys, worker status and store listing."
          actions={<WalletAccess variant="hero" label="Sign in to Studio" />}
        />
      </PageShell>
    );

  const items = (apps.data ?? []).filter((app) => !app.archivedAt);
  return (
    <PageShell>
      <PageHeader
        eyebrow="Studio"
        title="Your apps"
        description="A tool sells fixed-price commands through a form; an agent chats with buyers and sends offers. You define commands, keep one active API key for the worker, and decide whether the app is listed in the store."
        actions={
          <Button size="lg" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
            <Plus /> New app
          </Button>
        }
      />

      {open && (
        <BlurFade>
          <section
            aria-labelledby="create-app-title"
            className="mt-8 border border-border-strong bg-card p-6 sm:p-8"
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="mb-2 eyebrow">New app</p>
                <h2 id="create-app-title" className="text-2xl font-medium tracking-[-0.03em]">
                  Create an app
                </h2>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Close"
                onClick={() => setOpen(false)}
              >
                <X />
              </Button>
            </div>
            <form
              className="grid max-w-2xl gap-5"
              onSubmit={(event) => {
                event.preventDefault();
                if (!(payout || address)) {
                  setError("Connect a wallet or enter a payout address.");
                  return;
                }
                create.mutate();
              }}
            >
              <FormField label="App name" htmlFor="app-name">
                <Input
                  id="app-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  maxLength={80}
                  placeholder="Summarizer"
                />
              </FormField>
              <FormField label="Description" htmlFor="app-description">
                <Textarea
                  id="app-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder="What the app does and when someone would use it."
                />
              </FormField>
              <FormField label="Payout address" htmlFor="app-payout">
                <Input
                  id="app-payout"
                  value={payout || address || ""}
                  onChange={(event) => setPayout(event.target.value)}
                  required
                  placeholder="0x…"
                  spellCheck={false}
                  className="font-mono"
                />
              </FormField>
              <VisibilityField
                value={visibility}
                onChange={setVisibility}
                descriptions={{
                  PUBLIC: "Listed in the store. Anyone can open a thread.",
                  PRIVATE: "Only you can open it. Never listed.",
                }}
              />
              {error && <ErrorNotice className="my-0">{error}</ErrorNotice>}
              <Button
                type="submit"
                size="lg"
                className="justify-self-start"
                disabled={create.isPending || !name.trim()}
              >
                {create.isPending && <Spinner />} Create app
              </Button>
            </form>
          </section>
        </BlurFade>
      )}

      <section aria-labelledby="apps-title" className="mt-12">
        <SectionHeader
          id="apps-title"
          eyebrow="Owned apps"
          title="Apps you run"
          aside={plural(items.length, "app")}
        />
        {apps.isPending ? (
          <LoadingState>Loading apps…</LoadingState>
        ) : apps.isError ? (
          <ErrorNotice onRetry={() => void apps.refetch()}>
            {errorMessage(apps.error, "Could not load apps.")}
          </ErrorNotice>
        ) : items.length === 0 ? (
          <EmptyState
            eyebrow="No apps yet"
            title="Create your first app."
            action={<Button onClick={() => setOpen(true)}>Create app</Button>}
          >
            After that: add a default command, create an API key, and start your worker.
          </EmptyState>
        ) : (
          <div className="grid border-t border-border">
            {items.map((app, index) => (
              <BlurFade key={app.id} inView delay={Math.min(index, 8) * 0.04}>
                <Link
                  to="/console/studio/apps/$appId"
                  params={{ appId: app.id }}
                  className="group flex flex-col justify-between gap-4 border-b border-border py-6 transition-colors hover:bg-card sm:flex-row sm:items-center sm:px-4"
                >
                  <div className="min-w-0">
                    <AppStatus availability={app.availability} />
                    <h3 className="mt-3 text-xl font-medium tracking-[-0.03em] break-words group-hover:text-primary">
                      {app.name}
                    </h3>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {app.description || "No description yet."}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Tag>{app.visibility.toLowerCase()}</Tag>
                    <Tag>
                      <Radio className="size-3" /> {app.status.toLowerCase()}
                    </Tag>
                    <ArrowUpRight
                      size={18}
                      className="ml-2 text-primary transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    />
                  </div>
                </Link>
              </BlurFade>
            ))}
          </div>
        )}
      </section>
    </PageShell>
  );
}
