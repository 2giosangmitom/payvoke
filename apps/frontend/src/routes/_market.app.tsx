import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_market/app")({
  component: () => <Navigate to="/dashboard" replace />,
});
