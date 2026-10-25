import { createFileRoute } from "@tanstack/react-router";
import { Eyebrow, LoadingState } from "@/src/components/page-kit";
import { ThreadChat } from "@/src/components/thread-chat";
import { WalletAccess } from "@/src/components/wallet-access";
import { authClient } from "@/src/lib/auth-client";

export const Route = createFileRoute("/_market/chat/$threadId")({
  component: ThreadPage,
  head: () => ({ meta: [{ title: "Thread · Payvoke" }] }),
});

function ThreadPage() {
  const { threadId } = Route.useParams();
  const { data: session, isPending } = authClient.useSession();
  if (isPending)
    return (
      <main>
        <LoadingState className="px-8">Checking wallet session…</LoadingState>
      </main>
    );
  if (!session)
    return (
      <main className="justify-center px-6 py-16 sm:px-12">
        <Eyebrow className="mb-4">Private thread</Eyebrow>
        <h1 className="max-w-lg text-[clamp(2rem,4vw,3rem)] leading-tight font-medium tracking-[-0.05em]">
          Connect to open this thread.
        </h1>
        <p className="mt-4 mb-8 max-w-lg leading-7 text-muted-foreground">
          Threads and receipts belong to the wallet that created them. Sign in with that wallet to
          continue.
        </p>
        <div>
          <WalletAccess variant="hero" label="Connect wallet" />
        </div>
      </main>
    );
  return (
    <main>
      <ThreadChat key={threadId} threadId={threadId} />
    </main>
  );
}
