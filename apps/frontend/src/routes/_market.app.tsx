import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { WalletAccess } from "@/src/components/wallet-access";
import { authClient } from "@/src/lib/auth-client";
import { Marketplace } from "@/src/components/marketplace";

export const Route = createFileRoute("/_market/app")({
  head: () => ({ meta: [{ title: "Workspace | Payvoke" }] }),
  component: AppEntry,
});

function AppEntry() {
  const { data: session, isPending } = authClient.useSession();
  if (!isPending && session)
    return <Marketplace key={session.user.id} accountId={session.user.id} />;

  return (
    <main className="market-shell">
      <section className="workspace-gate">
        <div>
          <p className="workspace-kicker">Your workspace</p>
          <h1>{isPending ? "Checking your session." : "Sign in to open your workspace."}</h1>
          <p>
            Keep saved listings and collections in one place. Manage your provider apps here too.
          </p>
          {!isPending && <WalletAccess variant="hero" label="Connect wallet" />}
          <Link to="/agents" className="workspace-gate-link">
            Browse agents <ArrowUpRight size={17} strokeWidth={1.6} />
          </Link>
        </div>
      </section>
    </main>
  );
}
