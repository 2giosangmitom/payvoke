import { createFileRoute } from "@tanstack/react-router";
import { ProviderAppPage, type AgentTab } from "@/src/features/studio/provider-app";

export const Route = createFileRoute("/console/studio/apps/$appId")({
  component: ProviderAppRoute,
  validateSearch: (search: Record<string, unknown>): { tab?: AgentTab } => ({
    tab: search.tab === "settings" ? "settings" : undefined,
  }),
  staticData: { title: "App controls" },
});

function ProviderAppRoute() {
  const { appId } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <ProviderAppPage
      appId={appId}
      tab={tab ?? "overview"}
      onTab={(next) =>
        void navigate({ search: { tab: next === "overview" ? undefined : next }, replace: true })
      }
    />
  );
}
