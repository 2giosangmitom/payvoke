import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/run")({
  component: () => <Navigate to="/console" replace />,
});
