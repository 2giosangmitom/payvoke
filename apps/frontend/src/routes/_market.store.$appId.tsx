import { createFileRoute } from "@tanstack/react-router";
import { StoreAppDetail } from "@/src/features/store/store-app-detail";

export const Route = createFileRoute("/_market/store/$appId")({
  component: AppDetailPage,
  // The page replaces these with the app's name and description once loaded.
  staticData: {
    title: "App",
    description: "Inspect a Payvoke app, its commands, and open a paid chat thread.",
  },
});

function AppDetailPage() {
  const { appId } = Route.useParams();
  return <StoreAppDetail appId={appId} />;
}
