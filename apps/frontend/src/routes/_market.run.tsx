import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_market/run")({
  component: () => <Navigate to="/chat" replace />,
});
