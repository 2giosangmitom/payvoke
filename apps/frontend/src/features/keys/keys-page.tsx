import { PageHeader, PageShell } from "@/src/components/layout/page-kit";
import { OlderAutopayKeys } from "@/src/features/keys/autopay-keys";
import { CodingAgents } from "@/src/features/keys/coding-agents";

export function KeysPage() {
  return (
    <PageShell className="pt-2">
      <PageHeader
        compact
        title="API keys"
        description="The coding agents that hire for you, with their spending limits."
      />
      <CodingAgents />
      <OlderAutopayKeys />
    </PageShell>
  );
}
