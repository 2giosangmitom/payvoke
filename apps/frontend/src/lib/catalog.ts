import type { paths } from "./schema";

export type CatalogAgent =
  paths["/v1/agents"]["get"]["responses"][200]["content"]["application/json"][number];
export type Manifest =
  paths["/v1/provider/listings/{id}/versions"]["post"]["requestBody"]["content"]["application/json"]["manifest"];
export function declaredPrice(pricing: CatalogAgent["manifest"]["pricing"]) {
  // Never convert money to a floating-point number or imply a payable quote.
  return `${pricing.amountMinor} test credits`;
}
export function matchesAgent(agent: CatalogAgent, query: string, filter: string) {
  const text = [
    agent.manifest.name,
    agent.manifest.description,
    agent.providerName,
    ...agentActions(agent).flatMap((action) => [action.id, action.description]),
  ]
    .join(" ")
    .toLowerCase();
  return (
    text.includes(query.trim().toLowerCase()) &&
    (filter !== "design" || /design|logo|illustrat/.test(text))
  );
}
export function agentActions(agent: CatalogAgent) {
  return agent.manifest.schemaVersion === 1
    ? agent.manifest.actions
    : (agent.commands ?? []).map((command) => ({
        id: command.name,
        description: command.description,
      }));
}
