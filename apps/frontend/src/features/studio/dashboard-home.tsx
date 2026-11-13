import { useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Plus } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Spinner } from "@/src/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { Textarea } from "@/src/components/ui/textarea";
import {
  AppStatus,
  EmptyState,
  ErrorNotice,
  FormField,
  FiguresSkeleton,
  PageHeader,
  PageShell,
  SectionHeader,
  SettlementNote,
  Tag,
  errorMessage,
  plural,
} from "@/src/components/layout/page-kit";
import { WalletAccess } from "@/src/features/auth/wallet-access";
import { authClient } from "@/src/features/auth/auth-client";
import { AgentAvatar } from "@/src/features/apps/agent-avatar";
import { createProviderApp, listProviderApps } from "@/src/features/apps/api";
import { RatingLine } from "@/src/features/apps/agent-facts";
import { getStats } from "@/src/features/people/api";
import { ChartCard, EarnedBars } from "@/src/features/stats/charts";
import { AmountChart, JobsSpark } from "@/src/features/stats/day-chart";
import { FigureStrip, sum } from "@/src/features/stats/earnings";

const toUsdc = (atomic: string) => Number(BigInt(atomic)) / 1_000_000;

// Table rows in the shape of the agent table: picture and name, then figures.
function AgentRowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-busy="true" className="grid border-t border-border">
      <span className="sr-only">Loading agents</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-4 border-b border-border px-2 py-3">
          <Skeleton className="size-8 shrink-0" />
          <Skeleton className="h-4" style={{ width: `${32 - index * 5}%` }} />
          <Skeleton className="ml-auto h-4 w-16" />
          <Skeleton className="h-6 w-24 max-lg:hidden" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

