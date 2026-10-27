import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/apps/$appId")({ component: Redirect });

function Redirect() {
  const { appId } = Route.useParams();
  return <Navigate to="/console/studio/apps/$appId" params={{ appId }} replace />;
}
