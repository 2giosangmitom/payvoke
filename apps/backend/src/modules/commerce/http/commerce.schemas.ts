import { Type } from "typebox";

const strict = { additionalProperties: false };
const uuid = Type.String({ format: "uuid" });
const digest = Type.String({ pattern: "^[a-f0-9]{64}$" });

export const QuoteInput = Type.Object(
  {
    id: uuid,
    workspaceId: uuid,
    listingId: uuid,
    versionId: uuid,
    actionId: Type.String({ minLength: 1, maxLength: 64 }),
    variantId: Type.String({ minLength: 1, maxLength: 64 }),
    input: Type.Record(
      Type.String({ pattern: "^[a-z][a-z0-9_]{0,31}$" }),
      Type.String({ maxLength: 16000 }),
      { maxProperties: 10 },
    ),
    briefRevision: Type.Integer({ minimum: 0 }),
  },
  strict,
);
export const OrderInput = Type.Object(
  {
    id: uuid,
    operationId: uuid,
    quoteId: uuid,
    quoteDigest: digest,
    confirmTerms: Type.Literal(true),
  },
  strict,
);
export const IdParams = Type.Object({ id: uuid });
export const QuoteView = Type.Object({
  id: uuid,
  digest,
  terms: Type.Object({
    listingId: uuid,
    versionId: uuid,
    manifestDigest: digest,
    providerId: uuid,
    actionId: Type.String(),
    variantId: Type.String(),
    model: Type.String(),
    input: Type.Record(Type.String(), Type.String()),
    workspaceId: uuid,
    briefRevision: Type.Integer(),
    brief: Type.String(),
    briefDigest: digest,
    pricing: Type.Object({
      kind: Type.Literal("fixed"),
      amountMinor: Type.String(),
      currency: Type.Literal("test-credit"),
    }),
    limits: Type.Object({
      inputChars: Type.Integer(),
      outputTokens: Type.Integer(),
      timeoutSeconds: Type.Integer(),
    }),
    dataPolicy: Type.Object({
      destinations: Type.Array(Type.String()),
      retention: Type.String(),
      terms: Type.String(),
    }),
    profile: Type.Literal("text-v1"),
    admission: Type.Literal("catalog-review-only"),
  }),
  expiresAt: Type.String(),
  createdAt: Type.String(),
  paymentEnabled: Type.Literal(false),
  executionEnabled: Type.Literal(false),
});
export const OrderView = Type.Object({
  id: uuid,
  operationId: uuid,
  quoteId: uuid,
  quoteDigest: digest,
  status: Type.Literal("pending_admission"),
  createdAt: Type.String(),
  paymentEnabled: Type.Literal(false),
  executionEnabled: Type.Literal(false),
});
