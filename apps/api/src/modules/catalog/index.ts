import type { FastifyInstance, FastifyRequest } from "fastify";
import type { PrismaClient } from "@payvoke/db";
import { availabilityLabel, isAvailable } from "../apps/schema";

const commandInclude = { activeRevision: true } as const;

function serializeCommand(command: {
  id: string;
  name: string;
  description: string;
  activeRevision: {
    id: string;
    options: unknown;
    inputSchema: unknown;
    outputSchema: unknown;
    positionalParameter: string | null;
    grossAmount: { toFixed(digits: number): string };
    terms: unknown;
    deliverySeconds: number;
    reviewSeconds: number;
    createdAt: Date;
  } | null;
}) {
  return {
    id: command.id,
    name: command.name,
    description: command.description,
    revision: command.activeRevision
      ? {
          ...command.activeRevision,
          grossAmount: command.activeRevision.grossAmount.toFixed(0),
        }
      : null,
  };
}

export async function registerCatalog(app: FastifyInstance, db: PrismaClient) {
  async function viewer(request: FastifyRequest) {
    return app.optionalAccount(request);
  }

  async function visible(appId: string, buyerId: string | null) {
    const row = await db.app.findFirst({
      where: {
        id: appId,
        archivedAt: null,
        OR: [{ visibility: "PUBLIC" }, ...(buyerId ? [{ ownerId: buyerId }] : [])],
      },
      include: {
        commands: {
          where: { archivedAt: null, activeRevisionId: { not: null } },
          include: commandInclude,
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!row) throw app.httpErrors.notFound("APP_NOT_FOUND");
    return row;
  }

  app.get<{ Querystring: { q?: string; cursor?: string; limit?: string; saved?: string } }>(
    "/v1/apps",
    async (request) => {
      const { q, cursor } = request.query;
      const limit = Number(request.query.limit ?? 20);
      const account = await viewer(request);
      if (
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 50 ||
        (q && q.length > 100) ||
        (cursor && cursor.length > 128)
      )
        throw app.httpErrors.badRequest("INVALID_CATALOG_QUERY");
      const savedOnly = request.query.saved === "1" && Boolean(account);
      const rows = await db.app.findMany({
        where: {
          visibility: "PUBLIC",
          // Suspended apps remain discoverable so saved entries can show their
          // unavailable state; archived apps are removed from the store.
          status: { in: ["ACTIVE", "SUSPENDED"] },
          archivedAt: null,
          ...(q
            ? {
                OR: [
                  { name: { contains: q.trim(), mode: "insensitive" as const } },
                  { description: { contains: q.trim(), mode: "insensitive" as const } },
                  {
                    commands: {
                      some: {
                        archivedAt: null,
                        activeRevisionId: { not: null },
                        name: { contains: q.trim(), mode: "insensitive" as const },
                      },
                    },
                  },
                ],
              }
            : {}),
          ...(savedOnly ? { stars: { some: { userId: account!.id } } } : {}),
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        include: {
          commands: {
            where: { archivedAt: null, activeRevisionId: { not: null } },
            include: commandInclude,
          },
        },
        orderBy: { id: "asc" },
        take: limit + 1,
      });
      return {
        items: rows.slice(0, limit).map((row) => {
          const prices = row.commands
            .map((command) => command.activeRevision?.grossAmount)
            .filter((price): price is NonNullable<typeof price> => Boolean(price));
          return {
            id: row.id,
            name: row.name,
            description: row.description,
            visibility: row.visibility,
            status: row.status,
            availability: availabilityLabel(row),
            commandCount: row.commands.length,
            fromPrice:
              prices.length > 0
                ? prices
                    .map((price) => BigInt(price.toFixed(0)))
                    .reduce((min, price) => (price < min ? price : min))
                    .toString()
                : null,
            updatedAt: row.updatedAt,
          };
        }),
        nextCursor: rows.length > limit ? rows[limit - 1].id : null,
      };
    },
  );

  app.get<{ Params: { appId: string } }>("/v1/apps/:appId", async (request) => {
    const account = await viewer(request);
    const row = await visible(request.params.appId, account?.id ?? null);
    const canChat = isAvailable(row);
    return {
      id: row.id,
      ownerId: row.ownerId,
      name: row.name,
      description: row.description,
      visibility: row.visibility,
      status: row.status,
      availability: availabilityLabel(row),
      canChat,
      defaultCommandId: row.defaultCommandId,
      commands: row.commands.map(serializeCommand),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  });

  app.get<{ Params: { appId: string } }>("/v1/apps/:appId/commands", async (request) => {
    const account = await viewer(request);
    const row = await visible(request.params.appId, account?.id ?? null);
    return {
      items: row.commands.map(serializeCommand),
      nextCursor: null,
    };
  });

  app.get("/v1/stars", { preHandler: app.requireAccount }, async (request) => {
    const rows = await db.appStar.findMany({
      where: { userId: request.account!.id },
      include: {
        app: {
          include: {
            commands: {
              where: { archivedAt: null, activeRevisionId: { not: null } },
              include: commandInclude,
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return rows.map(({ app: row, createdAt }) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      visibility: row.visibility,
      status: row.status,
      availability: availabilityLabel(row),
      commandCount: row.commands.length,
      starredAt: createdAt,
    }));
  });

  app.put<{ Params: { appId: string } }>(
    "/v1/apps/:appId/star",
    { preHandler: app.requireAccount },
    async (request) => {
      const account = await viewer(request);
      await visible(request.params.appId, account?.id ?? null);
      await db.appStar.upsert({
        where: {
          userId_appId: { userId: request.account!.id, appId: request.params.appId },
        },
        create: { userId: request.account!.id, appId: request.params.appId },
        update: {},
      });
      return { starred: true };
    },
  );

  app.delete<{ Params: { appId: string } }>(
    "/v1/apps/:appId/star",
    { preHandler: app.requireAccount },
    async (request) => {
      await db.appStar.deleteMany({
        where: { userId: request.account!.id, appId: request.params.appId },
      });
      return { starred: false };
    },
  );

  // Backwards-compatible star paths used by older clients.
  app.put<{ Params: { appId: string } }>(
    "/v1/stars/:appId",
    { preHandler: app.requireAccount },
    async (request) => {
      const account = await viewer(request);
      await visible(request.params.appId, account?.id ?? null);
      await db.appStar.upsert({
        where: {
          userId_appId: { userId: request.account!.id, appId: request.params.appId },
        },
        create: { userId: request.account!.id, appId: request.params.appId },
        update: {},
      });
      return { starred: true };
    },
  );
  app.delete<{ Params: { appId: string } }>(
    "/v1/stars/:appId",
    { preHandler: app.requireAccount },
    async (request) => {
      await db.appStar.deleteMany({
        where: { userId: request.account!.id, appId: request.params.appId },
      });
      return { starred: false };
    },
  );
}
