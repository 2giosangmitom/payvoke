import { createHash } from "node:crypto";
import type { ProviderManifest } from "../../publishing/domain/publishing.js";
import type { SlashCommand } from "../../provider-gateway/domain/provider.js";
import { validateInput } from "../../provider-gateway/domain/provider.js";

export class CommerceError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "CONFLICT" | "INVALID_INPUT" | "UNAVAILABLE",
    message: string,
  ) {
    super(message);
  }
}

export type QuoteRequest = {
  id: string;
  workspaceId: string;
  listingId: string;
  versionId: string;
  actionId: string;
  variantId: string;
  input: Record<string, string>;
  briefRevision: number;
};

export type QuoteTerms = {
  listingId: string;
  versionId: string;
  manifestDigest: string;
  providerId: string;
  actionId: string;
  variantId: string;
  model: string;
  input: Record<string, string>;
  workspaceId: string;
  briefRevision: number;
  brief: string;
  briefDigest: string;
  pricing: { kind: "fixed"; amountMinor: string; currency: "test-credit" };
  limits: { inputChars: number; outputTokens: number; timeoutSeconds: number };
  dataPolicy: { destinations: string[]; retention: string; terms: string };
  profile: "text-v1";
  admission: "catalog-review-only";
};

/** The quote is a preview of immutable terms. It grants no right to execute. */
export class Quote {
  id!: string;
  buyerId!: string;
  requestDigest!: string;
  terms!: QuoteTerms;
  digest!: string;
  expiresAt!: Date;
  createdAt = new Date();
}

/** A durable intent, deliberately without an entitlement or payment effect. */
export class Order {
  id!: string;
  buyerId!: string;
  operationId!: string;
  quoteId!: string;
  quoteDigest!: string;
  status = "pending_admission" as const;
  createdAt = new Date();
}

export function canonicalDigest(value: unknown): string {
  function canonical(item: unknown): string {
    if (Array.isArray(item)) return `[${item.map(canonical).join(",")}]`;
    if (item !== null && typeof item === "object")
      return `{${Object.entries(item)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
        .join(",")}}`;
    return JSON.stringify(item);
  }
  return createHash("sha256").update(canonical(value)).digest("hex");
}

export function quoteTerms(
  input: QuoteRequest,
  manifest: ProviderManifest,
  manifestDigest: string,
  providerId: string,
  brief: string,
  commands: SlashCommand[] | undefined,
): QuoteTerms {
  const variant = manifest.variants.find((item) => item.id === input.variantId);
  if (!variant) throw new CommerceError("INVALID_INPUT", "Unknown model variant.");
  if (manifest.schemaVersion === 1) {
    if (!manifest.actions.some((item) => item.id === input.actionId))
      throw new CommerceError("INVALID_INPUT", "Unknown agent action.");
    if (
      Object.keys(input.input).length !== 1 ||
      typeof input.input.text !== "string" ||
      !input.input.text.trim()
    )
      throw new CommerceError("INVALID_INPUT", "This action accepts one text input.");
  } else {
    const command = commands?.find((item) => item.name === input.actionId);
    if (!command) throw new CommerceError("INVALID_INPUT", "Unknown agent command.");
    try {
      validateInput(command, input.input);
    } catch {
      throw new CommerceError("INVALID_INPUT", "Command input does not match its pinned schema.");
    }
  }
  const inputChars = Object.values(input.input).reduce((total, value) => total + value.length, 0);
  if (!inputChars || inputChars > manifest.limits.inputChars)
    throw new CommerceError("INVALID_INPUT", "Input exceeds the agent's declared limit.");
  return {
    listingId: input.listingId,
    versionId: input.versionId,
    manifestDigest,
    providerId,
    actionId: input.actionId,
    variantId: variant.id,
    model: variant.model,
    input: input.input,
    workspaceId: input.workspaceId,
    briefRevision: input.briefRevision,
    brief,
    briefDigest: canonicalDigest(brief),
    pricing: manifest.pricing,
    limits: manifest.limits,
    dataPolicy: manifest.dataPolicy,
    profile: "text-v1",
    admission: "catalog-review-only",
  };
}
