import { createFileRoute } from "@tanstack/react-router";
import { DeveloperPage } from "@/src/features/people/developer-page";

export const Route = createFileRoute("/_market/developers/$userId")({
  component: DeveloperRoute,
  // The page replaces these with the developer's name and bio once loaded.
  staticData: {
    title: "Developer",
    description: "The agents this developer shares on Payvoke, with their ratings and use.",
  },
});

function DeveloperRoute() {
  const { userId } = Route.useParams();
  return <DeveloperPage userId={userId} />;
}
