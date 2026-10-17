import { validateManifest, type ProviderManifest } from "../domain/publishing.js";
import type { PublishingRepository } from "./publishing.repository.js";

export class PublishingService {
  constructor(private readonly publishing: PublishingRepository) {}
  getProfile(ownerId: string) {
    return this.publishing.getProfile(ownerId);
  }
  profile(ownerId: string, name: string) {
    return this.publishing.profile(ownerId, name.trim());
  }
  createListing(ownerId: string, id: string) {
    return this.publishing.createListing(ownerId, id);
  }
  owned(ownerId: string, offset = 0) {
    return this.publishing.owned(ownerId, offset);
  }
  async listing(ownerId: string, id: string) {
    return (await this.publishing.owned(ownerId, 0, id))[0];
  }
  versions(ownerId: string, listingId: string, offset = 0) {
    return this.publishing.versions(ownerId, listingId, offset);
  }
  async createVersion(ownerId: string, listingId: string, id: string, manifest: ProviderManifest) {
    const result = validateManifest(manifest);
    if (result.isErr()) return result;
    return this.publishing.createVersion(ownerId, listingId, id, manifest);
  }
  submit(ownerId: string, listingId: string, versionId: string) {
    return this.publishing.submit(ownerId, listingId, versionId);
  }
  publish(ownerId: string, listingId: string, versionId: string) {
    return this.publishing.publish(ownerId, listingId, versionId);
  }
  pause(ownerId: string, listingId: string) {
    return this.publishing.pause(ownerId, listingId);
  }
  catalog(offset = 0) {
    return this.publishing.catalog(offset);
  }
  async agent(id: string) {
    return (await this.publishing.catalog(0, id))[0];
  }
}
