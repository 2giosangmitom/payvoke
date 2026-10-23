import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../../generated/prisma/client";

const productSelect = {
  id: true,
  name: true,
  description: true,
  kind: true,
  status: true,
  activeVersion: true,
  providerApp: { select: { id: true, name: true } },
} as const;
const normalizeName = (name: string) => name.trim().replace(/\s+/g, " ");
const validName = (name: unknown) =>
  typeof name === "string" && normalizeName(name).length >= 1 && normalizeName(name).length <= 100;

export async function registerCatalog(app: FastifyInstance, db: PrismaClient) {
  async function visible(productId: string) {
    const product = await db.product.findFirst({
      where: {
        id: productId,
        providerAppId: { not: null },
        status: "PUBLISHED",
        activeVersion: { not: null },
      },
      select: productSelect,
    });
    if (!product) throw app.httpErrors.notFound("PRODUCT_NOT_FOUND");
    return product;
  }
  app.get<{ Querystring: { q?: string; kind?: string; cursor?: string; limit?: string } }>(
    "/v1/products",
    async (request) => {
      const { q, kind, cursor } = request.query;
      const limit = Number(request.query.limit ?? 20);
      if (
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 50 ||
        (q && q.length > 100) ||
        (kind && !["AGENT", "TOOL"].includes(kind))
      )
        throw app.httpErrors.badRequest("INVALID_CATALOG_QUERY");
      const rows = await db.product.findMany({
        where: {
          providerAppId: { not: null },
          status: "PUBLISHED",
          activeVersion: { not: null },
          ...(kind ? { kind } : {}),
          ...(q ? { name: { contains: q.trim(), mode: "insensitive" as const } } : {}),
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        select: productSelect,
        orderBy: { id: "asc" },
        take: limit + 1,
      });
      return {
        items: rows.slice(0, limit).map((p) => ({ ...p, availability: "NOT_READY" })),
        nextCursor: rows.length > limit ? rows[limit - 1].id : null,
      };
    },
  );
  app.get<{ Params: { productId: string } }>("/v1/products/:productId", async (request) => ({
    ...(await visible(request.params.productId)),
    availability: "NOT_READY",
  }));
  app.get<{ Params: { productId: string } }>(
    "/v1/products/:productId/commands",
    async (request) => {
      const product = await visible(request.params.productId);
      const rows = await db.commandVersion.findMany({
        where: { productId: product.id, productVersion: product.activeVersion! },
        select: {
          commandId: true,
          name: true,
          title: true,
          description: true,
          inputSchema: true,
          outputSchema: true,
          grossAmount: true,
          terms: true,
          positionalParameter: true,
        },
        orderBy: { commandId: "asc" },
      });
      return {
        items: rows.map((row) => ({ ...row, grossAmount: row.grossAmount.toString() })),
        nextCursor: null,
      };
    },
  );
  app.get("/v1/stars", { preHandler: app.requireAccount }, async (request) => {
    const rows = await db.productStar.findMany({
      where: { userId: request.account!.id },
      include: { product: { select: productSelect } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return rows.map(({ product, createdAt }) => ({
      ...product,
      availability: product.status === "PUBLISHED" ? "NOT_READY" : "UNAVAILABLE",
      starredAt: createdAt,
    }));
  });
  app.put<{ Params: { productId: string } }>(
    "/v1/stars/:productId",
    { preHandler: app.requireAccount },
    async (request) => {
      await visible(request.params.productId);
      await db.productStar.upsert({
        where: {
          userId_productId: { userId: request.account!.id, productId: request.params.productId },
        },
        create: { userId: request.account!.id, productId: request.params.productId },
        update: {},
      });
      return { starred: true };
    },
  );
  app.delete<{ Params: { productId: string } }>(
    "/v1/stars/:productId",
    { preHandler: app.requireAccount },
    async (request) => {
      await db.productStar.deleteMany({
        where: { userId: request.account!.id, productId: request.params.productId },
      });
      return { starred: false };
    },
  );
  app.get("/v1/collections", { preHandler: app.requireAccount }, async (request) => {
    const rows = await db.collection.findMany({
      where: { ownerId: request.account!.id },
      include: {
        items: { include: { product: { select: productSelect } }, orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return rows.map(({ items, ...collection }) => ({
      ...collection,
      items: items.map(({ product }) => ({
        ...product,
        availability: product.status === "PUBLISHED" ? "NOT_READY" : "UNAVAILABLE",
      })),
    }));
  });
  app.post<{ Body: { name: string } }>(
    "/v1/collections",
    { preHandler: app.requireAccount, bodyLimit: 2048 },
    async (request, reply) => {
      if (!validName(request.body?.name))
        throw app.httpErrors.badRequest("INVALID_COLLECTION_NAME");
      const name = normalizeName(request.body.name);
      const nameKey = name.toLocaleLowerCase("en-US");
      const prior = await db.collection.findUnique({
        where: { ownerId_nameKey: { ownerId: request.account!.id, nameKey } },
      });
      if (prior) throw app.httpErrors.conflict("COLLECTION_NAME_TAKEN");
      return reply
        .code(201)
        .send(
          await db.collection.create({ data: { ownerId: request.account!.id, name, nameKey } }),
        );
    },
  );
  app.put<{ Params: { collectionId: string }; Body: { name: string } }>(
    "/v1/collections/:collectionId",
    { preHandler: app.requireAccount, bodyLimit: 2048 },
    async (request) => {
      if (!validName(request.body?.name))
        throw app.httpErrors.badRequest("INVALID_COLLECTION_NAME");
      const name = normalizeName(request.body.name);
      const changed = await db.collection.updateMany({
        where: { id: request.params.collectionId, ownerId: request.account!.id },
        data: { name, nameKey: name.toLocaleLowerCase("en-US") },
      });
      if (!changed.count) throw app.httpErrors.notFound("COLLECTION_NOT_FOUND");
      return { name };
    },
  );
  app.delete<{ Params: { collectionId: string } }>(
    "/v1/collections/:collectionId",
    { preHandler: app.requireAccount },
    async (request) => {
      const changed = await db.collection.deleteMany({
        where: { id: request.params.collectionId, ownerId: request.account!.id },
      });
      if (!changed.count) throw app.httpErrors.notFound("COLLECTION_NOT_FOUND");
      return { deleted: true };
    },
  );
  app.put<{ Params: { collectionId: string; productId: string } }>(
    "/v1/collections/:collectionId/products/:productId",
    { preHandler: app.requireAccount },
    async (request) => {
      const ownerId = request.account!.id;
      const collection = await db.collection.findFirst({
        where: { id: request.params.collectionId, ownerId },
      });
      if (!collection) throw app.httpErrors.notFound("COLLECTION_NOT_FOUND");
      const star = await db.productStar.findUnique({
        where: { userId_productId: { userId: ownerId, productId: request.params.productId } },
      });
      if (!star) throw app.httpErrors.conflict("STAR_REQUIRED");
      await db.collectionItem.upsert({
        where: {
          collectionId_productId: { collectionId: collection.id, productId: star.productId },
        },
        create: { collectionId: collection.id, ownerId, productId: star.productId },
        update: {},
      });
      return { added: true };
    },
  );
  app.delete<{ Params: { collectionId: string; productId: string } }>(
    "/v1/collections/:collectionId/products/:productId",
    { preHandler: app.requireAccount },
    async (request) => {
      const changed = await db.collectionItem.deleteMany({
        where: {
          collectionId: request.params.collectionId,
          ownerId: request.account!.id,
          productId: request.params.productId,
        },
      });
      return { removed: changed.count > 0 };
    },
  );
}
