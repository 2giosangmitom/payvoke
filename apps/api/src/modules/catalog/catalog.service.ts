import type { Cradle } from "@fastify/awilix";
import { NotFoundError } from "../../errors";
import { availabilityLabel, isAvailable } from "../apps/schema";
import { fromPrice, priceRange, serializeCommand } from "../apps/serializers";

export type CatalogQuery = { q?: string; cursor?: string; limit: number; savedBy?: string };

const activeCommands = {
  where: { archivedAt: null, activeRevisionId: { not: null } },
  include: { activeRevision: true },
} as const;

export class CatalogService {
  private readonly db: Cradle["db"];

  constructor({ db }: Cradle) {
    this.db = db;
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

  async list({ q, cursor, limit, savedBy }: CatalogQuery) {
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
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      include: { commands: activeCommands },
      orderBy: { id: "asc" },
      take: limit + 1,
    });
    return {
      items: rows.slice(0, limit).map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        kind: row.kind,
        visibility: row.visibility,
        status: row.status,
        availability: availabilityLabel(row),
        commandCount: row.commands.length,
        fromPrice: fromPrice(row.commands),
        priceRange: priceRange(row.commands),
        updatedAt: row.updatedAt,
      })),
      nextCursor: rows.length > limit ? rows[limit - 1].id : null,
    };
  }

  async get(appId: string, viewerId: string | null) {
    const row = await this.visible(appId, viewerId);
    return {
      id: row.id,
      ownerId: row.ownerId,
      name: row.name,
      description: row.description,
      kind: row.kind,
      visibility: row.visibility,
      status: row.status,
      availability: availabilityLabel(row),
      priceRange: priceRange(row.commands),
      canChat: isAvailable(row),
      defaultCommandId: row.defaultCommandId,
      commands: row.commands.map(serializeCommand),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
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
      kind: app.kind,
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
