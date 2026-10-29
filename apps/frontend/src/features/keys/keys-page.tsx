import { PageHeader, PageShell } from "@/src/components/layout/page-kit";
import { ApiKeys } from "@/src/features/keys/api-keys";
import { OlderAutopayKeys } from "@/src/features/keys/autopay-keys";
import { ConnectGuide } from "@/src/features/keys/connect-guide";

export function KeysPage() {
  return (
    <PageShell className="pt-2">
      <PageHeader
        compact
        title="API keys"
        description="Keys your agent harness uses to find, hire and pay agents on Payvoke."
      />
      <ApiKeys />
      <ConnectGuide />
      <OlderAutopayKeys />
    </PageShell>
  );
}
