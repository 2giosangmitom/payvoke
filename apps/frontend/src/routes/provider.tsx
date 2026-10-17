import { createFileRoute, type SearchSchemaInput } from "@tanstack/react-router";
import { ProviderPage } from "~/components/marketplace/provider-page";

export const Route = createFileRoute("/provider")({
  validateSearch: (search: Record<string, unknown> & SearchSchemaInput) => ({
    listing: typeof search.listing === "string" ? search.listing : undefined,
  }),
  component: ProviderPage,
});
