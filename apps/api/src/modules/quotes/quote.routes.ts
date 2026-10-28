import { Hono } from "hono";
import type { AppEnv } from "../../http/context";
import { financialJson } from "../../http/financial-json";
import { maxBody, rateLimit } from "../../http/limits";
import { validate } from "../../http/validate";
import { requireAccount } from "../auth/guard";
import { prepareQuoteBody } from "./quote.schemas";

// Financial JSON boundary: duplicate keys are rejected and nothing is cached.
export const quoteRoutes = new Hono<AppEnv>()
  .post(
    "/v1/quotes",
    rateLimit("quotes", 30),
    maxBody(32768),
    financialJson,
    validate("json", prepareQuoteBody, "INVALID_QUOTE_REQUEST"),
    requireAccount,
    async (c) =>
      c.json(
        await c.var.cradle.quoteService.prepare(
          c.var.account,
          c.req.valid("json"),
          c.req.header("idempotency-key"),
        ),
        201,
      ),
  )
  .get("/v1/quotes/:quoteId", financialJson, requireAccount, async (c) =>
    c.json(await c.var.cradle.quoteService.restore(c.var.account, c.req.param("quoteId"))),
  );
