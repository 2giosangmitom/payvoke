import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import type { AppEnv } from "../../http/context";
import { financialJson } from "../../http/financial-json";
import { maxBody, rateLimit } from "../../http/limits";
import { validate } from "../../http/validate";
import { BadRequestError } from "../../errors";
import { requireAccount } from "../auth/guard";
import { id } from "../schemas";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const instantParams = z.object({
  appId: id,
  command: z.string().regex(/^[a-z][a-z0-9_]{0,31}$/),
});
export const instantBody = z.object({ arguments: z.record(z.string(), z.unknown()) }).strict();

// A public list may be cached briefly by clients and CDNs.
const publicCache = createMiddleware(async (c, next) => {
  await next();
  if (c.res.ok) c.header("Cache-Control", "public, max-age=30");
});

export const x402Routes = new Hono<AppEnv>()
  .get("/v1/x402/catalog", rateLimit("x402-catalog", 120), publicCache, async (c) =>
    c.json(await c.var.cradle.x402Service.catalog()),
  )
  // Instant purchase of one command, x402 style. Unpaid: 402 with the quote.
  // With PAYMENT-SIGNATURE and the same Idempotency-Key and body: the payment
  // goes to the gateway, which answers 202 PENDING or HELD. Every gate (auth,
  // body, ownership, idempotency) runs before the gateway sees a signature.
  .post(
    "/v1/x402/apps/:appId/commands/:command",
    rateLimit("x402-instant", 30),
    // Instant inputs are text only (no files), with room for a pasted CSV.
    maxBody(512 * 1024),
    financialJson,
    validate("param", instantParams, "COMMAND_NOT_FOUND"),
    validate("json", instantBody, "INVALID_INSTANT_REQUEST"),
    requireAccount,
    async (c) => {
      const { x402Service, paymentGateway } = c.var.cradle;
      const key = c.req.header("idempotency-key");
      if (typeof key !== "string" || !UUID.test(key))
        throw new BadRequestError("IDEMPOTENCY_KEY_REQUIRED");
      const { appId, command } = c.req.valid("param");
      const body = c.req.valid("json");
      const request = { appId, command, arguments: body.arguments };
      const resource = x402Service.resource(appId, command);
      if (c.req.header("payment-signature") !== undefined) {
        const quote = await x402Service.submittable(c.var.account, request, key);
        return paymentGateway.settle(quote, c, body, resource);
      }
      const quote = await x402Service.quote(c.var.account, request, key);
      return paymentGateway.challenge(quote, c, resource, true);
    },
  );
