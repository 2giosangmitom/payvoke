import { createRootRoute, Outlet, Scripts, HeadContent, Link } from "@tanstack/react-router";
import { type ReactNode } from "react";
import { AppProviders } from "@/src/components/app-providers";
import { Button } from "@/src/components/ui/button";
import { themeScript } from "@/src/lib/theme";
import { preloads } from "fontless/runtime";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#f4f7f5" },
      { title: "Payvoke · Slash-command apps, paid per request" },
      {
        name: "description",
        content:
          "Find apps with slash commands, keep your threads in one list, and publish your own. Building on Avalanche Fuji.",
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
      <main className="container-page grid min-h-dvh place-items-center py-24">
        <div className="max-w-lg">
          <p className="mb-5 eyebrow">404</p>
          <h1 className="text-[clamp(2.2rem,5vw,3.5rem)] leading-tight font-medium tracking-[-0.05em]">
            This page is not available.
          </h1>
          <p className="mt-4 leading-7 text-muted-foreground">
            The link may have changed. The store lists every public app and its commands.
          </p>
          <Button size="lg" className="mt-8" render={<Link to="/store" />}>
            Browse the store
          </Button>
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
    <html lang="en" suppressHydrationWarning>
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
