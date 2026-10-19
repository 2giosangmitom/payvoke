import { createRootRoute, Outlet, Scripts, HeadContent } from "@tanstack/react-router";
import { type ReactNode } from "react";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "uft-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Payvoke" },
    ],
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
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