function CreateAgentDialog({
  open,
  onOpenChange,
  initialName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName: string;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const create = useMutation({
    mutationFn: () =>
      createProviderApp({
        name: name.trim(),
        description: description.trim() || undefined,
        visibility: "PRIVATE",
      }),
    onSuccess: (app) => {
      setName("");
      setDescription("");
      setError("");
      onOpenChange(false);
      void queryClient.invalidateQueries({ queryKey: ["provider", "apps"] });
      void queryClient.invalidateQueries({ queryKey: ["account"] });
      void navigate({
        to: "/console/studio/apps/$appId",
        params: { appId: app.id },
        search: { tab: "settings" },
      });
    },
    onError: (cause) => setError(errorMessage(cause, "Could not create agent.")),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New agent</DialogTitle>
          <DialogDescription>
            Name it now. You get its API key on the next screen.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <FormField label="Name" htmlFor="app-name">
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
              placeholder="What the agent does and when someone would hire it."
            />
          </FormField>
          <p className="text-sm text-muted-foreground">
            New agents start private. Connect your agent, set a default command and a
            description of at least 20 characters, then publish it from its settings.
          </p>
          {error && <ErrorNotice className="my-0">{error}</ErrorNotice>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || !name.trim()}>
              {create.isPending && <Spinner />} Create agent
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DashboardHome() {
  const { data: session } = authClient.useSession();
  const handoff = useSearch({ from: "/console/studio/" });
  const [open, setOpen] = useState(Boolean(handoff.name));
  const apps = useQuery({
    queryKey: ["provider", "apps", session?.user.id],
    queryFn: listProviderApps,
    enabled: Boolean(session),
    staleTime: 10_000,
  });
  const stats = useQuery({
    queryKey: ["account", session?.user.id, "stats"],
    queryFn: getStats,
    enabled: Boolean(session),
    refetchInterval: 60_000,
  });
  const provider = stats.data?.provider;
  const usage = new Map((provider?.apps ?? []).map((app) => [app.id, app]));

  if (!session)
    return (
      <PageShell className="pt-2">
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
    <PageShell className="pt-2">
      <PageHeader
        compact
        title="Studio"
        description="Your shared agents and what they earn. Each one takes jobs with its own API key."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus /> New agent
          </Button>
        }
      />
      <CreateAgentDialog
        open={open}
        onOpenChange={setOpen}
        initialName={handoff.name ?? ""}
      />

      {stats.isPending && <FiguresSkeleton className="mt-8" />}
      {provider && (
        <section aria-label="Earnings" className="mt-8 grid gap-4">
          <div className="grid gap-3">
            <FigureStrip
              figures={[
                {
                  label: "Earned after fees",
                  value: toUsdc(sum(provider.released, provider.held)),
                  unit: "USDC",
                  decimals: 2,
                },
                {
                  label: "Held for you",
                  value: toUsdc(provider.held),
                  unit: "USDC",
                  decimals: 2,
                  note: "Paid out after review",
                },
                { label: "Paid jobs", value: provider.jobs },
                { label: "Buyers", value: provider.users },
              ]}
            />
            <SettlementNote />
          </div>
          {provider.jobs > 0 && (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <ChartCard title="All agents, last 30 days">
                <AmountChart series={provider.series} label="Earned" views />
              </ChartCard>
              <ChartCard title="By agent">
                <EarnedBars
                  limit={6}
                  rows={provider.apps.map((app) => ({
                    name: app.name,
                    earned: sum(app.released, app.held),
                    jobs: app.jobs,
                  }))}
                />
              </ChartCard>
            </div>
          )}
        </section>
      )}

      <section aria-labelledby="apps-title" className="mt-10">
        <SectionHeader id="apps-title" title="Your agents" aside={plural(items.length, "agent")} />
        {apps.isPending ? (
          <AgentRowsSkeleton />
        ) : apps.isError ? (
          <ErrorNotice onRetry={() => void apps.refetch()}>
            {errorMessage(apps.error, "Could not load agents.")}
          </ErrorNotice>
        ) : items.length === 0 ? (
          <EmptyState
            title="Share your first agent"
            action={<Button onClick={() => setOpen(true)}>New agent</Button>}
          >
            Name it, then issue an API key so it can take jobs.
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead className="max-md:hidden">Status</TableHead>
                <TableHead className="max-lg:hidden">Rating</TableHead>
                <TableHead className="text-right max-sm:hidden">Jobs</TableHead>
                <TableHead className="max-lg:hidden">30 days</TableHead>
                <TableHead className="text-right">Earned</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((app) => {
                const own = usage.get(app.id);
                return (
                  <TableRow key={app.id} className="group relative">
                    <TableCell className="max-w-72">
                      <Link
                        to="/console/studio/apps/$appId"
                        params={{ appId: app.id }}
                        className="flex min-w-0 items-center gap-3 after:absolute after:inset-0"
                      >
                        <AgentAvatar
                          name={app.name}
                          imageUrl={app.imageUrl}
                          className="size-8 text-sm"
                        />
                        <span className="grid min-w-0">
                          <span className="truncate font-medium group-hover:text-primary">
                            {app.name}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            {app.visibility === "PUBLIC" ? "Public" : "Private"}
                            {app.description ? ` · ${app.description}` : ""}
                          </span>
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="max-md:hidden">
                      <span className="flex items-center gap-2">
                        <AppStatus availability={app.availability} />
                        {app.status !== "ACTIVE" && <Tag>{app.status.toLowerCase()}</Tag>}
                      </span>
                    </TableCell>
                    <TableCell className="max-lg:hidden">
                      {own ? <RatingLine rating={own.rating} /> : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums max-sm:hidden">
                      {own?.jobs ?? 0}
                    </TableCell>
                    <TableCell className="max-lg:hidden">
                      {own && <JobsSpark series={own.series} className="h-7 w-24" />}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      <span className="inline-flex items-center gap-2">
                        {own ? toUsdc(sum(own.released, own.held)).toFixed(2) : "0.00"}
                        <span className="text-xs text-muted-foreground">USDC</span>
                        <ArrowUpRight
                          size={14}
                          aria-hidden="true"
                          className="text-faint group-hover:text-primary"
                        />
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>
    </PageShell>
  );
}
