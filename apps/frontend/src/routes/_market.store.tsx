import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_market/store")({ component: StoreLayout });

function StoreLayout() {
  return <Outlet />;
}
