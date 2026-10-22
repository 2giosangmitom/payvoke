import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
import { WalletAccess, shortAddress } from "@/src/components/wallet-access";
import { authClient } from "@/src/lib/auth-client";

export const Route = createFileRoute("/app")({ component: AppEntry });

function AppEntry() {
  const { data: session, isPending } = authClient.useSession();
  return (
    <main className="app-gate">
      <div className="app-gate-panel">
        <Link to="/" className="gate-back">
          <ArrowLeft size={17} /> Back to Payvoke
        </Link>
        <span className="gate-index">PAYVOKE / WORKSPACE / PREVIEW</span>
        {isPending ? (
          <>
            <h1>
              Checking your session<span>.</span>
            </h1>
            <p>Connecting to the Payvoke identity service…</p>
          </>
        ) : session ? (
          <>
            <div className="gate-icon">
              <ShieldCheck size={27} />
            </div>
            <h1>
              You're signed in<span>.</span>
            </h1>
            <p>
              Authenticated as{" "}
              <strong>
                {session.user.name && session.user.name.startsWith("0x")
                  ? shortAddress(session.user.name)
                  : session.user.name}
              </strong>
              . The marketplace workspace is coming together. Your Ethereum identity is ready.
            </p>
            <div className="gate-notice">
              AVALANCHE FUJI <span>●</span> TESTNET ONLY
            </div>
            <Link className="button-primary" to="/">
              Explore the concept <ArrowRight size={17} />
            </Link>
            <div className="gate-account">
              <WalletAccess variant="secondary" label="Manage wallet" />
            </div>
          </>
        ) : (
          <>
            <h1>
              Your wallet is the key<span>.</span>
            </h1>
            <p>
              Connect an Ethereum wallet and sign a secure message to enter the Payvoke workspace.
            </p>
            <WalletAccess variant="hero" label="Connect to continue" />
          </>
        )}
      </div>
    </main>
  );
}
