import type {
  AgentListing,
  ManifestVersion,
  ProviderProfile,
  PublishingResult,
  ProviderManifest,
  Review,
  OwnedListing,
} from "../domain/publishing.js";

export interface PublishingRepository {
  getProfile(ownerId: string): Promise<PublishingResult<ProviderProfile>>;
  profile(ownerId: string, displayName: string): Promise<PublishingResult<ProviderProfile>>;
  createListing(ownerId: string, id: string): Promise<PublishingResult<AgentListing>>;
  owned(ownerId: string, offset: number, listingId?: string): Promise<OwnedListing[]>;
  versions(
    ownerId: string,
    listingId: string,
    offset: number,
  ): Promise<PublishingResult<ManifestVersion[]>>;
  createVersion(
    ownerId: string,
    listingId: string,
    id: string,
    manifest: ProviderManifest,
  ): Promise<PublishingResult<ManifestVersion>>;
  submit(
    ownerId: string,
    listingId: string,
    versionId: string,
  ): Promise<PublishingResult<ManifestVersion>>;
  review(
    listingId: string,
    versionId: string,
    review: Review,
  ): Promise<PublishingResult<ManifestVersion>>;
  publish(
    ownerId: string,
    listingId: string,
    versionId: string,
  ): Promise<PublishingResult<AgentListing>>;
  pause(ownerId: string, listingId: string): Promise<PublishingResult<AgentListing>>;
  catalog(
    offset: number,
    listingId?: string,
  ): Promise<{ listing: AgentListing; version: ManifestVersion; provider: ProviderProfile }[]>;
}
