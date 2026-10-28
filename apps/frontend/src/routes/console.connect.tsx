import { createFileRoute, Navigate } from "@tanstack/react-router";

// Coding agent tokens moved into API keys.
export const Route = createFileRoute("/console/connect")({
  component: () => <Navigate to="/console/keys" replace />,
});
