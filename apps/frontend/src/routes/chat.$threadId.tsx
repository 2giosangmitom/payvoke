import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/chat/$threadId")({ component: Redirect });

function Redirect() {
  const { threadId } = Route.useParams();
  return <Navigate to="/console/chat/$threadId" params={{ threadId }} replace />;
}
