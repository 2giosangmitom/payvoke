import { Link } from "@tanstack/react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  ErrorNotice,
  LoadingState,
  PageHeader,
  PageShell,
  errorMessage,
} from "@/src/components/layout/page-kit";
import { listProviderApps, listProviderKeys } from "@/src/features/apps/api";
import { OlderAutopayKeys } from "@/src/features/keys/autopay-keys";
import { CodingAgents } from "@/src/features/keys/coding-agents";
import { SettingsRow } from "@/src/features/keys/settings-row";

const date = (value: string | Date) =>
  new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

// Each shared agent's worker key. Keys are created and rotated in Studio,
// where the secret can be shown once.
function ProviderKeys() {
  const apps = useQuery({ queryKey: ["provider", "apps"], queryFn: listProviderApps });
  const keys = useQueries({
    queries: (apps.data ?? []).map((app) => ({
      queryKey: ["provider", "apps", app.id, "keys"],
      queryFn: () => listProviderKeys(app.id),
    })),
  });
  return (
    <SettingsRow
      id="provider-keys"
      title="Agent worker keys"
      description={
        <>
          Your shared agents run with one active key each. Create or rotate it in Studio, where the
          secret is shown once.
        </>
      }
    >
      {apps.isPending ? (
        <LoadingState className="py-4">Loading your agents</LoadingState>
      ) : apps.isError ? (
        <ErrorNotice onRetry={() => void apps.refetch()}>
          {errorMessage(apps.error, "Couldn't load your agents.")}
        </ErrorNotice>
      ) : apps.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You don&apos;t share an agent yet.{" "}
          <Link to="/console/studio" className="text-foreground underline underline-offset-4">
            Open Studio
          </Link>
        </p>
      ) : (
        <ul className="grid">
          {apps.data.map((app, index) => {
            const active = keys[index]?.data?.find((key) => !key.revokedAt);
            return (
              <li
                key={app.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 border-b border-border py-2.5 first:pt-0 last:border-b-0"
              >
                <Link
                  to="/console/studio/apps/$appId"
                  params={{ appId: app.id }}
                  className="truncate text-sm hover:text-primary"
                >
                  {app.name}
                </Link>
                <span className="text-right font-mono text-xs text-muted-foreground">
                  {keys[index]?.isPending
                    ? "…"
                    : active
                      ? `pvk_${active.prefix}…`
                      : "No active key"}
                </span>
                <span className="col-span-2 text-xs text-muted-foreground">
                  {active
                    ? `${active.scopes.join(", ")} · expires ${date(active.expiresAt)}`
                    : "The agent can't take paid work until it has a key."}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </SettingsRow>
  );
}

export function KeysPage() {
  return (
    <PageShell className="pt-2">
      <PageHeader
        compact
        title="API keys"
        description="The coding agents that hire for you, with their spending limits, and the keys your shared agents work with."
      />
      <CodingAgents />
      <OlderAutopayKeys />
      <ProviderKeys />
    </PageShell>
  );
}
