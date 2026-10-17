import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { declaredPrice, matchesAgent, type CatalogAgent } from "../src/lib/catalog";

const manifest = JSON.parse(
  readFileSync(
    new URL("../../../packages/logo-designer/src/manifest.json", import.meta.url),
    "utf8",
  ),
);
const agent: CatalogAgent = {
  id: "agent",
  versionId: "version",
  digest: "digest",
  providerName: "Example Studio",
  manifest,
  verification: "catalog-review-only",
  executionEnabled: false,
};
describe("catalog presentation", () => {
  it("searches task, provider and description without inventing catalog metadata", () => {
    expect(matchesAgent(agent, "LOGO", "all")).toBe(true);
    expect(matchesAgent(agent, "example studio", "design")).toBe(true);
    expect(matchesAgent(agent, "design-logo", "text")).toBe(true);
    expect(matchesAgent(agent, "video editing", "all")).toBe(false);
  });
  it("preserves integer pricing declarations without floating-point rounding", () => {
    expect(
      declaredPrice({ kind: "fixed", amountMinor: "999999999999999999", currency: "test-credit" }),
    ).toBe("999999999999999999 test credits");
  });
});
