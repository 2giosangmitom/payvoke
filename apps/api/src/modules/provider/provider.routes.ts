import { Hono } from "hono";
import type { AppEnv, RouteContext } from "../../http/context";
import { maxBody, rateLimit } from "../../http/limits";
import { validate } from "../../http/validate";
import { requireAccount } from "../auth/guard";
import {
  appPatchBody,
  appPatchCodes,
  commandBody,
  commandCodes,
  commandListBody,
  IMAGE_MAX_BYTES,
  keyRequestBody,
  newAppBody,
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

// Command routes authenticate in the handler: session or app key.
const commandWrite = [rateLimit("commands", 60), maxBody(32768)] as const;

export const providerRoutes = new Hono<AppEnv>()
  .post(
    "/v1/provider/apps",
    rateLimit("apps", 10),
    maxBody(8192),
    validate("json", newAppBody, "INVALID_APP"),
    requireAccount,
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
  .get(`${base}/commands`, async (c) =>
    c.json(await c.var.cradle.providerCommandService.list((await writer(c)).id)),
  )
  .post(
    `${base}/commands`,
    ...commandWrite,
    validate("json", commandBody, "INVALID_COMMAND", commandCodes),
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
    async (c) =>
      c.json(
        await c.var.cradle.providerCommandService.overwrite(await writer(c), c.req.valid("json")),
      ),
  )
  .patch(
    `${base}/commands/:commandId`,
    ...commandWrite,
    validate("json", commandBody, "INVALID_COMMAND", commandCodes),
    async (c) =>
      c.json(
        await c.var.cradle.providerCommandService.update(
          await writer(c),
          c.req.param("commandId"),
          c.req.valid("json"),
        ),
      ),
  )
  .delete(`${base}/commands/:commandId`, async (c) =>
    c.json(
      await c.var.cradle.providerCommandService.archive(await writer(c), c.req.param("commandId")),
    ),
  )
  .post(`${base}/commands/:commandId/default`, async (c) =>
    c.json(
      await c.var.cradle.providerCommandService.setDefault(
        await writer(c),
        c.req.param("commandId"),
      ),
    ),
  );
