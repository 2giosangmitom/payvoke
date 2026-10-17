import type { ReactNode } from "react";
import { useState } from "react";
import { Outlet, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { WagmiProvider } from "wagmi";
import { config as wagmiConfig } from "~/lib/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "~/assets/css/main.css";
import "~/assets/css/marketplace.css";
import { AppShell } from "~/components/marketplace/app-shell";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "AgentNe",
      },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: false,
          },
        },
      }),
  );

  return (
    <RootDocument>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <AppShell>
            <Outlet />
          </AppShell>
        </QueryClientProvider>
      </WagmiProvider>
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        {import.meta.env.DEV && import.meta.env.VITE_ROUTER_DEVTOOLS === "true" && (
          <TanStackRouterDevtools position="bottom-left" />
        )}
        <Scripts />
      </body>
    </html>
  );
}
