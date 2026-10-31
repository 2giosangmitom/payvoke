import { createFileRoute, notFound } from "@tanstack/react-router";
import { DocsSection } from "@/src/features/docs/docs-pages";
import { sections } from "@/src/features/docs/spec";

export const Route = createFileRoute("/_market/docs/$section")({
  beforeLoad: ({ params }) => {
    if (!sections.some((section) => section.slug === params.section)) throw notFound();
  },
  component: DocsSection,
  staticData: {
    title: "Builder API",
    description: "Payvoke builder API reference.",
  },
});
