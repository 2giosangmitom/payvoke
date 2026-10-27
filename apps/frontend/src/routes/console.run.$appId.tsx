import { createFileRoute } from "@tanstack/react-router";
import { ToolRun } from "@/src/components/tool-run";

export const Route = createFileRoute("/console/run/$appId")({
  component: ToolRunPage,
  head: () => ({ meta: [{ title: "Run a tool · Payvoke" }] }),
});

function ToolRunPage() {
  const { appId } = Route.useParams();
  return <ToolRun key={appId} appId={appId} />;
}
