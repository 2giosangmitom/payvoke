import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { getAddress, isAddress } from "viem";
import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import {
  availabilityLabel,
  commandPositional,
  compileCommandInput,
  parseCommandOptions,
  text,
  validCommandName,
  validateCommandInputSchema,
  validateTerms,
} from "../apps/schema";

const keyScopes = ["products:write", "events:read", "events:ack", "reports:write", "files:write"];
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const appSelect = {
  id: true,
  name: true,
  description: true,
  visibility: true,
  status: true,
  payoutAddress: true,
  defaultCommandId: true,
  lastHeartbeatAt: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const commandInclude = {
  activeRevision: true,
} as const;

type CommandPayload = {
  name: string;
  description: string;
  options: unknown;
  positionalParameter?: string | null;
  grossAmount: string;
  terms: unknown;
  outputSchema?: unknown;
  expectedRevisionId?: string;
};

function serializeApp(app: {
  id: string;
  name: string;
  description: string | null;
  visibility: string;
  status: string;
  payoutAddress: string;
  defaultCommandId: string | null;
  lastHeartbeatAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return { ...app, availability: availabilityLabel(app) };
}

function serializeCommand(command: {
  id: string;
  name: string;
  description: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  activeRevision: {
    id: string;
    options: Prisma.JsonValue;
    inputSchema: Prisma.JsonValue;
    outputSchema: Prisma.JsonValue | null;
    positionalParameter: string | null;
    grossAmount: Prisma.Decimal;
    terms: Prisma.JsonValue;
    deliverySeconds: number;
    reviewSeconds: number;
    createdAt: Date;
  } | null;
}) {
  return {
    id: command.id,
    name: command.name,
    description: command.description,
    archivedAt: command.archivedAt,
    createdAt: command.createdAt,
    updatedAt: command.updatedAt,
    revision: command.activeRevision
      ? {
          ...command.activeRevision,
          grossAmount: command.activeRevision.grossAmount.toFixed(0),
        }
      : null,
  };
}

export async function registerProvider(app: FastifyInstance, db: PrismaClient) {
  async function owner(request: FastifyRequest, appId: string) {
    await app.requireAccount(request);
    const provider = await db.app.findFirst({
      where: { id: appId, ownerId: request.account!.id, archivedAt: null },
    });
    if (!provider) throw app.httpErrors.notFound("APP_NOT_FOUND");
    return provider;
  }

  async function writer(request: FastifyRequest, appId: string) {
    const bearer = request.headers.authorization;
    if (!bearer) return owner(request, appId);
    const match = /^Bearer (pvk_[a-f0-9]{16}\.[a-f0-9]{64})$/.exec(bearer);
    if (!match) throw app.httpErrors.unauthorized("INVALID_PROVIDER_KEY");
    const secret = match[1];
    const prefix = secret.slice(4, 20);
    const key = await db.appApiKey.findUnique({ where: { prefix }, include: { app: true } });
    const computed = Buffer.from(digest(secret), "hex");
    const stored = Buffer.from(key?.secretHash ?? "0".repeat(64), "hex");
    if (
      !timingSafeEqual(computed, stored) ||
      !key ||
      key.appId !== appId ||
      key.revokedAt ||
      key.expiresAt <= new Date() ||
      key.app.status !== "ACTIVE" ||
      key.app.archivedAt
    )
      throw app.httpErrors.unauthorized("INVALID_PROVIDER_KEY");
    if (!key.scopes.includes("products:write"))
      throw app.httpErrors.forbidden("INSUFFICIENT_SCOPE");
    void db.appApiKey
      .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
    return key.app;
  }

  async function commandPayload(
    request: FastifyRequest,
    body: CommandPayload,
    appId: string,
    commandId?: string,
  ) {
    const options = parseCommandOptions(body?.options);
    if (!options || !validCommandName(body.name) || !text(body.description, 2000))
      throw app.httpErrors.badRequest("INVALID_COMMAND");
    if (!options.length) throw app.httpErrors.badRequest("COMMAND_OPTIONS_REQUIRED");
    const inputSchema = compileCommandInput(options);
    if (!validateCommandInputSchema(inputSchema))
      throw app.httpErrors.badRequest("INVALID_COMMAND_SCHEMA");
    const positional = commandPositional(options, body.positionalParameter);
    if (
      body.positionalParameter !== undefined &&
      body.positionalParameter !== null &&
      (typeof body.positionalParameter !== "string" ||
        (body.positionalParameter !== "" && positional === null))
    )
      throw app.httpErrors.badRequest("INVALID_POSITIONAL_PARAMETER");
    if (body.outputSchema !== undefined && !validateCommandInputSchema(body.outputSchema))
      throw app.httpErrors.badRequest("INVALID_OUTPUT_SCHEMA");
    if (
      !/^[1-9]\d*$/.test(body.grossAmount) ||
      BigInt(body.grossAmount) > (1n << 256n) - 1n ||
      !validateTerms(body.terms)
    )
      throw app.httpErrors.badRequest("INVALID_TERMS");
    const policy = await db.deploymentPolicy.findUnique({ where: { activeSlot: "active" } });
    const terms = body.terms as Record<string, unknown>;
    if (
      !policy ||
      (terms.deliverySeconds as number) +
        (terms.reviewSeconds as number) +
        policy.resolutionGraceSeconds +
        policy.quoteLifetimeSeconds >
        policy.maxHoldSeconds
    )
      throw app.httpErrors.badRequest("TERMS_EXCEED_POLICY");
    const duplicate = await db.appCommand.findFirst({
      where: {
        appId,
        name: body.name,
        NOT: commandId ? { id: commandId } : undefined,
      },
    });
    if (duplicate) throw app.httpErrors.conflict("COMMAND_NAME_TAKEN");
    return {
      options,
      inputSchema,
      outputSchema: body.outputSchema as Prisma.InputJsonValue | undefined,
      positionalParameter: positional,
      grossAmount: body.grossAmount,
      terms: body.terms as Prisma.InputJsonValue,
      deliverySeconds: terms.deliverySeconds as number,
      reviewSeconds: terms.reviewSeconds as number,
    };
  }

  app.post<{
    Body: {
      name: string;
      description?: string;
      payoutAddress: string;
      visibility?: string;
      clientRequestId: string;
    };
  }>(
    "/v1/provider/apps",
    {
      preHandler: app.requireAccount,
      bodyLimit: 8192,
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const { name, description, payoutAddress, visibility, clientRequestId } = request.body ?? {};
      const visible = visibility ?? "PUBLIC";
      if (
        !text(name, 120) ||
        (description !== undefined && typeof description !== "string") ||
        (description && description.length > 2000) ||
        !isAddress(payoutAddress) ||
        !["PUBLIC", "PRIVATE"].includes(visible) ||
        !text(clientRequestId, 128)
      )
        throw app.httpErrors.badRequest("INVALID_APP");
      const normalized = {
        name: name.trim(),
        description: description?.trim() || null,
        payoutAddress: getAddress(payoutAddress),
        visibility: visible,
      };
      const where = { ownerId_clientRequestId: { ownerId: request.account!.id, clientRequestId } };
      const prior = await db.app.findUnique({ where, select: appSelect });
      if (
        prior &&
        (prior.name !== normalized.name ||
          prior.description !== normalized.description ||
          prior.payoutAddress !== normalized.payoutAddress ||
          prior.visibility !== normalized.visibility)
      )
        throw app.httpErrors.conflict("IDEMPOTENCY_CONFLICT");
      if (prior) return reply.code(200).send(serializeApp(prior));
      const created = await db.app.upsert({
        where,
        create: { ownerId: request.account!.id, clientRequestId, ...normalized },
        update: {},
        select: appSelect,
      });
      return reply.code(201).send(serializeApp(created));
    },
  );

  app.get("/v1/provider/apps", { preHandler: app.requireAccount }, async (request) => {
    const apps = await db.app.findMany({
      where: { ownerId: request.account!.id, archivedAt: null },
      select: appSelect,
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return apps.map(serializeApp);
  });

  app.get<{ Params: { appId: string } }>(
    "/v1/provider/apps/:appId",
    { preHandler: app.requireAccount },
    async (request) => {
      const provider = await owner(request, request.params.appId);
      const commands = await db.appCommand.findMany({
        where: { appId: provider.id, archivedAt: null },
        include: commandInclude,
        orderBy: { createdAt: "asc" },
      });
      return {
        ...serializeApp(provider),
        commands: commands.map(serializeCommand),
      };
    },
  );

  app.patch<{
    Params: { appId: string };
    Body: {
      name?: string;
      description?: string | null;
      visibility?: string;
      payoutAddress?: string;
    };
  }>(
    "/v1/provider/apps/:appId",
    { preHandler: app.requireAccount, bodyLimit: 8192 },
    async (request) => {
      await owner(request, request.params.appId);
      const body = request.body ?? {};
      if (body.name !== undefined && !text(body.name, 120))
        throw app.httpErrors.badRequest("INVALID_APP_NAME");
      if (body.description !== undefined && body.description !== null) {
        if (typeof body.description !== "string" || body.description.length > 2000)
          throw app.httpErrors.badRequest("INVALID_APP_DESCRIPTION");
      }
      if (body.visibility !== undefined && !["PUBLIC", "PRIVATE"].includes(body.visibility))
        throw app.httpErrors.badRequest("INVALID_VISIBILITY");
      if (body.payoutAddress !== undefined && !isAddress(body.payoutAddress))
        throw app.httpErrors.badRequest("INVALID_PAYOUT");
      const updated = await db.app.update({
        where: { id: request.params.appId },
        data: {
          ...(body.name !== undefined ? { name: body.name.trim() } : {}),
          ...(body.description !== undefined
            ? { description: body.description?.trim() || null }
            : {}),
          ...(body.visibility !== undefined ? { visibility: body.visibility } : {}),
          ...(body.payoutAddress !== undefined
            ? { payoutAddress: getAddress(body.payoutAddress) }
            : {}),
        },
        select: appSelect,
      });
      return serializeApp(updated);
    },
  );

  app.post<{ Params: { appId: string } }>(
    "/v1/provider/apps/:appId/archive",
    { preHandler: app.requireAccount },
    async (request) => {
      await owner(request, request.params.appId);
      await db.$transaction([
        db.app.update({
          where: { id: request.params.appId },
          data: { status: "ARCHIVED", archivedAt: new Date() },
        }),
        db.appApiKey.updateMany({
          where: { appId: request.params.appId, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
      ]);
      return { archived: true };
    },
  );

  app.post<{ Params: { appId: string } }>(
    "/v1/provider/apps/:appId/suspensions",
    { preHandler: app.requireAccount },
    async (request) => {
      await owner(request, request.params.appId);
      await db.app.update({
        where: { id: request.params.appId },
        data: { status: "SUSPENDED" },
      });
      return { status: "SUSPENDED" };
    },
  );

  app.post<{ Params: { appId: string } }>(
    "/v1/provider/apps/:appId/activations",
    { preHandler: app.requireAccount },
    async (request) => {
      await owner(request, request.params.appId);
      await db.app.update({
        where: { id: request.params.appId },
        data: { status: "ACTIVE", archivedAt: null },
      });
      return { status: "ACTIVE" };
    },
  );

  app.get<{ Params: { appId: string } }>(
    "/v1/provider/apps/:appId/keys",
    { preHandler: app.requireAccount },
    async (request) => {
      await owner(request, request.params.appId);
      return db.appApiKey.findMany({
        where: { appId: request.params.appId },
        select: {
          id: true,
          prefix: true,
          scopes: true,
          expiresAt: true,
          lastUsedAt: true,
          revokedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 30,
      });
    },
  );

  app.post<{ Params: { appId: string }; Body: { scopes?: string[]; expiresAt?: string } }>(
    "/v1/provider/apps/:appId/keys",
    {
      preHandler: app.requireAccount,
      bodyLimit: 4096,
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      await owner(request, request.params.appId);
      const scopes = request.body?.scopes ?? keyScopes;
      const expiresAt =
        request.body?.expiresAt ?? new Date(Date.now() + 90 * 86400000).toISOString();
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
        await tx.appApiKey.updateMany({
          where: { appId: request.params.appId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        return tx.appApiKey.create({
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
    "/v1/provider/apps/:appId/keys/:keyId/revocations",
    { preHandler: app.requireAccount },
    async (request) => {
      await owner(request, request.params.appId);
      const result = await db.appApiKey.updateMany({
        where: { id: request.params.keyId, appId: request.params.appId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (!result.count) throw app.httpErrors.notFound("KEY_NOT_FOUND");
      return { revoked: true };
    },
  );

  app.get<{ Params: { appId: string } }>("/v1/provider/apps/:appId/commands", async (request) => {
    const provider = await writer(request, request.params.appId);
    const commands = await db.appCommand.findMany({
      where: { appId: provider.id, archivedAt: null },
      include: commandInclude,
      orderBy: { createdAt: "asc" },
    });
    return commands.map(serializeCommand);
  });

  app.post<{ Params: { appId: string }; Body: CommandPayload }>(
    "/v1/provider/apps/:appId/commands",
    { bodyLimit: 32768, config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const provider = await writer(request, request.params.appId);
      const data = await commandPayload(request, request.body, provider.id);
      const command = await db.$transaction(async (tx) => {
        const created = await tx.appCommand.create({
          data: {
            appId: provider.id,
            name: request.body.name.trim(),
            description: request.body.description,
          },
        });
        const revision = await tx.appCommandRevision.create({
          data: {
            commandId: created.id,
            options: data.options as unknown as Prisma.InputJsonValue,
            inputSchema: data.inputSchema as Prisma.InputJsonValue,
            ...(data.outputSchema !== undefined ? { outputSchema: data.outputSchema } : {}),
            positionalParameter: data.positionalParameter,
            grossAmount: data.grossAmount,
            terms: data.terms,
            deliverySeconds: data.deliverySeconds,
            reviewSeconds: data.reviewSeconds,
          },
        });
        return tx.appCommand.update({
          where: { id: created.id },
          data: { activeRevisionId: revision.id },
          include: commandInclude,
        });
      });
      return reply.code(201).send(serializeCommand(command));
    },
  );

  app.patch<{ Params: { appId: string; commandId: string }; Body: CommandPayload }>(
    "/v1/provider/apps/:appId/commands/:commandId",
    { bodyLimit: 32768, config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request) => {
      const provider = await writer(request, request.params.appId);
      const current = await db.appCommand.findFirst({
        where: {
          id: request.params.commandId,
          appId: provider.id,
          archivedAt: null,
        },
        include: commandInclude,
      });
      if (!current) throw app.httpErrors.notFound("COMMAND_NOT_FOUND");
      if (
        request.body.expectedRevisionId !== undefined &&
        request.body.expectedRevisionId !== current.activeRevisionId
      )
        throw app.httpErrors.conflict("REVISION_CONFLICT");
      const data = await commandPayload(request, request.body, provider.id, current.id);
      const updated = await db.$transaction(async (tx) => {
        const revision = await tx.appCommandRevision.create({
          data: {
            commandId: current.id,
            options: data.options as unknown as Prisma.InputJsonValue,
            inputSchema: data.inputSchema as Prisma.InputJsonValue,
            ...(data.outputSchema !== undefined ? { outputSchema: data.outputSchema } : {}),
            positionalParameter: data.positionalParameter,
            grossAmount: data.grossAmount,
            terms: data.terms,
            deliverySeconds: data.deliverySeconds,
            reviewSeconds: data.reviewSeconds,
          },
        });
        return tx.appCommand.update({
          where: { id: current.id },
          data: {
            name: request.body.name.trim(),
            description: request.body.description,
            activeRevisionId: revision.id,
          },
          include: commandInclude,
        });
      });
      return serializeCommand(updated);
    },
  );

  app.delete<{ Params: { appId: string; commandId: string } }>(
    "/v1/provider/apps/:appId/commands/:commandId",
    async (request) => {
      const provider = await writer(request, request.params.appId);
      const result = await db.$transaction(async (tx) => {
        const changed = await tx.appCommand.updateMany({
          where: { id: request.params.commandId, appId: provider.id, archivedAt: null },
          data: { archivedAt: new Date() },
        });
        if (!changed.count) return false;
        if (provider.defaultCommandId === request.params.commandId)
          await tx.app.update({
            where: { id: provider.id },
            data: { defaultCommandId: null },
          });
        return true;
      });
      if (!result) throw app.httpErrors.notFound("COMMAND_NOT_FOUND");
      return { archived: true };
    },
  );

  app.post<{ Params: { appId: string; commandId: string } }>(
    "/v1/provider/apps/:appId/commands/:commandId/default",
    async (request) => {
      const provider = await writer(request, request.params.appId);
      const command = await db.appCommand.findFirst({
        where: {
          id: request.params.commandId,
          appId: provider.id,
          archivedAt: null,
          activeRevisionId: { not: null },
        },
        select: { id: true },
      });
      if (!command) throw app.httpErrors.badRequest("COMMAND_NOT_READY");
      await db.app.update({
        where: { id: provider.id },
        data: { defaultCommandId: command.id },
      });
      return { defaultCommandId: command.id };
    },
  );

  // Kept as a small compatibility endpoint for callers that still patch only
  // the payout address.
  app.put<{ Params: { appId: string }; Body: { payoutAddress: string } }>(
    "/v1/provider/apps/:appId/payout",
    { preHandler: app.requireAccount, bodyLimit: 2048 },
    async (request) => {
      await owner(request, request.params.appId);
      if (!isAddress(request.body?.payoutAddress))
        throw app.httpErrors.badRequest("INVALID_PAYOUT");
      const updated = await db.app.update({
        where: { id: request.params.appId },
        data: { payoutAddress: getAddress(request.body.payoutAddress) },
        select: appSelect,
      });
      return serializeApp(updated);
    },
  );

  // Export for other modules without exposing the Prisma client.
  void record;
  void randomUUID;
}
