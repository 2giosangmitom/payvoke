import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Value } from "typebox/value";
import { ManifestSchema } from "../src/modules/publishing/http/publishing.schemas.js";
import {
  manifestDigest,
  validateManifest,
  type HttpProviderManifest as ProviderManifest,
} from "../src/modules/publishing/domain/publishing.js";

const sampleManifest = JSON.parse(
  readFileSync(
    new URL("../../../packages/logo-designer/src/manifest.json", import.meta.url),
    "utf8",
  ),
) as ProviderManifest;
describe("publishing manifest", () => {
  it("admits the single-purpose logo designer and hashes independent of object key order", () => {
    expect(Value.Check(ManifestSchema, sampleManifest)).toBe(true);
    expect(validateManifest(sampleManifest).isOk()).toBe(true);
    expect(sampleManifest.actions.map((action) => action.id)).toEqual(["design-logo"]);
    expect(manifestDigest(sampleManifest)).toBe(
      manifestDigest(
        Object.fromEntries(Object.entries(sampleManifest).reverse()) as unknown as ProviderManifest,
      ),
    );
    expect(manifestDigest({ ...sampleManifest, endpoint: "https://changed.example.com" })).not.toBe(
      manifestDigest(sampleManifest),
    );
  });
  it("rejects unsafe destinations and duplicate identifiers without fetching URLs", () => {
    for (const endpoint of [
      "http://example.com",
      "https://127.0.0.1",
      "https://[::1]",
      "https://2130706433",
      "https://localhost",
      "https://a.internal",
      "https://user:password@example.com",
      "https://example.com?token=secret",
      "https://example.com/#secret",
    ]) {
      expect(validateManifest({ ...sampleManifest, endpoint }).isErr(), endpoint).toBe(true);
    }
    expect(
      validateManifest({
        ...sampleManifest,
        variants: [sampleManifest.variants[0]!, sampleManifest.variants[0]!],
      }).isErr(),
    ).toBe(true);
    expect(Value.Check(ManifestSchema, { ...sampleManifest, credentials: "secret" })).toBe(false);
    expect(
      Value.Check(ManifestSchema, {
        ...sampleManifest,
        runtime: { ...sampleManifest.runtime, streaming: true },
      }),
    ).toBe(false);
  });
});
