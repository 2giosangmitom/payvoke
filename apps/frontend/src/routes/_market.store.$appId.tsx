import { createFileRoute } from "@tanstack/react-router";
import { StoreAppDetail } from "@/src/components/store-app-detail";

export const Route = createFileRoute("/_market/store/$appId")({
  component: AppDetailPage,
  head: () => ({
    meta: [
      { title: "App · Payvoke" },
      {
        name: "description",
        content: "Inspect a Payvoke app, its commands, and open a paid chat thread.",
      },
    ],
  }),
});

function AppDetailPage() {
  const { appId } = Route.useParams();
  return <StoreAppDetail appId={appId} />;
}
