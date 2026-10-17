import { useEffect, useId, useState } from "react";
import { ChevronRightIcon, Grid2X2Icon } from "lucide-react";
import { useConnectors, type Connector } from "wagmi";
import { createWalletClient, custom } from "viem";
import { createSiweMessage, generateSiweNonce } from "viem/siwe";
import { siEthereum } from "simple-icons";
import { WalletMetamask, WalletTrust } from "@web3icons/react";
import { Button } from "~/components/ui/button";
import { FieldError } from "~/components/ui/field";
import { getSupabase } from "~/lib/supabase";

const metamaskIds = ["io.metamask", "metaMask"];
const trustWalletIds = ["com.trustwallet.app", "com.trustwallet", "trustWallet"];

type WalletOption = {
  id: string;
  name: string;
  connector?: Connector;
  logo?: string;
  Icon?: typeof WalletMetamask;
};

export function WalletSignIn({
  disabled,
  onPendingChange,
  showOthers,
  onShowOthers,
}: {
  disabled: boolean;
  onPendingChange: (pending: boolean) => void;
  showOthers: boolean;
  onShowOthers: () => void;
}) {
  const connectors = useConnectors();
  const otherWallets = connectors.filter(
    (connector) =>
      connector.id !== "injected" &&
      !metamaskIds.includes(connector.id) &&
      !trustWalletIds.includes(connector.id),
  );
  const wallets: WalletOption[] = [
    {
      id: "metaMask",
      name: "MetaMask",
      Icon: WalletMetamask,
      connector: metamaskIds
        .map((id) => connectors.find((connector) => connector.id === id))
        .find(Boolean),
    },
    {
      id: "trustWallet",
      name: "Trust Wallet",
      Icon: WalletTrust,
      connector: trustWalletIds
        .map((id) => connectors.find((connector) => connector.id === id))
        .find(Boolean),
    },
    ...otherWallets.map((connector) => ({
      id: connector.id,
      name: connector.name,
      connector,
      logo: connector.icon?.startsWith("data:image/") ? connector.icon : undefined,
    })),
    ...(otherWallets.length
      ? []
      : [
          {
            id: "injected",
            name: "Browser wallet",
            connector: connectors.find((connector) => connector.id === "injected"),
          },
        ]),
  ];
  const detectedDescriptionId = useId();
  const [detected, setDetected] = useState<Set<string>>(new Set());
  const visibleWallets = wallets.filter((wallet) =>
    showOthers
      ? wallet.id !== "metaMask" && wallet.id !== "trustWallet"
      : wallet.id === "metaMask" || wallet.id === "trustWallet",
  );
  const [signingWallet, setSigningWallet] = useState<string | null>(null);
  const signing = signingWallet !== null;
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all(
      connectors.map(async (connector) => {
        try {
          return (await connector.getProvider()) ? connector.id : null;
        } catch {
          return null;
        }
      }),
    ).then((ids) => {
      if (active) setDetected(new Set(ids.filter((id) => id !== null)));
    });
    return () => {
      active = false;
    };
  }, [connectors]);

  useEffect(() => {
    setError("");
  }, [showOthers]);

  async function signIn(option: WalletOption) {
    setError("");
    setSigningWallet(option.id);
    onPendingChange(true);
    try {
      const wallet = await option.connector?.getProvider();
      if (
        !wallet ||
        typeof wallet !== "object" ||
        !("request" in wallet) ||
        typeof wallet.request !== "function"
      ) {
        setError(
          `${option.name} isn't available. Install it or open this page in its wallet browser, then try again.`,
        );
        return;
      }
      const request = wallet.request;
      const client = createWalletClient({
        transport: custom(
          {
            request: async (args: { method: string; params?: unknown }): Promise<unknown> =>
              request.call(wallet, args),
          },
          { retryCount: 0 },
        ),
      });
      const [address] = await client.requestAddresses();
      if (!address) {
        setError("No wallet account was selected. Unlock your wallet and try again.");
        return;
      }
      // The wallet signs locally; Supabase verifies ownership and issues the session.
      const message = createSiweMessage({
        domain: window.location.host,
        address,
        statement: "Sign in to AgentNe. This does not authorize any transactions or spending.",
        uri: window.location.href,
        version: "1",
        chainId: await client.getChainId(),
        nonce: generateSiweNonce(),
        issuedAt: new Date(),
        expirationTime: new Date(Date.now() + 10 * 60_000),
      });
      const signature = await client.signMessage({ account: address, message });
      const { error: authError } = await getSupabase().auth.signInWithWeb3({
        chain: "ethereum",
        message,
        signature,
      });
      if (authError) {
        setError(
          authError.status === 429
            ? "Too many sign-in attempts. Please wait a moment and try again."
            : "Wallet sign-in failed. Please try again or use email. The site may need to enable Web3 sign-in in Supabase.",
        );
      }
    } catch {
      setError(
        "Wallet sign-in wasn't completed. Approve the connection and sign-in message in your wallet, or use email instead.",
      );
    } finally {
      setSigningWallet(null);
      onPendingChange(false);
    }
  }

  return (
    <div className="flex flex-col gap-3" aria-busy={signing}>
      <p id={detectedDescriptionId} className="sr-only">
        Available in this browser.
      </p>
      <div className="flex flex-col gap-2" role="group" aria-label="Choose a wallet">
        {visibleWallets.map((wallet, index) => (
          <Button
            key={wallet.id}
            data-auth-focus={index === 0 ? "" : undefined}
            type="button"
            variant="outline"
            size="lg"
            className="w-full justify-start gap-3"
            disabled={disabled}
            aria-describedby={
              wallet.connector && detected.has(wallet.connector.id)
                ? detectedDescriptionId
                : undefined
            }
            onClick={() => signIn(wallet)}
          >
            <span
              className="relative flex size-6 shrink-0 items-center justify-center rounded-md bg-muted"
              aria-hidden="true"
            >
              {wallet.Icon ? (
                <wallet.Icon size={24} variant="branded" className="size-6 shrink-0" />
              ) : wallet.logo ? (
                <img
                  src={wallet.logo}
                  alt=""
                  width={24}
                  height={24}
                  className="size-6 object-contain"
                />
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  className="size-6 shrink-0"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d={siEthereum.path} />
                </svg>
              )}
              {wallet.connector && detected.has(wallet.connector.id) && (
                <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full border-2 border-popover bg-emerald-300" />
              )}
            </span>
            {signingWallet === wallet.id ? "Check your wallet…" : wallet.name}
          </Button>
        ))}
        {!showOthers && (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full justify-start gap-3"
            disabled={disabled}
            onClick={() => {
              setError("");
              onShowOthers();
            }}
          >
            <span
              className="flex size-6 items-center justify-center rounded-md bg-muted"
              aria-hidden="true"
            >
              <Grid2X2Icon className="size-4 text-muted-foreground" />
            </span>
            Other wallets
            <ChevronRightIcon className="ml-auto text-muted-foreground" aria-hidden="true" />
          </Button>
        )}
      </div>
      {error && <FieldError>{error}</FieldError>}
      <p className="sr-only">A signature only, no transaction or gas fee.</p>
    </div>
  );
}
