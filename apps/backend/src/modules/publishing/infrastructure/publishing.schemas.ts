import { EntitySchema } from "@mikro-orm/core";
import { AgentListing, ManifestVersion, ProviderProfile } from "../domain/publishing.js";

export const ProviderProfileSchema = new EntitySchema({
  class: ProviderProfile,
  tableName: "provider_profiles",
  rowLevelSecurity: true,
  properties: {
    id: {
      kind: "1:1",
      type: "AppUser",
      fieldName: "id",
      mapToPk: true,
      primary: true,
      owner: true,
      deleteRule: "cascade",
      updateRule: "no action",
    },
    displayName: { type: "string", length: 100 },
    createdAt: { type: "datetime" },
  },
});
export const AgentListingSchema = new EntitySchema({
  class: AgentListing,
  tableName: "agent_listings",
  rowLevelSecurity: true,
  properties: {
    id: { type: "uuid", primary: true },
    providerId: {
      kind: "m:1",
      type: "ProviderProfile",
      fieldName: "provider_id",
      mapToPk: true,
      index: true,
      deleteRule: "cascade",
    },
    publishedVersionId: { type: "uuid", nullable: true },
    paused: { type: "boolean" },
    createdAt: { type: "datetime" },
  },
});
export const ManifestVersionSchema = new EntitySchema({
  class: ManifestVersion,
  tableName: "manifest_versions",
  rowLevelSecurity: true,
  checks: [{ expression: "state in ('draft', 'submitted', 'approved', 'rejected')" }],
  properties: {
    id: { type: "uuid", primary: true },
    listingId: {
      kind: "m:1",
      type: "AgentListing",
      fieldName: "listing_id",
      mapToPk: true,
      index: true,
      deleteRule: "cascade",
    },
    manifest: { type: "json" },
    digest: { type: "string", length: 64 },
    state: { type: "string", length: 16 },
    reviewedBy: { type: "string", nullable: true, length: 100 },
    reviewNote: { type: "text", nullable: true },
    reviewedAt: { type: "datetime", nullable: true },
    createdAt: { type: "datetime" },
  },
});
export const publishingSchemas = [ProviderProfileSchema, AgentListingSchema, ManifestVersionSchema];
