import { createFileRoute } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { ThreadChat } from "@/src/components/thread-chat";
import { WalletAccess } from "@/src/components/wallet-access";
import { authClient } from "@/src/lib/auth-client";

export const Route = createFileRoute("/_market/chat/$threadId")({
  component: ThreadPage,
  head: () => ({ meta: [{ title: "Thread — Payvoke" }] }),
});

function ThreadPage() {
  const { threadId } = Route.useParams();
  const { data: session, isPending } = authClient.useSession();
  if (isPending)
    return (
      <main className="run-shell chat-thread-main">
        <p>
          <LoaderCircle className="animate-spin" size={16} /> Checking wallet session…
        </p>
      </main>
    );
  if (!session)
    return (
      <main className="run-shell chat-thread-main">
        <section className="workspace-gate">
          <div>
            <p className="workspace-kicker">PRIVATE THREAD</p>
            <h1>Connect to open this thread.</h1>
            <p>
              Threads and paid receipts are scoped to the browser wallet that created them. Sign in
              with that wallet to continue.
            </p>
            <WalletAccess variant="hero" label="Connect wallet" />
          </div>
        </section>
      </main>
    );
  return (
    <main className="chat-thread-main">
      <ThreadChat key={threadId} threadId={threadId} />
    </main>
  );
}
