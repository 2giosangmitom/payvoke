import { Hono } from "hono";
import type { AppEnv } from "../../http/context";
import { financialJson, noStore } from "../../http/financial-json";
import { maxBody, rateLimit } from "../../http/limits";
import { validate } from "../../http/validate";
import { requireAccount } from "../auth/guard";
import { invocationParams } from "../schemas";
import { financialIntentBody, invocationListQuery, submitInvocationBody } from "./payments.schemas";

export const paymentRoutes = new Hono<AppEnv>()
  // Paid submission shares the quote boundary: financial JSON, no-store.
  // Without a PAYMENT-SIGNATURE this returns the 402 challenge.
  .post(
    "/v1/invocations",
    rateLimit("invocations", 30),
    maxBody(1024),
    financialJson,
    validate("json", submitInvocationBody, "INVALID_INVOCATION_REQUEST"),
    requireAccount,
    async (c) => {
      const { invocationService, paymentGateway } = c.var.cradle;
      const body = c.req.valid("json");
      const quote = await invocationService.submittableQuote(
        c.var.account,
        body.quoteId,
        c.req.header("idempotency-key"),
      );
      if (c.req.header("payment-signature") !== undefined)
        return paymentGateway.settle(quote, c, body);
      return paymentGateway.challenge(quote, c);
    },
  )
  .get(
    "/v1/invocations",
    noStore,
    validate("query", invocationListQuery, "INVALID_CURSOR"),
    requireAccount,
    async (c) =>
      c.json(
        await c.var.cradle.paymentStatusService.list(c.var.account.id, c.req.valid("query").cursor),
      ),
  )
  .get(
    "/v1/invocations/:id",
    noStore,
    validate("param", invocationParams, "INVALID_INVOCATION"),
    requireAccount,
    async (c) =>
      c.json(
        await c.var.cradle.paymentStatusService.status(c.var.account.id, c.req.valid("param").id),
      ),
  )
  .post(
    "/v1/invocations/:id/financial-intents",
    noStore,
    validate("param", invocationParams, "INVALID_INVOCATION"),
    validate("json", financialIntentBody, "INVALID_FINANCIAL_INTENT"),
    requireAccount,
    async (c) =>
      c.json(
        await c.var.cradle.paymentStatusService.financialIntent(
          c.var.account.id,
          c.req.valid("param").id,
        ),
      ),
  );
