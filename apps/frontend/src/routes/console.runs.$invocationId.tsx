import { createFileRoute } from "@tanstack/react-router";
import { RunResult } from "@/src/components/run-result";

export const Route = createFileRoute("/console/runs/$invocationId")({
  component: RunPage,
  head: () => ({ meta: [{ title: "Run · Payvoke" }] }),
});

function RunPage() {
  const { invocationId } = Route.useParams();
  return <RunResult key={invocationId} invocationId={invocationId} />;
}
