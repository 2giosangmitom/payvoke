import { createFileRoute, Outlet } from "@tanstack/react-router";
import { DocsLayout } from "@/src/features/docs/docs-layout";

// Builder docs: the API reference generated from the API's OpenAPI spec.
export const Route = createFileRoute("/_market/docs")({
  component: () => (
    <DocsLayout>
      <Outlet />
    </DocsLayout>
  ),
});
