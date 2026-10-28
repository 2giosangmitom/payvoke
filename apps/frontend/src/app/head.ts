import { useMatches } from "@tanstack/react-router";
import { useHead, useSeoMeta } from "@unhead/react";
import { createHead as createClientHead } from "@unhead/react/client";
import { createHead as createServerHead } from "@unhead/react/server";
import { preloads } from "fontless/runtime";

const SITE_NAME = "Payvoke";
const SITE_TITLE = "Payvoke · Slash-command apps, paid per request";
const SITE_DESCRIPTION =
  "Find apps with slash commands, keep your threads in one list, and publish your own. Building on Avalanche Fuji.";

// Routes declare their page meta as static data, so it applies even while a
// layout (the console's sign-in gate) has not rendered the page itself.
declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    title?: string;
    description?: string;
  }
}

// One head per server request, rendered into its HTML by src/server.ts; one
// for the browser's lifetime, kept in sync with the DOM on navigation.
export const createAppHead = () => (import.meta.env.SSR ? createServerHead() : createClientHead());
export type AppHead = ReturnType<typeof createAppHead>;

// Document-wide tags. Pages add their own title and description on top.
export function useDocumentHead() {
  useHead({
    title: SITE_TITLE,
    meta: [
      { charset: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#f4f7f5" },
      { name: "description", content: SITE_DESCRIPTION },
      { property: "og:site_name", content: SITE_NAME },
    ],
    link: [
      { rel: "icon", href: "/logo.svg", type: "image/svg+xml" },
      ...preloads.map(({ rel, as, href, crossorigin }) => ({
        rel,
        as,
        href,
        // An empty crossorigin attribute means "anonymous".
        crossorigin: crossorigin === "" ? "anonymous" : crossorigin,
      })),
    ],
  });
}

// The deepest matched route's static title and description.
export function useRouteMeta() {
  const meta = useMatches({
    select: (matches) => {
      const match = matches.findLast((entry) => entry.staticData.title);
      return { title: match?.staticData.title, description: match?.staticData.description };
    },
    structuralSharing: true,
  });
  usePageMeta(meta);
}

// A page's title (the site name is appended) and, for public pages, the
// description search engines and link previews show. Components call it to
// replace their route's static meta with loaded data, such as an app's name.
export function usePageMeta({ title, description }: { title?: string; description?: string }) {
  const full = title ? `${title} · ${SITE_NAME}` : undefined;
  useSeoMeta({
    ...(full ? { title: full, ogTitle: full } : {}),
    ...(description ? { description, ogDescription: description } : {}),
  });
}
