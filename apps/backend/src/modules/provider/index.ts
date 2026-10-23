import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import Ajv2020 from "ajv/dist/2020.js";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { getAddress, isAddress } from "viem";
import type { PrismaClient, Prisma } from "../../generated/prisma/client";

const keyScopes = ["products:write", "events:read", "events:ack", "reports:write", "files:write"];
const text = (value: unknown, max: number) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;
const positiveVersion = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const selectApp = {
  id: true,
  name: true,
  payoutAddress: true,
  status: true,
  createdAt: true,
} as const;

function checkSchema(value: unknown, depth = 0): boolean {
  if (!record(value) || depth > 6 || JSON.stringify(value).length > 12000) return false;
  const allowed = new Set([
    "$schema",
    "type",
    "additionalProperties",
    "properties",
    "required",
    "items",
    "enum",
    "default",
    "minimum",
    "maximum",
    "minLength",
    "maxLength",
    "minItems",
    "maxItems",
    "description",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return false;
  if (value.$schema && value.$schema !== "https://json-schema.org/draft/2020-12/schema")
    return false;
  if (!["object", "array", "string", "integer", "number", "boolean"].includes(value.type as string))
    return false;
  if (value.type === "object") {
    if (
      value.additionalProperties !== false ||
      !record(value.properties) ||
      Object.keys(value.properties).length > 32
    )
      return false;
    if (
      !Array.isArray(value.required) ||
      value.required.some(
        (key) => typeof key !== "string" || !(key in (value.properties as object)),
      )
    )
      return false;
    return Object.values(value.properties).every((child) => checkSchema(child, depth + 1));
  }
  if (value.type === "array") {
    return (
      typeof value.maxItems === "number" &&
      Number.isInteger(value.maxItems) &&
      value.maxItems >= 0 &&
      value.maxItems <= 100 &&
      checkSchema(value.items, depth + 1)
    );
  }
  if (value.enum && (!Array.isArray(value.enum) || value.enum.length > 50)) return false;
  for (const key of ["minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems"]) {
    if (
      value[key] !== undefined &&
      (typeof value[key] !== "number" ||
        !Number.isSafeInteger(value[key]) ||
        (key !== "minimum" && key !== "maximum" && value[key] < 0))
    )
      return false;
  }
  return true;
}

export async function registerProvider(app: FastifyInstance, db: PrismaClient) {
  async function owner(request: FastifyRequest, appId: string) {
    await app.requireAccount(request);
    const provider = await db.providerApp.findFirst({
      where: { id: appId, ownerId: request.account!.id, status: "ACTIVE" },
    });
    if (!provider) throw app.httpErrors.notFound("APP_NOT_FOUND");
    return provider;
  }
  async function writer(request: FastifyRequest, appId: string) {
    const bearer = request.headers.authorization;
    if (!bearer) {
      const provider = await owner(request, appId);
      if (request.method === "GET" || request.method === "HEAD") return provider;
      const key = await db.providerApiKey.findFirst({
        where: {
          appId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          scopes: { has: "products:write" },
        },
      });
      if (!key) throw app.httpErrors.forbidden("PROVIDER_KEY_REQUIRED");
      return provider;
    }
    const match = /^Bearer (pvk_[a-f0-9]{16}\.[a-f0-9]{64})$/.exec(bearer);
    if (!match) throw app.httpErrors.unauthorized("INVALID_PROVIDER_KEY");
    const secret = match[1];
    const prefix = secret.slice(4, 20);
    const key = await db.providerApiKey.findUnique({ where: { prefix }, include: { app: true } });
    const computed = Buffer.from(digest(secret), "hex");
    const stored = Buffer.from(key?.secretHash ?? "0".repeat(64), "hex");
    if (
      !timingSafeEqual(computed, stored) ||
      !key ||
      key.appId !== appId ||
      key.revokedAt ||
      key.expiresAt <= new Date() ||
      key.app.status !== "ACTIVE"
    )
      throw app.httpErrors.unauthorized("INVALID_PROVIDER_KEY");
    if (!key.scopes.includes("products:write"))
      throw app.httpErrors.forbidden("INSUFFICIENT_SCOPE");
    return key.app;
  }
  async function ownedProduct(request: FastifyRequest, appId: string, productId: string) {
    const provider = await writer(request, appId);
    const product = await db.product.findFirst({
      where: { id: productId, providerAppId: provider.id },
    });
    if (!product) throw app.httpErrors.notFound("PRODUCT_NOT_FOUND");
    return { provider, product };
  }
  const appPath = "/v1/provider/apps/:appId";
  const productPath = `${appPath}/products/:productId`;

  app.post<{ Body: { name: string; payoutAddress: string; clientRequestId: string } }>(
    "/v1/provider/apps",
    {
      preHandler: app.requireAccount,
      bodyLimit: 4096,
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const { name, payoutAddress, clientRequestId } = request.body ?? {};
      if (!text(name, 120) || !isAddress(payoutAddress) || !text(clientRequestId, 128))
        throw app.httpErrors.badRequest("INVALID_APP");
      const normalized = { name: name.trim(), payoutAddress: getAddress(payoutAddress) };
      const where = { ownerId_clientRequestId: { ownerId: request.account!.id, clientRequestId } };
      const prior = await db.providerApp.findUnique({ where, select: selectApp });
      if (
        prior &&
        (prior.name !== normalized.name || prior.payoutAddress !== normalized.payoutAddress)
      )
        throw app.httpErrors.conflict("IDEMPOTENCY_CONFLICT");
      if (prior) return reply.code(200).send(prior);
      const created = await db.providerApp.upsert({
        where,
        create: { ownerId: request.account!.id, clientRequestId, ...normalized },
        update: {},
        select: selectApp,
      });
      if (created.name !== normalized.name || created.payoutAddress !== normalized.payoutAddress)
        throw app.httpErrors.conflict("IDEMPOTENCY_CONFLICT");
      return reply.code(201).send(created);
    },
  );
  app.get("/v1/provider/apps", { preHandler: app.requireAccount }, async (request) =>
    db.providerApp.findMany({
      where: { ownerId: request.account!.id },
      select: selectApp,
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  );
  app.put<{ Params: { appId: string }; Body: { payoutAddress: string } }>(
    `${appPath}/payout`,
    { bodyLimit: 2048 },
    async (request) => {
      await owner(request, request.params.appId);
      if (!isAddress(request.body?.payoutAddress))
        throw app.httpErrors.badRequest("INVALID_PAYOUT");
      const updated = await db.providerApp.update({
        where: { id: request.params.appId },
        data: { payoutAddress: getAddress(request.body.payoutAddress) },
        select: selectApp,
      });
      return updated;
    },
  );
  app.get<{ Params: { appId: string } }>(`${appPath}/keys`, async (request) => {
    await owner(request, request.params.appId);
    return db.providerApiKey.findMany({
      where: { appId: request.params.appId },
      select: {
        id: true,
        prefix: true,
        scopes: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
  });
  app.post<{ Params: { appId: string }; Body: { scopes: string[]; expiresAt: string } }>(
    `${appPath}/keys`,
    { bodyLimit: 4096, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      await owner(request, request.params.appId);
      const { scopes, expiresAt } = request.body ?? {};
      const expiry = new Date(expiresAt);
      if (
        !Array.isArray(scopes) ||
        !scopes.length ||
        scopes.some((scope) => !keyScopes.includes(scope)) ||
        new Set(scopes).size !== scopes.length ||
        !Number.isFinite(expiry.getTime()) ||
        expiry <= new Date() ||
        expiry.getTime() > Date.now() + 365 * 86400000
      )
        throw app.httpErrors.badRequest("INVALID_KEY_REQUEST");
      const prefix = randomBytes(8).toString("hex");
      const secret = `pvk_${prefix}.${randomBytes(32).toString("hex")}`;
      const created = await db.$transaction(async (tx) => {
        await tx.providerApiKey.updateMany({
          where: { appId: request.params.appId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        return tx.providerApiKey.create({
          data: {
            appId: request.params.appId,
            prefix,
            secretHash: digest(secret),
            scopes,
            expiresAt: expiry,
          },
          select: { id: true, scopes: true, expiresAt: true },
        });
      });
      return reply
        .code(201)
        .header("Cache-Control", "no-store")
        .send({ ...created, secret });
    },
  );
  app.post<{ Params: { appId: string; keyId: string } }>(
    `${appPath}/keys/:keyId/revocations`,
    async (request) => {
      await owner(request, request.params.appId);
      const result = await db.providerApiKey.updateMany({
        where: { id: request.params.keyId, appId: request.params.appId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (!result.count) throw app.httpErrors.notFound("KEY_NOT_FOUND");
      return { revoked: true };
    },
  );

  app.post<{
    Params: { appId: string };
    Body: { kind: string; name: string; description: string };
  }>(
    `${appPath}/products`,
    { bodyLimit: 8192, config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const provider = await writer(request, request.params.appId);
      const { kind, name, description } = request.body ?? {};
      if (!["AGENT", "TOOL"].includes(kind) || !text(name, 160) || !text(description, 2000))
        throw app.httpErrors.badRequest("INVALID_PRODUCT");
      const product = await db.product.create({
        data: {
          providerAppId: provider.id,
          kind,
          name: name.trim(),
          description: description.trim(),
          versions: { create: { number: 1, payoutAddress: provider.payoutAddress } },
        },
      });
      return reply
        .code(201)
        .send({ productId: product.id, draftVersion: 1, status: product.status });
    },
  );
  app.get<{ Params: { appId: string } }>(`${appPath}/products`, async (request) => {
    const provider = await writer(request, request.params.appId);
    return db.product.findMany({
      where: { providerAppId: provider.id },
      select: {
        id: true,
        name: true,
        description: true,
        kind: true,
        status: true,
        activeVersion: true,
        versions: {
          select: {
            number: true,
            status: true,
            revision: true,
            defaultCommandId: true,
            chatTextParameter: true,
            commands: {
              select: {
                commandId: true,
                name: true,
                title: true,
                description: true,
                inputSchema: true,
                outputSchema: true,
                positionalParameter: true,
                grossAmount: true,
                terms: true,
              },
            },
          },
          orderBy: { number: "desc" },
        },
      },
      take: 100,
    });
  });
  app.post<{ Params: { appId: string; productId: string }; Body: { baseVersion: number } }>(
    `${productPath}/versions`,
    async (request, reply) => {
      const { product, provider } = await ownedProduct(
        request,
        request.params.appId,
        request.params.productId,
      );
      if (!positiveVersion(request.body?.baseVersion))
        throw app.httpErrors.badRequest("INVALID_VERSION");
      const base = await db.productVersion.findUnique({
        where: { productId_number: { productId: product.id, number: request.body?.baseVersion } },
        include: { commands: true },
      });
      if (!base) throw app.httpErrors.notFound("VERSION_NOT_FOUND");
      const latest = await db.productVersion.aggregate({
        where: { productId: product.id },
        _max: { number: true },
      });
      const number = (latest._max.number ?? 0) + 1;
      await db.$transaction(async (tx) => {
        await tx.productVersion.create({
          data: {
            productId: product.id,
            number,
            payoutAddress: provider.payoutAddress,
            defaultCommandId: base.defaultCommandId,
            chatTextParameter: base.chatTextParameter,
          },
        });
        for (const command of base.commands)
          await tx.commandVersion.create({
            data: {
              productId: product.id,
              productVersion: number,
              commandId: command.commandId,
              name: command.name,
              title: command.title,
              description: command.description,
              inputSchema: command.inputSchema as Prisma.InputJsonValue,
              outputSchema: command.outputSchema as Prisma.InputJsonValue,
              positionalParameter: command.positionalParameter,
              grossAmount: command.grossAmount,
              terms: command.terms as Prisma.InputJsonValue,
              deliverySeconds: command.deliverySeconds,
              reviewSeconds: command.reviewSeconds,
            },
          });
      });
      return reply.code(201).send({ draftVersion: number });
    },
  );

  type CommandBody = {
    draftVersion: number;
    name: string;
    title: string;
    description: string;
    inputSchema: unknown;
    outputSchema: unknown;
    positionalParameter?: string;
    grossAmount: string;
    terms: Record<string, unknown>;
    expectedRevision?: number;
  };
  async function saveCommand(
    request: FastifyRequest,
    params: { appId: string; productId: string; commandId?: string },
    body: CommandBody,
  ) {
    const { product } = await ownedProduct(request, params.appId, params.productId);
    if (!positiveVersion(body?.draftVersion)) throw app.httpErrors.badRequest("INVALID_VERSION");
    const version = await db.productVersion.findUnique({
      where: { productId_number: { productId: product.id, number: body?.draftVersion } },
    });
    if (!version || version.status !== "DRAFT") throw app.httpErrors.conflict("DRAFT_REQUIRED");
    if (params.commandId && version.revision !== body.expectedRevision)
      throw app.httpErrors.conflict("REVISION_CONFLICT");
    if (
      !text(body.name, 32) ||
      !/^[a-z][a-z0-9_-]{0,31}$/.test(body.name) ||
      ["help", "cancel", "status"].includes(body.name) ||
      !text(body.title, 160) ||
      !text(body.description, 2000) ||
      !checkSchema(body.inputSchema) ||
      !checkSchema(body.outputSchema) ||
      (body.inputSchema as Record<string, unknown>).type !== "object" ||
      (body.outputSchema as Record<string, unknown>).type !== "object"
    )
      throw app.httpErrors.badRequest("INVALID_COMMAND");
    if (
      body.positionalParameter &&
      (!record((body.inputSchema as Record<string, unknown>).properties) ||
        !record(
          ((body.inputSchema as Record<string, unknown>).properties as Record<string, unknown>)[
            body.positionalParameter
          ],
        ) ||
        (
          (body.inputSchema as Record<string, unknown>).properties as Record<
            string,
            Record<string, unknown>
          >
        )[body.positionalParameter].type !== "string")
    )
      throw app.httpErrors.badRequest("INVALID_POSITIONAL_PARAMETER");
    try {
      new Ajv2020({ strict: true }).compile(body.inputSchema as object);
      new Ajv2020({ strict: true }).compile(body.outputSchema as object);
    } catch {
      throw app.httpErrors.badRequest("INVALID_COMMAND_SCHEMA");
    }
    if (
      !/^[1-9]\d*$/.test(body.grossAmount) ||
      BigInt(body.grossAmount) > (1n << 256n) - 1n ||
      !record(body.terms) ||
      !Number.isSafeInteger(body.terms.deliverySeconds) ||
      !Number.isSafeInteger(body.terms.reviewSeconds) ||
      (body.terms.deliverySeconds as number) <= 0 ||
      (body.terms.reviewSeconds as number) < 0 ||
      !record(body.terms.revisionPolicy) ||
      !Number.isSafeInteger((body.terms.revisionPolicy as Record<string, unknown>).maxIncluded) ||
      ((body.terms.revisionPolicy as Record<string, unknown>).maxIncluded as number) < 0 ||
      !text((body.terms.revisionPolicy as Record<string, unknown>).description, 1000) ||
      !text(body.terms.refundPolicy, 2000) ||
      !text(body.terms.sideEffects, 2000) ||
      !text(body.terms.dataUse, 2000)
    )
      throw app.httpErrors.badRequest("INVALID_TERMS");
    const policy = await db.deploymentPolicy.findUnique({ where: { activeSlot: "active" } });
    if (
      !policy ||
      (body.terms.deliverySeconds as number) +
        (body.terms.reviewSeconds as number) +
        policy.resolutionGraceSeconds +
        policy.quoteLifetimeSeconds >
        policy.maxHoldSeconds
    )
      throw app.httpErrors.badRequest("TERMS_EXCEED_POLICY");
    const duplicate = await db.commandVersion.findFirst({
      where: {
        productId: product.id,
        productVersion: version.number,
        name: body.name,
        NOT: params.commandId ? { commandId: params.commandId } : undefined,
      },
    });
    if (duplicate) throw app.httpErrors.conflict("COMMAND_NAME_TAKEN");
    return db.$transaction(async (tx) => {
      const bumped = await tx.productVersion.updateMany({
        where: {
          productId: product.id,
          number: version.number,
          revision: version.revision,
          status: "DRAFT",
        },
        data: { revision: { increment: 1 } },
      });
      if (!bumped.count) throw app.httpErrors.conflict("REVISION_CONFLICT");
      const data = {
        name: body.name,
        title: body.title,
        description: body.description,
        inputSchema: body.inputSchema as Prisma.InputJsonValue,
        outputSchema: body.outputSchema as Prisma.InputJsonValue,
        positionalParameter: body.positionalParameter ?? null,
        grossAmount: body.grossAmount,
        terms: body.terms as Prisma.InputJsonValue,
        deliverySeconds: body.terms.deliverySeconds as number,
        reviewSeconds: body.terms.reviewSeconds as number,
      };
      if (params.commandId) {
        const changed = await tx.commandVersion.updateMany({
          where: {
            productId: product.id,
            productVersion: version.number,
            commandId: params.commandId,
          },
          data,
        });
        if (!changed.count) throw app.httpErrors.notFound("COMMAND_NOT_FOUND");
        return {
          commandId: params.commandId,
          draftVersion: version.number,
          revision: version.revision + 1,
        };
      }
      const command = await tx.commandVersion.create({
        data: {
          ...data,
          productId: product.id,
          productVersion: version.number,
          commandId: randomUUID(),
        },
      });
      return {
        commandId: command.commandId,
        draftVersion: version.number,
        revision: version.revision + 1,
      };
    });
  }
  app.post<{ Params: { appId: string; productId: string }; Body: CommandBody }>(
    `${productPath}/commands`,
    { bodyLimit: 32768, config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request, reply) =>
      reply.code(201).send(await saveCommand(request, request.params, request.body)),
  );
  app.put<{ Params: { appId: string; productId: string; commandId: string }; Body: CommandBody }>(
    `${productPath}/commands/:commandId`,
    { bodyLimit: 32768, config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request) => saveCommand(request, request.params, request.body),
  );
  app.put<{
    Params: { appId: string; productId: string; version: string };
    Body: { defaultCommandId?: string; chatTextParameter?: string; expectedRevision: number };
  }>(`${productPath}/versions/:version/settings`, async (request) => {
    const { product } = await ownedProduct(request, request.params.appId, request.params.productId);
    const number = Number(request.params.version);
    if (!positiveVersion(number) || !positiveVersion(request.body?.expectedRevision))
      throw app.httpErrors.badRequest("INVALID_VERSION");
    if (request.body.defaultCommandId !== undefined && !text(request.body.defaultCommandId, 128))
      throw app.httpErrors.badRequest("INVALID_DEFAULT_COMMAND");
    if (request.body.chatTextParameter !== undefined && !text(request.body.chatTextParameter, 64))
      throw app.httpErrors.badRequest("INVALID_CHAT_PARAMETER");
    const version = await db.productVersion.findUnique({
      where: { productId_number: { productId: product.id, number } },
    });
    if (
      !version ||
      version.status !== "DRAFT" ||
      version.revision !== request.body?.expectedRevision
    )
      throw app.httpErrors.conflict("REVISION_CONFLICT");
    if (
      product.kind === "TOOL" &&
      (request.body.defaultCommandId || request.body.chatTextParameter)
    )
      throw app.httpErrors.badRequest("TOOL_HAS_NO_CHAT");
    if (
      product.kind === "AGENT" &&
      (!request.body.defaultCommandId || !request.body.chatTextParameter)
    )
      throw app.httpErrors.badRequest("AGENT_CHAT_REQUIRED");
    const changed = await db.productVersion.updateMany({
      where: { productId: product.id, number, revision: version.revision, status: "DRAFT" },
      data: {
        defaultCommandId: request.body.defaultCommandId ?? null,
        chatTextParameter: request.body.chatTextParameter ?? null,
        revision: { increment: 1 },
      },
    });
    if (!changed.count) throw app.httpErrors.conflict("REVISION_CONFLICT");
    return { revision: version.revision + 1 };
  });
  app.post<{
    Params: { appId: string; productId: string; version: string };
    Body: { expectedRevision: number };
  }>(`${productPath}/versions/:version/submissions`, async (request) => {
    const { product } = await ownedProduct(request, request.params.appId, request.params.productId);
    const number = Number(request.params.version);
    if (!positiveVersion(number) || !positiveVersion(request.body?.expectedRevision))
      throw app.httpErrors.badRequest("INVALID_VERSION");
    if (product.activeVersion !== null && number <= product.activeVersion)
      throw app.httpErrors.conflict("VERSION_NOT_NEWER");
    const version = await db.productVersion.findUnique({
      where: { productId_number: { productId: product.id, number } },
      include: { commands: true },
    });
    if (
      !version ||
      version.status !== "DRAFT" ||
      version.revision !== request.body?.expectedRevision
    )
      throw app.httpErrors.conflict("REVISION_CONFLICT");
    const chatCommand = version.commands.find(
      (command) => command.commandId === version.defaultCommandId,
    );
    const chatSchema = chatCommand?.inputSchema;
    const chatProperties =
      record(chatSchema) && record(chatSchema.properties) ? chatSchema.properties : null;
    const chatField =
      chatProperties && version.chatTextParameter
        ? chatProperties[version.chatTextParameter]
        : null;
    if (
      !version.commands.length ||
      (product.kind === "AGENT" &&
        (!version.defaultCommandId ||
          !version.chatTextParameter ||
          !record(chatField) ||
          chatField.type !== "string"))
    )
      throw app.httpErrors.badRequest("INCOMPLETE_PRODUCT");
    await db.$transaction(async (tx) => {
      const changed = await tx.productVersion.updateMany({
        where: { productId: product.id, number, status: "DRAFT", revision: version.revision },
        data: { status: "APPROVED" },
      });
      if (!changed.count) throw app.httpErrors.conflict("REVISION_CONFLICT");
      await tx.product.update({
        where: { id: product.id },
        data: { status: "PUBLISHED", activeVersion: number },
      });
    });
    return {
      productId: product.id,
      activeVersion: number,
      status: "PUBLISHED",
      availability: "NOT_READY",
    };
  });
  app.post<{ Params: { appId: string; productId: string } }>(
    `${productPath}/suspensions`,
    async (request) => {
      const { product } = await ownedProduct(
        request,
        request.params.appId,
        request.params.productId,
      );
      await db.product.update({ where: { id: product.id }, data: { status: "SUSPENDED" } });
      return { status: "SUSPENDED" };
    },
  );
}
