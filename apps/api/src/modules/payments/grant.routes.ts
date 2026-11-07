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

const uint = z.string().regex(/^(0|[1-9][0-9]{0,77})$/);
const signature = z.string().regex(/^0x(?:[0-9a-fA-F]{2}){65,4096}$/);
const permit = z.object({ value: uint, deadline: uint, signature }).strict().optional();
const grantId = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const timestamp = z
  .number()
  .int()
  .positive()
  .max(2 ** 48 - 1);
// A grant change the buyer signed, for the relayer to submit (no gas for the buyer).
const grantOperationBody = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("set"),
      buyer: address,
      grantId,
      config: z
        .object({
          signer: address,
          expiresAt: timestamp,
          maxPerCall: uint,
          periodSeconds: z
            .number()
            .int()
            .positive()
            .max(2 ** 32 - 1),
          maxPerPeriod: uint,
          maxTotal: uint,
        })
        .strict(),
      deadline: timestamp,
      signature,
      permit,
    })
    .strict(),
  z
    .object({
      kind: z.literal("revoke"),
      buyer: address,
      grantId,
      deadline: timestamp,
      signature,
      permit,
    })
    .strict(),
]);

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
  )
  .post(
    "/v1/grant-operations",
    sessionOnly,
    rateLimit("grant-operations", 10),
    maxBody(32768),
    validate("json", grantOperationBody, "INVALID_GRANT_OPERATION"),
    requireAccount,
    async (c) =>
      c.json(
        await c.var.cradle.grantOperationService.create(c.var.account.id, c.req.valid("json")),
        202,
      ),
  )
  .get("/v1/grant-operations/:id", sessionOnly, requireAccount, async (c) => {
    c.header("Cache-Control", "no-store");
    return c.json(
      await c.var.cradle.grantOperationService.get(c.var.account.id, c.req.param("id")),
    );
  });
