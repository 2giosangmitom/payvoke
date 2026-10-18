import { Type } from "typebox";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { ApiHttpError } from "../../identity/http/identity-http.js";
import { ApiErrorSchema } from "../../identity/http/identity.schemas.js";
import { requireAuth, principalOf } from "../../identity/http/require-auth.js";
import type {
  AgentListing,
  ManifestVersion,
  ProviderProfile,
  OwnedListing,
  PublishingResult,
} from "../domain/publishing.js";
import {
  CatalogView,
  CreateListing,
  CreateVersion,
  ListingParams,
  ListingView,
  OwnedListingView,
  HttpManifestSchema,
  GatewayManifestSchema,
  Page,
  ProfileInput,
  ProfileView,
  VersionParams,
  VersionView,
} from "./publishing.schemas.js";
import type { SlashCommand } from "../../provider-gateway/domain/provider.js";

function value<T>(result: PublishingResult<T>) {
  if (result.isErr())
    throw new ApiHttpError(
      { code: result.error.code, message: result.error.message },
      { NOT_FOUND: 404, CONFLICT: 409, INVALID_MANIFEST: 400 }[result.error.code],
    );
  return result.value;
}
const listingView = (listing: AgentListing) => ({
  id: listing.id,
  paused: listing.paused,
  publishedVersionId: listing.publishedVersionId,
  createdAt: new Date(listing.createdAt).toISOString(),
});
const ownedListingView = (listing: OwnedListing) => ({
  ...listingView(listing),
  name: listing.name,
  candidateState: listing.candidateState,
  candidateVersionId: listing.candidateVersionId,
});
const versionView = (version: ManifestVersion) => ({
  id: version.id,
  manifest: version.manifest,
  digest: version.digest,
  state: version.state,
  reviewedAt: version.reviewedAt?.toISOString() ?? null,
  reviewNote: version.reviewNote,
  createdAt: version.createdAt.toISOString(),
});
const errors = {
  400: ApiErrorSchema,
  401: ApiErrorSchema,
  403: ApiErrorSchema,
  404: ApiErrorSchema,
  409: ApiErrorSchema,
};
const security = [{ bearer: [] }];
function catalogView({
  listing,
  version,
  provider,
  commands,
}: {
  listing: AgentListing;
  version: ManifestVersion;
  provider: ProviderProfile;
  commands?: SlashCommand[];
}) {
  const manifest =
    version.manifest.schemaVersion === 1
      ? (({ endpoint: _endpoint, ...publicManifest }) => publicManifest)(version.manifest)
      : version.manifest;
  return {
    id: listing.id,
    versionId: version.id,
    digest: version.digest,
    providerName: provider.displayName,
    manifest,
    ...(commands ? { commands } : {}),
    verification: "catalog-review-only" as const,
    executionEnabled: false as const,
  };
}

