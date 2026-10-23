import { createRootRoute, Outlet, Scripts, HeadContent, Link } from "@tanstack/react-router";
import { type ReactNode } from "react";
import { AppProviders } from "@/src/components/app-providers";
import { themeScript } from "@/src/lib/theme";
import { preloads } from "fontless/runtime";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#f4f7f5" },
      { title: "Payvoke | Useful ideas, shared" },
      {
        name: "description",
        content:
          "Find AI agents and tools, save useful work, and publish your own on Payvoke. Building on Avalanche Fuji.",
      },
    ],
    links: [
      { rel: "icon", href: "/logo.svg", type: "image/svg+xml" },
      ...preloads.map(({ crossorigin, ...attributes }) => ({
        ...attributes,
        crossOrigin: crossorigin,
      })),
    ],
  }),
  component: RootComponent,
  notFoundComponent() {
    return (
      <main className="page-container workspace-gate">
        <div>
          <h1>This page is not available.</h1>
          <p>The link may have changed. Browse the directory to find an agent or tool.</p>
          <Link to="/agents" className="button-primary">
            Browse agents
          </Link>
        </div>
      </main>
    );
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
    <html lang="en" data-theme="osaka-jade" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
        <Scripts />
      </body>
    </html>
  );
}
