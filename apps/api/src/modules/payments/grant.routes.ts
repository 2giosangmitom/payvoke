import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import { ForbiddenError } from "../../errors";
import type { AppEnv } from "../../http/context";
import { maxBody, rateLimit } from "../../http/limits";
import { validate } from "../../http/validate";
import { isBuyerToken } from "../auth/access-token.service";
import { requireAccount } from "../auth/guard";

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const newGrantBody = z
  .object({
    grantId: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
    buyer: address,
    signer: address,
    kind: z.enum(["agent", "browser"]).default("agent"),
    name: z.string().trim().min(1).max(64),
  })
  .strict();

// A token may list grants, so a coding agent can find the one it signs for,
// but only the signed-in console records or removes them.
const sessionOnly = createMiddleware<AppEnv>(async (c, next) => {
  if (isBuyerToken(c.req.header("authorization")))
    throw new ForbiddenError("ACCESS_TOKEN_NOT_ALLOWED");
  await next();
});

export const grantRoutes = new Hono<AppEnv>()
  .get("/v1/grants", requireAccount, async (c) => {
    c.header("Cache-Control", "no-store");
    return c.json(await c.var.cradle.grantService.list(c.var.account.id));
  })
  .post(
    "/v1/grants",
    sessionOnly,
    rateLimit("grants", 10),
    maxBody(1024),
    validate("json", newGrantBody, "INVALID_GRANT_REQUEST"),
    requireAccount,
    async (c) =>
      c.json(await c.var.cradle.grantService.record(c.var.account.id, c.req.valid("json")), 201),
  )
  .delete("/v1/grants/:id", sessionOnly, requireAccount, async (c) =>
    c.json(await c.var.cradle.grantService.forget(c.var.account.id, c.req.param("id"))),
  );
