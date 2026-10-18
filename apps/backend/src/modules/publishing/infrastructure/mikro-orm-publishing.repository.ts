import {
  IsolationLevel,
  LockMode,
  UniqueConstraintViolationException,
  type EntityManager,
} from "@mikro-orm/postgresql";
import { Result } from "better-result";
import type { PublishingRepository } from "../application/publishing.repository.js";
import {
  AgentListing,
  ManifestVersion,
  ProviderProfile,
  failure,
  manifestDigest,
  type ProviderManifest,
  type Review,
  type OwnedListing,
} from "../domain/publishing.js";
import { AppUser } from "../../identity/domain/app-user.js";
import { CommandRevision, ProviderApplication } from "../../provider-gateway/domain/provider.js";

const missing = () => failure("NOT_FOUND", "Provider, listing, or version not found.");
export class MikroOrmPublishingRepository implements PublishingRepository {
  constructor(private readonly em: EntityManager) {}
  async getProfile(ownerId: string) {
    const profile = await this.em.findOne(ProviderProfile, ownerId);
    return profile ? Result.ok(profile) : missing();
  }
  async profile(ownerId: string, displayName: string) {
    const profile = Object.assign(new ProviderProfile(), { id: ownerId, displayName });
    await this.em
      .createQueryBuilder(ProviderProfile)
      .insert(profile)
      .onConflict("id")
      .ignore()
      .execute();
    const existing = await this.em.findOneOrFail(ProviderProfile, ownerId);
    if (existing.displayName !== displayName)
      return failure("CONFLICT", "Provider profile already exists with another name.");
    return Result.ok(existing);
  }
  async createListing(ownerId: string, id: string) {
    if (!(await this.em.findOne(ProviderProfile, ownerId))) return missing();
    const listing = Object.assign(new AgentListing(), { id, providerId: ownerId });
    await this.em
      .createQueryBuilder(AgentListing)
      .insert(listing)
      .onConflict("id")
      .ignore()
      .execute();
    const existing = await this.em.findOne(AgentListing, { id, providerId: ownerId });
    return existing ? Result.ok(existing) : missing();
  }
  async owned(ownerId: string, offset: number, listingId?: string) {
    const rows = await this.em.execute<
      (Omit<OwnedListing, "createdAt"> & { createdAt: Date | string })[]
    >(
      `select l.id, l.provider_id as "providerId", l.published_version_id as "publishedVersionId", l.paused, l.created_at as "createdAt", v.name, v.id as "candidateVersionId", v.state as "candidateState"
      from agent_listings l left join lateral (select id, manifest->>'name' as name, state from manifest_versions where listing_id = l.id order by created_at desc, id asc limit 1) v on true
      where l.provider_id = ? ${listingId ? "and l.id = ?" : ""} order by l.created_at desc, l.id asc limit 50 offset ?`,
      listingId ? [ownerId, listingId, offset] : [ownerId, offset],
    );
    return rows.map((row) => ({ ...row, createdAt: new Date(row.createdAt) }));
  }
  async versions(ownerId: string, listingId: string, offset: number) {
    if (!(await this.em.findOne(AgentListing, { id: listingId, providerId: ownerId })))
      return missing();
    return Result.ok(
      await this.em.find(
        ManifestVersion,
        { listingId },
        { limit: 50, offset, orderBy: { createdAt: "desc", id: "asc" } },
      ),
    );
  }
  async createVersion(ownerId: string, listingId: string, id: string, manifest: ProviderManifest) {
    try {
      return await this.em.transactional(async (em) => {
        if (
          !(await em.findOne(
            AgentListing,
            { id: listingId, providerId: ownerId },
            { lockMode: LockMode.PESSIMISTIC_WRITE },
          ))
        )
          return missing();
        if (manifest.schemaVersion === 2) {
          const application = await em.findOne(ProviderApplication, {
            id: manifest.gateway.applicationId,
            providerId: ownerId,
          });
          if (
            !application ||
            !(await em.findOne(CommandRevision, {
              id: manifest.gateway.commandRevisionId,
              applicationId: application.id,
            }))
          )
            return missing();
        }
        const digest = manifestDigest(manifest);
        const existing = await em.findOne(ManifestVersion, id);
        if (existing) {
          if (existing.listingId !== listingId) return missing();
          if (existing.digest !== digest)
            return failure(
              "CONFLICT",
              "Version IDs bind immutable manifests; create a new version for changes.",
            );
          return Result.ok(existing);
        }
        const candidate = Object.assign(new ManifestVersion(), { id, listingId, manifest, digest });
        await em.persist(candidate).flush();
        return Result.ok(candidate);
      });
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException)
        return failure("CONFLICT", "Version ID is already in use.");
      throw error;
    }
  }
  async submit(ownerId: string, listingId: string, versionId: string) {
    return this.em.transactional(async (em) => {
      if (
        !(await em.findOne(
          AgentListing,
          { id: listingId, providerId: ownerId },
          { lockMode: LockMode.PESSIMISTIC_WRITE },
        ))
      )
        return missing();
      const version = await em.findOne(ManifestVersion, { id: versionId, listingId });
      if (!version) return missing();
      if (version.state === "submitted") return Result.ok(version);
      if (version.state !== "draft")
        return failure(
          "CONFLICT",
          "Only a draft can be submitted. Rejected versions require a new candidate.",
        );
      version.state = "submitted";
      await em.flush();
      return Result.ok(version);
    });
  }
  // Operator-only use case: intentionally absent from the bearer-authenticated HTTP surface.
  async review(listingId: string, versionId: string, review: Review) {
    return this.em.transactional(async (em) => {
      const listing = await em.findOne(AgentListing, listingId, {
        lockMode: LockMode.PESSIMISTIC_WRITE,
      });
      if (!listing || !(await em.findOne(AppUser, { id: listing.providerId, status: "active" })))
        return missing();
      const version = await em.findOne(ManifestVersion, { id: versionId, listingId });
      if (!version) return missing();
      if (version.digest !== review.digest)
        return failure("CONFLICT", "Candidate digest differs from the reviewed manifest.");
      if (
        version.state === review.decision &&
        version.reviewedBy === review.reviewer &&
        version.reviewNote === review.note
      )
        return Result.ok(version);
      if (version.state !== "submitted")
        return failure("CONFLICT", "Review requires a submitted, unreviewed candidate.");
      version.state = review.decision;
      version.reviewedBy = review.reviewer;
      version.reviewNote = review.note;
      version.reviewedAt = new Date();
      await em.flush();
      return Result.ok(version);
    });
  }
  async publish(ownerId: string, listingId: string, versionId: string) {
    return this.em.transactional(async (em) => {
      const listing = await em.findOne(
        AgentListing,
        { id: listingId, providerId: ownerId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!listing) return missing();
      const version = await em.findOne(ManifestVersion, { id: versionId, listingId });
      if (!version) return missing();
      if (version.state !== "approved")
        return failure("CONFLICT", "Only an operator-reviewed candidate may be published.");
      listing.publishedVersionId = version.id;
      listing.paused = false;
      await em.flush();
      return Result.ok(listing);
    });
  }
  async pause(ownerId: string, listingId: string) {
    return this.em.transactional(async (em) => {
      const listing = await em.findOne(
        AgentListing,
        { id: listingId, providerId: ownerId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!listing) return missing();
      listing.paused = true;
      await em.flush();
      return Result.ok(listing);
    });
  }
  async catalog(offset: number, listingId?: string) {
    return this.em.transactional(
      async (em) => {
        // One SQL snapshot: no public exposure of drafts, internal endpoints, reviewer notes or owner IDs.
        const rows = await em.execute<
          { listing_id: string; version_id: string; provider_id: string }[]
        >(
          `select l.id as listing_id, v.id as version_id, p.id as provider_id
       from agent_listings l join manifest_versions v on v.id = l.published_version_id and v.listing_id = l.id
       join provider_profiles p on p.id = l.provider_id join app_users u on u.id = p.id
        where not l.paused and v.state = 'approved' and u.status = 'active'
       ${listingId ? "and l.id = ?" : ""}
        order by l.created_at desc, l.id asc limit 50 offset ?`,
          listingId ? [listingId, offset] : [offset],
        );
        const listings = new Map(
          (await em.find(AgentListing, { id: { $in: rows.map((row) => row.listing_id) } })).map(
            (listing) => [listing.id, listing],
          ),
        );
        const versions = new Map(
          (await em.find(ManifestVersion, { id: { $in: rows.map((row) => row.version_id) } })).map(
            (version) => [version.id, version],
          ),
        );
        const providers = new Map(
          (await em.find(ProviderProfile, { id: { $in: rows.map((row) => row.provider_id) } })).map(
            (provider) => [provider.id, provider],
          ),
        );
        const revisions = await em.find(CommandRevision, {
          id: {
            $in: [...versions.values()].flatMap((version) =>
              version.manifest.schemaVersion === 2
                ? [version.manifest.gateway.commandRevisionId]
                : [],
            ),
          },
        });
        return rows.map((row) => ({
          listing: listings.get(row.listing_id)!,
          version: versions.get(row.version_id)!,
          provider: providers.get(row.provider_id)!,
          commands: revisions.find((revision) => {
            const manifest = versions.get(row.version_id)!.manifest;
            return (
              manifest.schemaVersion === 2 && revision.id === manifest.gateway.commandRevisionId
            );
          })?.commands,
        }));
      },
      { isolationLevel: IsolationLevel.REPEATABLE_READ },
    );
  }
}
