import { createFileRoute } from "@tanstack/react-router";
import { ProviderAppPage } from "@/src/features/studio/provider-app";

export const Route = createFileRoute("/console/studio/apps/$appId")({
  component: ProviderAppRoute,
  staticData: { title: "App controls" },
});

function ProviderAppRoute() {
  const { appId } = Route.useParams();
  return <ProviderAppPage appId={appId} />;
}
