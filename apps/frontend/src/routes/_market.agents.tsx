import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_market/agents")({
  component: () => <Navigate to="/store" replace />,
});