export const publishingRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.get(
    "/v1/provider/listings/:id",
    {
      preHandler: requireAuth,
      schema: { security, params: ListingParams, response: { 200: OwnedListingView, ...errors } },
    },
    async (req) => {
      const listing = await req.diScope
        .resolve("publishingService")
        .listing(principalOf(req).accountId, req.params.id);
      if (!listing)
        throw new ApiHttpError({ code: "NOT_FOUND", message: "Listing not found." }, 404);
      return ownedListingView(listing);
    },
  );
  app.get(
    "/v1/provider/profile",
    { preHandler: requireAuth, schema: { security, response: { 200: ProfileView, ...errors } } },
    async (req) => {
      const profile = value(
        await req.diScope.resolve("publishingService").getProfile(principalOf(req).accountId),
      );
      return { displayName: profile.displayName, createdAt: profile.createdAt.toISOString() };
    },
  );
  app.get(
    "/v1/provider-manifest-schema",
    {
      schema: {
        querystring: Type.Object({
          schemaVersion: Type.Optional(Type.Integer({ minimum: 1, maximum: 2 })),
        }),
        response: { 200: Type.Unknown() },
      },
    },
    async (req) => (req.query.schemaVersion === 2 ? GatewayManifestSchema : HttpManifestSchema),
  );
  app.get(
    "/v1/agents",
    { schema: { querystring: Page, response: { 200: Type.Array(CatalogView) } } },
    async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      return (await req.diScope.resolve("publishingService").catalog(req.query.offset)).map(
        catalogView,
      );
    },
  );
  app.get(
    "/v1/agents/:id",
    {
      schema: {
        params: ListingParams,
        response: { 200: CatalogView, 400: ApiErrorSchema, 404: ApiErrorSchema },
      },
    },
    async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      const agent = await req.diScope.resolve("publishingService").agent(req.params.id);
      if (!agent)
        throw new ApiHttpError(
          { code: "NOT_FOUND", message: "Agent is not available in the catalog." },
          404,
        );
      return catalogView(agent);
    },
  );
  app.post(
    "/v1/provider/profile",
    {
      preHandler: requireAuth,
      schema: { security, body: ProfileInput, response: { 200: ProfileView, ...errors } },
    },
    async (req) => {
      const profile = value(
        await req.diScope
          .resolve("publishingService")
          .profile(principalOf(req).accountId, req.body.displayName),
      );
      return { displayName: profile.displayName, createdAt: profile.createdAt.toISOString() };
    },
  );
  app.get(
    "/v1/provider/listings",
    {
      preHandler: requireAuth,
      schema: {
        security,
        querystring: Page,
        response: { 200: Type.Array(OwnedListingView), ...errors },
      },
    },
    async (req) =>
      (
        await req.diScope
          .resolve("publishingService")
          .owned(principalOf(req).accountId, req.query.offset)
      ).map(ownedListingView),
  );
  app.post(
    "/v1/provider/listings",
    {
      preHandler: requireAuth,
      schema: { security, body: CreateListing, response: { 200: ListingView, ...errors } },
    },
    async (req) =>
      listingView(
        value(
          await req.diScope
            .resolve("publishingService")
            .createListing(principalOf(req).accountId, req.body.id),
        ),
      ),
  );
  app.get(
    "/v1/provider/listings/:id/versions",
    {
      preHandler: requireAuth,
      schema: {
        security,
        params: ListingParams,
        querystring: Page,
        response: { 200: Type.Array(VersionView), ...errors },
      },
    },
    async (req) =>
      value(
        await req.diScope
          .resolve("publishingService")
          .versions(principalOf(req).accountId, req.params.id, req.query.offset),
      ).map(versionView),
  );
  app.post(
    "/v1/provider/listings/:id/versions",
    {
      bodyLimit: 65536,
      preHandler: requireAuth,
      schema: {
        security,
        params: ListingParams,
        body: CreateVersion,
        response: { 200: VersionView, ...errors },
      },
    },
    async (req) =>
      versionView(
        value(
          await req.diScope
            .resolve("publishingService")
            .createVersion(
              principalOf(req).accountId,
              req.params.id,
              req.body.id,
              req.body.manifest,
            ),
        ),
      ),
  );
  app.post(
    "/v1/provider/listings/:id/versions/:versionId/submit",
    {
      preHandler: requireAuth,
      schema: { security, params: VersionParams, response: { 200: VersionView, ...errors } },
    },
    async (req) =>
      versionView(
        value(
          await req.diScope
            .resolve("publishingService")
            .submit(principalOf(req).accountId, req.params.id, req.params.versionId),
        ),
      ),
  );
  app.post(
    "/v1/provider/listings/:id/versions/:versionId/publish",
    {
      preHandler: requireAuth,
      schema: { security, params: VersionParams, response: { 200: ListingView, ...errors } },
    },
    async (req) =>
      listingView(
        value(
          await req.diScope
            .resolve("publishingService")
            .publish(principalOf(req).accountId, req.params.id, req.params.versionId),
        ),
      ),
  );
  app.post(
    "/v1/provider/listings/:id/pause",
    {
      preHandler: requireAuth,
      schema: { security, params: ListingParams, response: { 200: ListingView, ...errors } },
    },
    async (req) =>
      listingView(
        value(
          await req.diScope
            .resolve("publishingService")
            .pause(principalOf(req).accountId, req.params.id),
        ),
      ),
  );
};
