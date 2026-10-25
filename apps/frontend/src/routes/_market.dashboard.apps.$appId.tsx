import { createFileRoute } from "@tanstack/react-router";
import { ProviderAppPage } from "@/src/components/provider-app";

export const Route = createFileRoute("/_market/dashboard/apps/$appId")({
  component: ProviderAppRoute,
  head: () => ({ meta: [{ title: "App controls · Payvoke" }] }),
});

function ProviderAppRoute() {
  const { appId } = Route.useParams();
  return <ProviderAppPage appId={appId} />;
}
