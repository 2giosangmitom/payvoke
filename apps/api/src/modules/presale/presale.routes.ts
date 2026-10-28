import { Hono } from "hono";
import type { AppEnv, RouteContext } from "../../http/context";
import { maxBody, rateLimit } from "../../http/limits";
import { validate } from "../../http/validate";
import { requireAccount } from "../auth/guard";
import type { KeyScope } from "../provider/provider.validation";
import {
  buyerMessageBody,
  offerBody,
  providerMessageBody,
  toolResultBody,
} from "./presale.schemas";

const provider = "/v1/provider/apps/:appId/threads/:threadId";

// Provider routes accept only an app key with the given scope.
const providerApp = (c: RouteContext, scope: KeyScope) =>
  c.var.cradle.providerKeyService.authenticate(
    c.req.header("authorization"),
    c.req.param("appId")!,
    scope,
  );

export const presaleRoutes = new Hono<AppEnv>()
  // Free messages still cost the provider compute: bound them per buyer.
  .post(
    "/v1/threads/:threadId/messages",
    rateLimit("messages", 20),
    maxBody(32768),
    validate("json", buyerMessageBody, "INVALID_MESSAGE"),
    requireAccount,
    async (c) =>
      c.json(
        await c.var.cradle.presaleService.sendBuyerMessage(
          c.var.account.id,
          c.req.param("threadId"),
          c.req.valid("json"),
        ),
        201,
      ),
  )
  // The buyer's result to any open tool call, or `{ accepted: false }` to an offer.
  .post(
    "/v1/threads/:threadId/tool-results",
    rateLimit("tool-results", 30),
    maxBody(32768),
    validate("json", toolResultBody, "INVALID_TOOL_RESULT"),
    requireAccount,
    async (c) =>
      c.json(
        await c.var.cradle.toolResultService.submit(
          c.var.account.id,
          c.req.param("threadId"),
          c.req.valid("json"),
        ),
        201,
      ),
  )
  // Provider worker: app key auth, never a browser session.
  .post(
    `${provider}/messages`,
    maxBody(32768),
    validate("json", providerMessageBody, "INVALID_MESSAGE"),
    async (c) =>
      c.json(
        await c.var.cradle.presaleService.sendProviderMessage(
          await providerApp(c, "messages:write"),
          c.req.param("threadId"),
          c.req.valid("json"),
        ),
        201,
      ),
  )
  .post(`${provider}/messages/:messageId/acks`, async (c) =>
    c.json(
      await c.var.cradle.presaleService.acknowledgeMessage(
        await providerApp(c, "events:ack"),
        c.req.param("threadId"),
        c.req.param("messageId"),
      ),
    ),
  )
  .post(
    `${provider}/offers`,
    maxBody(65536),
    validate("json", offerBody, "INVALID_OFFER"),
    async (c) =>
      c.json(
        await c.var.cradle.presaleService.createOffer(
          await providerApp(c, "offers:write"),
          c.req.param("threadId"),
          c.req.valid("json"),
        ),
        201,
      ),
  )
  .post(`${provider}/offers/:offerId/withdrawals`, async (c) =>
    c.json(
      await c.var.cradle.presaleService.withdrawOffer(
        await providerApp(c, "offers:write"),
        c.req.param("threadId"),
        c.req.param("offerId"),
      ),
    ),
  );
