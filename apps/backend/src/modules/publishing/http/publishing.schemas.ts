import { Type } from "typebox";
import { Commands } from "../../provider-gateway/http/provider.schemas.js";

const strict = { additionalProperties: false };
const text = (maxLength: number) => Type.String({ minLength: 1, maxLength, pattern: "\\S" });
const identifier = Type.String({ pattern: "^[a-z][a-z0-9-]{0,63}$" });
const uuid = Type.String({ format: "uuid" });
export const HttpManifestSchema = Type.Object(
  {
    schemaVersion: Type.Literal(1),
    name: text(100),
    description: text(2000),
    endpoint: text(2048),
    actions: Type.Array(
      Type.Object(
        {
          id: identifier,
          description: text(500),
          input: Type.Literal("text-v1"),
          output: Type.Literal("text-v1"),
        },
        strict,
      ),
      { minItems: 1, maxItems: 8 },
    ),
    variants: Type.Array(
      Type.Object({ id: identifier, model: text(200), description: text(500) }, strict),
      { minItems: 1, maxItems: 8 },
    ),
    pricing: Type.Object(
      {
        kind: Type.Literal("fixed"),
        amountMinor: Type.String({ pattern: "^(0|[1-9][0-9]{0,17})$" }),
        currency: Type.Literal("test-credit"),
      },
      strict,
    ),
    runtime: Type.Object(
      {
        protocol: Type.Literal("provider-text-v1"),
        streaming: Type.Literal(false),
        cancellation: Type.Literal(false),
        startDeduplication: Type.Literal(true),
        statusRecovery: Type.Literal(true),
      },
      strict,
    ),
    limits: Type.Object(
      {
        inputChars: Type.Integer({ minimum: 1, maximum: 16000 }),
        outputTokens: Type.Integer({ minimum: 1, maximum: 8192 }),
        timeoutSeconds: Type.Integer({ minimum: 1, maximum: 120 }),
      },
      strict,
    ),
    dataPolicy: Type.Object(
      {
        destinations: Type.Array(text(2048), { minItems: 1, maxItems: 8, uniqueItems: true }),
        retention: text(2000),
        terms: text(4000),
      },
      strict,
    ),
  },
  strict,
);
const {
  schemaVersion: _schemaVersion,
  endpoint: _endpoint,
  actions: _actions,
  runtime: _runtime,
  ...common
} = HttpManifestSchema.properties;
export const GatewayManifestSchema = Type.Object(
  {
    ...common,
    schemaVersion: Type.Literal(2),
    gateway: Type.Object({ applicationId: uuid, commandRevisionId: uuid }, strict),
    runtime: Type.Object(
      {
        ...HttpManifestSchema.properties.runtime.properties,
        protocol: Type.Literal("provider-gateway-v1"),
      },
      strict,
    ),
  },
  strict,
);
export const ManifestSchema = Type.Union([HttpManifestSchema, GatewayManifestSchema]);
export const ProfileInput = Type.Object({ displayName: text(100) }, strict);
export const CreateListing = Type.Object({ id: uuid }, strict);
export const CreateVersion = Type.Object({ id: uuid, manifest: ManifestSchema }, strict);
export const ListingParams = Type.Object({ id: uuid });
export const VersionParams = Type.Object({ id: uuid, versionId: uuid });
export const Page = Type.Object({
  offset: Type.Optional(Type.Integer({ minimum: 0, maximum: 10000 })),
});
export const ListingView = Type.Object({
  id: uuid,
  publishedVersionId: Type.Union([uuid, Type.Null()]),
  paused: Type.Boolean(),
  createdAt: Type.String(),
});
export const OwnedListingView = Type.Intersect([
  ListingView,
  Type.Object({
    name: Type.Union([Type.String(), Type.Null()]),
    candidateVersionId: Type.Union([uuid, Type.Null()]),
    candidateState: Type.Union([Type.String(), Type.Null()]),
  }),
]);
export const VersionView = Type.Object({
  id: uuid,
  manifest: ManifestSchema,
  digest: Type.String(),
  state: Type.String(),
  reviewedAt: Type.Union([Type.String(), Type.Null()]),
  reviewNote: Type.Union([Type.String(), Type.Null()]),
  createdAt: Type.String(),
});
export const ProfileView = Type.Object({ displayName: Type.String(), createdAt: Type.String() });
const { endpoint: _privateEndpoint, ...publicProperties } = HttpManifestSchema.properties;
export const CatalogView = Type.Object({
  id: uuid,
  versionId: uuid,
  digest: Type.String(),
  providerName: Type.String(),
  manifest: Type.Union([Type.Object(publicProperties, strict), GatewayManifestSchema]),
  commands: Type.Optional(Commands),
  verification: Type.Literal("catalog-review-only"),
  executionEnabled: Type.Literal(false),
});
