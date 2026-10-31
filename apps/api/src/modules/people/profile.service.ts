import { randomUUID } from "node:crypto";
import { getAddress } from "viem";
import type { Cradle } from "../../container";
import {
  BadRequestError,
  NotFoundError,
  PayloadTooLargeError,
  ServiceUnavailableError,
  UnsupportedMediaTypeError,
} from "../../errors";
import type { AccountIdentity } from "../auth/auth.service";
import { IMAGE_MAX_BYTES, IMAGE_TYPES } from "../provider/provider.validation";

export const NAME_MAX = 60;
export const BIO_MAX = 280;

export type ProfilePatch = { displayName?: string | null; bio?: string | null };

// The public face of an account, as the store, ratings and developer pages
// show it. `name` is the chosen display name, or the short wallet address.
export type Person = {
  id: string;
  name: string;
  address: string | null;
  imageUrl: string | null;
};

type ProfileRow = {
  userId: string;
  displayName: string | null;
  bio: string | null;
  imageKey: string | null;
};

const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

// Versioned by the storage key, so a new picture is a new URL.
const imageUrl = (userId: string, imageKey: string | null) =>
  imageKey ? `/v1/users/${userId}/image?v=${imageKey.slice(-12)}` : null;

// Trims, and turns an empty value into null; undefined leaves the field alone.
function optionalText(value: string | null | undefined, max: number, code: string) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const text = value.trim();
  if (text.length > max) throw new BadRequestError(code);
  return text || null;
}

export class ProfileService {
  private readonly db: Cradle["db"];
  private readonly storage: Cradle["storage"];

  constructor({ db, storage }: Cradle) {
    this.db = db;
    this.storage = storage;
  }

  private async addresses(userIds: string[]) {
    const rows = await this.db.walletAddress.findMany({
      where: { userId: { in: userIds }, chainId: 43113, isPrimary: true },
      select: { userId: true, address: true },
    });
    return new Map(rows.map((row) => [row.userId, getAddress(row.address)]));
  }

  private person(userId: string, profile: ProfileRow | undefined, address: string | undefined) {
    return {
      id: userId,
      name: profile?.displayName ?? (address ? shortAddress(address) : "Unknown"),
      address: address ?? null,
      imageUrl: imageUrl(userId, profile?.imageKey ?? null),
    } satisfies Person;
  }

  /** The public face of each account, keyed by user id. */
  async people(userIds: string[]): Promise<Map<string, Person>> {
    const ids = [...new Set(userIds)];
    if (!ids.length) return new Map();
    const [profiles, addresses] = await Promise.all([
      this.db.userProfile.findMany({ where: { userId: { in: ids } } }),
      this.addresses(ids),
    ]);
    const byId = new Map(profiles.map((row) => [row.userId, row]));
    return new Map(ids.map((id) => [id, this.person(id, byId.get(id), addresses.get(id))]));
  }

  // The signed-in account's editable profile.
  async me(account: AccountIdentity) {
    const profile = await this.db.userProfile.findUnique({ where: { userId: account.id } });
    const address = getAddress(account.walletAddress);
    return {
      ...this.person(account.id, profile ?? undefined, address),
      displayName: profile?.displayName ?? null,
      bio: profile?.bio ?? null,
    };
  }

  async update(account: AccountIdentity, patch: ProfilePatch) {
    const displayName = optionalText(patch.displayName, NAME_MAX, "INVALID_DISPLAY_NAME");
    const bio = optionalText(patch.bio, BIO_MAX, "INVALID_BIO");
    const data = {
      ...(displayName !== undefined ? { displayName } : {}),
      ...(bio !== undefined ? { bio } : {}),
    };
    await this.db.userProfile.upsert({
      where: { userId: account.id },
      create: { userId: account.id, ...data },
      update: data,
    });
    return this.me(account);
  }

  // Replaced whole; the old object is deleted after the row points at the new one.
  async setImage(account: AccountIdentity, contentType: string, bytes: Uint8Array) {
    if (!this.storage) throw new ServiceUnavailableError("FILES_DISABLED");
    if (!(IMAGE_TYPES as readonly string[]).includes(contentType) || !bytes.length)
      throw new UnsupportedMediaTypeError("INVALID_IMAGE_TYPE");
    if (bytes.length > IMAGE_MAX_BYTES) throw new PayloadTooLargeError("IMAGE_TOO_LARGE");
    const prior = await this.db.userProfile.findUnique({ where: { userId: account.id } });
    const imageKey = `user-images/${account.id}/${randomUUID()}`;
    await this.storage.put(imageKey, bytes, contentType);
    await this.db.userProfile.upsert({
      where: { userId: account.id },
      create: { userId: account.id, imageKey, imageType: contentType },
      update: { imageKey, imageType: contentType },
    });
    if (prior?.imageKey) await this.storage.delete(prior.imageKey).catch(() => undefined);
    return this.me(account);
  }

  async removeImage(account: AccountIdentity) {
    const prior = await this.db.userProfile.findUnique({ where: { userId: account.id } });
    if (prior?.imageKey) {
      await this.db.userProfile.update({
        where: { userId: account.id },
        data: { imageKey: null, imageType: null },
      });
      await this.storage?.delete(prior.imageKey).catch(() => undefined);
    }
    return this.me(account);
  }

  // Profile pictures are public, like the names next to them.
  async image(userId: string) {
    const profile = await this.db.userProfile.findUnique({ where: { userId } });
    if (!profile?.imageKey || !profile.imageType || !this.storage)
      throw new NotFoundError("IMAGE_NOT_FOUND");
    return this.storage.presignGet(
      profile.imageKey,
      { filename: "avatar", contentType: profile.imageType, inline: true },
      600,
    );
  }

  /** A developer's public page: who they are and the public agents they share. */
  async developer(userId: string) {
    const [user, profile] = await Promise.all([
      this.db.user.findUnique({ where: { id: userId }, select: { id: true, createdAt: true } }),
      this.db.userProfile.findUnique({ where: { userId } }),
    ]);
    if (!user) throw new NotFoundError("DEVELOPER_NOT_FOUND");
    const address = (await this.addresses([userId])).get(userId);
    return {
      ...this.person(userId, profile ?? undefined, address),
      bio: profile?.bio ?? null,
      joinedAt: user.createdAt,
    };
  }
}
