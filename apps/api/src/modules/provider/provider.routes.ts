import { Hono } from "hono";
import type { AppEnv, RouteContext } from "../../http/context";
import { accountLimit, maxBody, rateLimit } from "../../http/limits";
import { builderRoute } from "../../http/openapi";
import { validate } from "../../http/validate";
import { z } from "zod";
import { noStore } from "../../http/financial-json";
import { requireAccount } from "../auth/guard";
import {
  appPatchBody,
  appPatchCodes,
  commandBody,
  commandCodes,
  commandDefinition,
  commandListBody,
  IMAGE_MAX_BYTES,
  keyRequestBody,
  newAppBody,
  ownedCommand,
} from "./provider.validation";

const base = "/v1/provider/apps/:appId";

// Owner session only (Studio).
async function owned(c: RouteContext) {
  const { authService, providerAppService } = c.var.cradle;
  const account = c.var.account ?? (await authService.requireAccount(c.req.raw.headers));
  return providerAppService.owned(account.id, c.req.param("appId")!);
}

// Command writes accept the owner session or an app key with products:write.
function writer(c: RouteContext) {
  const bearer = c.req.header("authorization");
  if (!bearer) return owned(c);
  return c.var.cradle.providerKeyService.authenticate(
    bearer,
    c.req.param("appId")!,
    "products:write",
  );
}

// Codes a command definition can fail with, by status.
const commandErrors = {
  400: [
    "INVALID_COMMAND",
    "COMMAND_OPTIONS_REQUIRED",
    "INVALID_COMMAND_SCHEMA",
    "INVALID_POSITIONAL_PARAMETER",
    "INVALID_MAX_AMOUNT",
    "INVALID_TERMS",
    "TERMS_EXCEED_POLICY",
  ],
  409: ["COMMAND_NAME_TAKEN"],
  422: ["PRICE_BELOW_FLOOR"],
  429: ["RATE_LIMITED"],
};

// Command routes authenticate in the handler: session or app key.
const commandWrite = [rateLimit("commands", 60), maxBody(32768)] as const;

