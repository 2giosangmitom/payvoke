import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { Result, TaggedError } from "better-result";

/** Version 1 deliberately admits final-only text providers, not arbitrary executable schemas. */
interface ManifestCommon {
  name: string;
  description: string;
  variants: { id: string; model: string; description: string }[];
  pricing: { kind: "fixed"; amountMinor: string; currency: "test-credit" };
  runtime: {
    protocol: "provider-text-v1" | "provider-gateway-v1";
    streaming: false;
    cancellation: false;
    startDeduplication: true;
    statusRecovery: true;
  };
  limits: { inputChars: number; outputTokens: number; timeoutSeconds: number };
  dataPolicy: { destinations: string[]; retention: string; terms: string };
}
export interface HttpProviderManifest extends ManifestCommon {
  schemaVersion: 1;
  endpoint: string;
  actions: { id: string; description: string; input: "text-v1"; output: "text-v1" }[];
  runtime: ManifestCommon["runtime"] & { protocol: "provider-text-v1" };
}
export interface GatewayProviderManifest extends ManifestCommon {
  schemaVersion: 2;
  gateway: { applicationId: string; commandRevisionId: string };
  runtime: ManifestCommon["runtime"] & { protocol: "provider-gateway-v1" };
}
export type ProviderManifest = HttpProviderManifest | GatewayProviderManifest;

export class PublishingError extends TaggedError("PublishingError")<{
  code: "NOT_FOUND" | "CONFLICT" | "INVALID_MANIFEST";
  message: string;
}> {}
export type PublishingResult<T> = Result<T, PublishingError>;
export const failure = (code: PublishingError["code"], message: string) =>
  Result.err(new PublishingError({ code, message }));

function publicHttps(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      !isIP(host) &&
      !host.includes(":") &&
      host.includes(".") &&
      !host.endsWith(".") &&
      !["localhost", "local", "internal", "test", "invalid"].some(
        (suffix) => host === suffix || host.endsWith(`.${suffix}`),
      )
    );
  } catch {
    return false;
  }
}

export function validateManifest(manifest: ProviderManifest): PublishingResult<ProviderManifest> {
  if (
    (manifest.schemaVersion === 1 && !publicHttps(manifest.endpoint)) ||
    manifest.dataPolicy.destinations.some((url) => !publicHttps(url))
  ) {
    return failure(
      "INVALID_MANIFEST",
      "Declare HTTPS destinations without credentials, query strings, IP literals, or local hostnames.",
    );
  }
  if (
    (manifest.schemaVersion === 1 &&
      new Set(manifest.actions.map((action) => action.id)).size !== manifest.actions.length) ||
    new Set(manifest.variants.map((variant) => variant.id)).size !== manifest.variants.length
  ) {
    return failure("INVALID_MANIFEST", "Action and variant identifiers must be unique.");
  }
  return Result.ok(manifest);
}

/** Deterministic digest independent of object key insertion order; arrays retain order. */
export function manifestDigest(manifest: ProviderManifest): string {
  function canonical(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value !== null && typeof value === "object")
      return `{${Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
        .join(",")}}`;
    return JSON.stringify(value);
  }
  return createHash("sha256").update(canonical(manifest)).digest("hex");
}

export class ProviderProfile {
  id!: string; // one provider identity per Supabase account
  displayName!: string;
  createdAt = new Date();
}
export class AgentListing {
  id!: string;
  providerId!: string;
  publishedVersionId: string | null = null;
  paused = true;
  createdAt = new Date();
}
export class ManifestVersion {
  id!: string;
  listingId!: string;
  manifest!: ProviderManifest;
  digest!: string;
  state: "draft" | "submitted" | "approved" | "rejected" = "draft";
  reviewedBy: string | null = null;
  reviewNote: string | null = null;
  reviewedAt: Date | null = null;
  createdAt = new Date();
}

export type OwnedListing = AgentListing & {
  name: string | null;
  candidateVersionId: string | null;
  candidateState: string | null;
};

export type Review = {
  digest: string;
  decision: "approved" | "rejected";
  reviewer: string;
  note: string;
};
