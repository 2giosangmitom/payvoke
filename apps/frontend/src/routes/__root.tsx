import {
  createRootRouteWithContext,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { UnheadProvider } from "@unhead/react/client";
import { type ReactNode } from "react";
import { useDocumentHead, usePageMeta, useRouteMeta } from "@/src/app/head";
import { AppProviders } from "@/src/app/providers";
import { Button } from "@/src/components/ui/button";
import type { RouterContext } from "@/src/router";

// Document tags come from unhead (src/app/head.ts); HeadContent still emits
// the stylesheets and preloads Start's build manifest asks for.
export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
  notFoundComponent() {
    usePageMeta({ title: "Page not found" });
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
  const { head } = Route.useRouteContext();
  return (
    <UnheadProvider value={head}>
      <RootDocument>
        <Outlet />
      </RootDocument>
    </UnheadProvider>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  useDocumentHead();
  useRouteMeta();
  return (
    <html lang="en" suppressHydrationWarning>
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
