import { createFileRoute, type SearchSchemaInput } from "@tanstack/react-router";
import { ProviderPage } from "~/components/marketplace/provider-page";

export const Route = createFileRoute("/provider")({
  validateSearch: (search: Record<string, unknown> & SearchSchemaInput) => ({
    listing: typeof search.listing === "string" ? search.listing : undefined,
    section: search.section === "applications" ? "applications" : "listings",
    application: typeof search.application === "string" ? search.application : undefined,
    view: search.view === "commands" || search.view === "playground" ? search.view : "keys",
    invocation: typeof search.invocation === "string" ? search.invocation : undefined,
  }),
  component: ProviderPage,
});
