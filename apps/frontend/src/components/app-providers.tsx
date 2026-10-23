import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { walletConfig } from "@/src/lib/wagmi";

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => {
    const client = new QueryClient();
    const cacheOptions = { staleTime: 30_000, gcTime: 10 * 60_000, retry: 1 };
    client.setQueryDefaults(["account"], cacheOptions);
    client.setQueryDefaults(["catalog"], cacheOptions);
    return client;
  });

  return (
    <WagmiProvider config={walletConfig} reconnectOnMount>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
