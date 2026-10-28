import { useState } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Plus, Radio, X } from "lucide-react";
import { useConnection } from "wagmi";
import { BlurFade } from "@/src/components/ui/blur-fade";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Spinner } from "@/src/components/ui/spinner";
import { Textarea } from "@/src/components/ui/textarea";
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
} from "@/src/components/layout/page-kit";
import { VisibilityField } from "@/src/features/studio/visibility-field";
import { WalletAccess } from "@/src/features/auth/wallet-access";
import { authClient } from "@/src/features/auth/auth-client";
import { createProviderApp, listProviderApps } from "@/src/features/apps/api";

export function DashboardHome() {
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const { address } = useConnection();
  const handoff = useSearch({ from: "/console/studio/" });
  const [open, setOpen] = useState(Boolean(handoff.name));
  const [name, setName] = useState(handoff.name ?? "");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"PUBLIC" | "PRIVATE">(
    handoff.visibility ?? "PRIVATE",
  );
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
          compact
          title="Studio"
          description="Sign in with the wallet that owns your agents to manage their commands, API keys and store listing."
          actions={<WalletAccess variant="hero" label="Sign in to Studio" />}
        />
      </PageShell>
    );

  const items = (apps.data ?? []).filter((app) => !app.archivedAt);
  return (
    <PageShell>
      <PageHeader
        compact
        title="Studio"
        description="The agents you share. Each one prices its jobs with offers and registers its commands with the API key you issue here."
        actions={
          <Button size="lg" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
            <Plus /> New agent
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
                <h2 id="create-app-title" className="text-xl font-semibold tracking-[-0.02em]">
                  New agent
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
        <SectionHeader id="apps-title" title="Your agents" aside={plural(items.length, "app")} />
        {apps.isPending ? (
          <LoadingState>Loading agents…</LoadingState>
        ) : apps.isError ? (
          <ErrorNotice onRetry={() => void apps.refetch()}>
            {errorMessage(apps.error, "Could not load agents.")}
          </ErrorNotice>
        ) : items.length === 0 ? (
          <EmptyState
            title="Share your first agent"
            action={<Button onClick={() => setOpen(true)}>New agent</Button>}
          >
            Name it here, then issue an API key so your agent can register its commands and start
            taking jobs.
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
