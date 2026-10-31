import type { Cradle } from "../../container";
import { NotFoundError } from "../../errors";
import { availabilityLabel, isAvailable } from "../apps/schema";
import { imageUrl, priceCap, serializeCommand } from "../apps/serializers";

export type CatalogQuery = {
  q?: string;
  cursor?: string;
  limit: number;
  savedBy?: string;
  // Only this developer's agents.
  ownerId?: string;
};

const activeCommands = {
  where: { archivedAt: null, activeRevisionId: { not: null } },
  include: { activeRevision: true },
} as const;

export class CatalogService {
  private readonly db: Cradle["db"];
  private readonly storage: Cradle["storage"];
  private readonly statsService: Cradle["statsService"];
  private readonly profileService: Cradle["profileService"];

  constructor({ db, storage, statsService, profileService }: Cradle) {
    this.db = db;
    this.storage = storage;
    this.statsService = statsService;
    this.profileService = profileService;
  }

  // Who shares each agent and how much it is used, for store cards.
  private async extras(rows: { id: string; ownerId: string }[]) {
    const [usage, people] = await Promise.all([
      this.statsService.usage(rows.map((row) => row.id)),
      this.profileService.people(rows.map((row) => row.ownerId)),
    ]);
    return (row: { id: string; ownerId: string }) => ({
      owner: people.get(row.ownerId)!,
      ...usage.get(row.id)!,
    });
  }

  // Public apps, plus the viewer's own private apps. Archived apps never show.
  private async visible(appId: string, viewerId: string | null) {
    const row = await this.db.app.findFirst({
      where: {
        id: appId,
        archivedAt: null,
        OR: [{ visibility: "PUBLIC" }, ...(viewerId ? [{ ownerId: viewerId }] : [])],
      },
      include: { commands: { ...activeCommands, orderBy: { createdAt: "asc" } } },
    });
    if (!row) throw new NotFoundError("APP_NOT_FOUND");
    return row;
  }

  async list({ q, cursor, limit, savedBy, ownerId }: CatalogQuery) {
    const search = q?.trim();
    const rows = await this.db.app.findMany({
      where: {
        visibility: "PUBLIC",
        // Suspended apps remain discoverable so saved entries can show their
        // unavailable state; archived apps are removed from the store.
        status: { in: ["ACTIVE", "SUSPENDED"] },
        archivedAt: null,
        ...(q
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" as const } },
                { description: { contains: search, mode: "insensitive" as const } },
                {
                  commands: {
                    some: {
                      archivedAt: null,
                      activeRevisionId: { not: null },
                      name: { contains: search, mode: "insensitive" as const },
                    },
                  },
                },
              ],
            }
          : {}),
        ...(savedBy ? { stars: { some: { userId: savedBy } } } : {}),
        ...(ownerId ? { ownerId } : {}),
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      include: { commands: activeCommands },
      orderBy: { id: "asc" },
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const extras = await this.extras(page);
    return {
      items: page.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        imageUrl: imageUrl(row),
        visibility: row.visibility,
        status: row.status,
        availability: availabilityLabel(row),
        commandCount: row.commands.length,
        priceCap: priceCap(row.commands),
        ...extras(row),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      nextCursor: rows.length > limit ? rows[limit - 1].id : null,
    };
  }

  async get(appId: string, viewerId: string | null) {
    const row = await this.visible(appId, viewerId);
    const extras = await this.extras([row]);
    return {
      id: row.id,
      ownerId: row.ownerId,
      ...extras(row),
      name: row.name,
      description: row.description,
      imageUrl: imageUrl(row),
      visibility: row.visibility,
      status: row.status,
      availability: availabilityLabel(row),
      priceCap: priceCap(row.commands),
      canChat: isAvailable(row),
      defaultCommandId: row.defaultCommandId,
      commands: row.commands.map(serializeCommand),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async image(appId: string, viewerId: string | null) {
    const row = await this.visible(appId, viewerId);
    if (!row.imageKey || !row.imageType || !this.storage)
      throw new NotFoundError("IMAGE_NOT_FOUND");
    return this.storage.presignGet(
      row.imageKey,
      { filename: "agent", contentType: row.imageType, inline: true },
      600,
    );
  }

  async commands(appId: string, viewerId: string | null) {
    const row = await this.visible(appId, viewerId);
    return { items: row.commands.map(serializeCommand), nextCursor: null };
  }

  async stars(userId: string) {
    const rows = await this.db.appStar.findMany({
      where: { userId },
      include: { app: { include: { commands: activeCommands } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return rows.map(({ app, createdAt }) => ({
      id: app.id,
      name: app.name,
      description: app.description,
      imageUrl: imageUrl(app),
      visibility: app.visibility,
      status: app.status,
      availability: availabilityLabel(app),
      commandCount: app.commands.length,
      starredAt: createdAt,
    }));
  }

  async star(userId: string, appId: string) {
    await this.visible(appId, userId);
    await this.db.appStar.upsert({
      where: { userId_appId: { userId, appId } },
      create: { userId, appId },
      update: {},
    });
    return { starred: true };
  }

  async unstar(userId: string, appId: string) {
    await this.db.appStar.deleteMany({ where: { userId, appId } });
    return { starred: false };
  }
}
