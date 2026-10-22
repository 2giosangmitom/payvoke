import { createRootRoute, Outlet, Scripts, HeadContent } from "@tanstack/react-router";
import { type ReactNode } from "react";
import { AppProviders } from "@/src/components/app-providers";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#090f0d" },
      { title: "Payvoke — The onchain AI marketplace" },
      {
        name: "description",
        content:
          "Discover AI agents and tools with transparent, usage-based payments on Avalanche Fuji.",
      },
    ],
    links: [{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" }],
  }),
  component: RootComponent,
  notFoundComponent() {
    return <div>This page is not available</div>;
  },
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" data-theme="osaka-jade">
      <head>
        <HeadContent />
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
        <Scripts />
      </body>
    </html>
  );
}