export const providerRoutes = new Hono<AppEnv>()
  .post(
    "/v1/provider/apps",
    rateLimit("apps", 10),
    maxBody(8192),
    validate("json", newAppBody, "INVALID_APP"),
    requireAccount,
    // Create attempts per account per day, on top of the live-agent cap.
    accountLimit("apps-daily", (config) => config.APP_CREATES_PER_DAY, 24 * 60 * 60 * 1000),
    async (c) => {
      const { created, app } = await c.var.cradle.providerAppService.create(
        c.var.account,
        c.req.valid("json"),
      );
      return c.json(app, created ? 201 : 200);
    },
  )
  .get("/v1/provider/apps", requireAccount, async (c) =>
    c.json(await c.var.cradle.providerAppService.list(c.var.account.id)),
  )
  .get(base, requireAccount, async (c) =>
    c.json(await c.var.cradle.providerAppService.detail(await owned(c))),
  )
  .get(`${base}/stats`, noStore, requireAccount, async (c) => {
    const app = await owned(c);
    return c.json(await c.var.cradle.statsService.app(app.id));
  })
  .patch(
    base,
    maxBody(8192),
    validate("json", appPatchBody, "INVALID_APP", appPatchCodes),
    requireAccount,
    async (c) => {
      const app = await owned(c);
      return c.json(await c.var.cradle.providerAppService.update(app.id, c.req.valid("json")));
    },
  )
  // The raw image bytes are the body; the Content-Type names the format.
  .put(
    `${base}/image`,
    rateLimit("images", 20),
    maxBody(IMAGE_MAX_BYTES),
    requireAccount,
    async (c) => {
      const app = await owned(c);
      const type = c.req.header("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
      const bytes = new Uint8Array(await c.req.arrayBuffer());
      return c.json(await c.var.cradle.providerAppService.setImage(app, type, bytes));
    },
  )
  .delete(`${base}/image`, requireAccount, async (c) =>
    c.json(await c.var.cradle.providerAppService.removeImage(await owned(c))),
  )
  .post(`${base}/archive`, requireAccount, async (c) =>
    c.json(await c.var.cradle.providerAppService.archive((await owned(c)).id)),
  )
  .post(`${base}/suspensions`, requireAccount, async (c) =>
    c.json(await c.var.cradle.providerAppService.suspend((await owned(c)).id)),
  )
  .post(`${base}/activations`, requireAccount, async (c) =>
    c.json(await c.var.cradle.providerAppService.activate((await owned(c)).id)),
  )
  .get(`${base}/keys`, requireAccount, async (c) =>
    c.json(await c.var.cradle.providerKeyService.list((await owned(c)).id)),
  )
  .post(
    `${base}/keys`,
    rateLimit("keys", 10),
    maxBody(4096),
    validate("json", keyRequestBody, "INVALID_KEY_REQUEST"),
    requireAccount,
    async (c) => {
      const app = await owned(c);
      const key = await c.var.cradle.providerKeyService.issue(app.id, c.req.valid("json"));
      c.header("Cache-Control", "no-store");
      return c.json(key, 201);
    },
  )
  .post(`${base}/keys/:keyId/revocations`, requireAccount, async (c) =>
    c.json(await c.var.cradle.providerKeyService.revoke((await owned(c)).id, c.req.param("keyId"))),
  )
  .get(
    `${base}/commands`,
    builderRoute({
      operationId: "listCommands",
      tag: "Commands",
      summary: "List commands",
      description: "The app's active commands, oldest first, each with its current revision.",
      scope: "products:write",
      responses: { 200: { description: "Active commands", schema: z.array(ownedCommand) } },
    }),
    async (c) => c.json(await c.var.cradle.providerCommandService.list((await writer(c)).id)),
  )
  .post(
    `${base}/commands`,
    ...commandWrite,
    validate("json", commandBody, "INVALID_COMMAND", commandCodes),
    builderRoute({
      operationId: "createCommand",
      tag: "Commands",
      summary: "Create a command",
      description:
        "Registers one slash command. Every create or edit writes an immutable revision; quotes reference the revision they priced.",
      scope: "products:write",
      body: commandDefinition,
      responses: { 201: { description: "The new command", schema: ownedCommand } },
      errors: commandErrors,
    }),
    async (c) =>
      c.json(
        await c.var.cradle.providerCommandService.create(await writer(c), c.req.valid("json")),
        201,
      ),
  )
  .put(
    `${base}/commands`,
    rateLimit("commands", 60),
    maxBody(262144),
    validate("json", commandListBody, "INVALID_COMMANDS"),
    builderRoute({
      operationId: "overwriteCommands",
      tag: "Commands",
      summary: "Overwrite all commands",
      description:
        "Syncs the app's whole command list (up to 25), like a bot syncing its application commands on start. Commands match by name: unchanged ones keep their revision, changed ones get a new revision and missing ones are archived. The default command stays if it survives, otherwise the first command becomes the default.",
      scope: "products:write",
      body: z.array(commandDefinition).max(25),
      responses: {
        200: { description: "The active commands after the sync", schema: z.array(ownedCommand) },
      },
      errors: {
        400: ["INVALID_COMMANDS", "DUPLICATE_COMMAND_NAME", ...commandErrors[400]],
        422: commandErrors[422],
        429: commandErrors[429],
      },
    }),
    async (c) =>
      c.json(
        await c.var.cradle.providerCommandService.overwrite(await writer(c), c.req.valid("json")),
      ),
  )
  .patch(
    `${base}/commands/:commandId`,
    ...commandWrite,
    validate("json", commandBody, "INVALID_COMMAND", commandCodes),
    builderRoute({
      operationId: "updateCommand",
      tag: "Commands",
      summary: "Update a command",
      description:
        "Replaces the command's definition with a new revision. Send `expectedRevisionId` to fail instead of overwriting a concurrent edit.",
      scope: "products:write",
      body: commandDefinition,
      responses: { 200: { description: "The updated command", schema: ownedCommand } },
      errors: {
        ...commandErrors,
        404: ["COMMAND_NOT_FOUND"],
        409: [...commandErrors[409], "REVISION_CONFLICT"],
      },
    }),
    async (c) =>
      c.json(
        await c.var.cradle.providerCommandService.update(
          await writer(c),
          c.req.param("commandId"),
          c.req.valid("json"),
        ),
      ),
  )
  .delete(
    `${base}/commands/:commandId`,
    builderRoute({
      operationId: "archiveCommand",
      tag: "Commands",
      summary: "Archive a command",
      description:
        "Removes the command from the store. Past quotes keep their revision. Archiving the default command leaves the app without one, which makes it unavailable.",
      scope: "products:write",
      responses: {
        200: { description: "Archived", schema: z.object({ archived: z.literal(true) }) },
      },
      errors: { 404: ["COMMAND_NOT_FOUND"] },
    }),
    async (c) =>
      c.json(
        await c.var.cradle.providerCommandService.archive(
          await writer(c),
          c.req.param("commandId"),
        ),
      ),
  )
  .post(
    `${base}/commands/:commandId/default`,
    builderRoute({
      operationId: "setDefaultCommand",
      tag: "Commands",
      summary: "Set the default command",
      description:
        "The command plain chat messages and offers without a `commandId` use. An app needs a default command to be available.",
      scope: "products:write",
      responses: {
        200: { description: "The new default", schema: z.object({ defaultCommandId: z.string() }) },
      },
      errors: { 400: ["COMMAND_NOT_READY"] },
    }),
    async (c) =>
      c.json(
        await c.var.cradle.providerCommandService.setDefault(
          await writer(c),
          c.req.param("commandId"),
        ),
      ),
  );
