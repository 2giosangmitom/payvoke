import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { WagmiProvider } from "wagmi";
import { TooltipProvider } from "@/src/components/ui/tooltip";
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
      <QueryClientProvider client={queryClient}>
        {/* "user" follows prefers-reduced-motion: transforms are skipped and
            opacity still fades, so server and client render the same markup. */}
        <MotionConfig reducedMotion="user">
          <TooltipProvider>{children}</TooltipProvider>
        </MotionConfig>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
