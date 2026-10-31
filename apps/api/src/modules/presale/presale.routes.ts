import { Hono } from "hono";
import type { AppEnv, RouteContext } from "../../http/context";
import { maxBody, rateLimit } from "../../http/limits";
import { builderRoute } from "../../http/openapi";
import { validate } from "../../http/validate";
import { requireAccount } from "../auth/guard";
import type { KeyScope } from "../provider/provider.validation";
import { z } from "zod";
import {
  buyerMessageBody,
  messageDeltaBody,
  messageDeltaDoc,
  messageView,
  offerBody,
  offerDoc,
  offerView,
  providerMessageBody,
  providerMessageDoc,
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
    builderRoute({
      operationId: "sendMessage",
      tag: "Threads",
      summary: "Send a message",
      description:
        "Replies in a buyer's thread with markdown text, a built-in tool, or both. Free for the buyer. At most 5 provider messages in a row without a buyer reply.",
      scope: "messages:write",
      body: providerMessageDoc,
      responses: { 201: { description: "The message", schema: messageView } },
      errors: {
        400: ["INVALID_MESSAGE", "INVALID_TOOL_CALL"],
        404: ["THREAD_NOT_FOUND"],
        409: ["IDEMPOTENCY_CONFLICT", "PROVIDER_MESSAGE_LIMIT"],
      },
    }),
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
  .post(
    `${provider}/messages/:messageId/deltas`,
    rateLimit("message-deltas", 600),
    maxBody(16384),
    validate("json", messageDeltaBody, "INVALID_MESSAGE"),
    builderRoute({
      operationId: "appendMessageDelta",
      tag: "Threads",
      summary: "Stream text into a reply",
      description:
        "Appends text to a message opened with `streaming: true`, so the buyer sees the reply as it is written. Send deltas in `sequence` order; `done: true` closes the reply. A reply holds at most 4000 characters.",
      scope: "messages:write",
      body: messageDeltaDoc,
      responses: { 200: { description: "The message so far", schema: messageView } },
      errors: {
        400: ["INVALID_MESSAGE", "MESSAGE_TOO_LONG"],
        404: ["THREAD_NOT_FOUND", "MESSAGE_NOT_FOUND"],
        409: ["MESSAGE_CLOSED", "STREAM_SEQUENCE_GAP"],
      },
    }),
    async (c) =>
      c.json(
        await c.var.cradle.presaleService.appendMessageDelta(
          await providerApp(c, "messages:write"),
          c.req.param("threadId"),
          c.req.param("messageId"),
          c.req.valid("json"),
        ),
      ),
  )
  .post(
    `${provider}/messages/:messageId/acks`,
    builderRoute({
      operationId: "acknowledgeMessage",
      tag: "Threads",
      summary: "Acknowledge a buyer message",
      description:
        "Removes a `thread.message` event from the feed. Until then the feed sends it again. Idempotent.",
      scope: "events:ack",
      responses: {
        200: { description: "Acknowledged", schema: z.object({ acknowledged: z.literal(true) }) },
      },
      errors: { 404: ["MESSAGE_NOT_FOUND"] },
    }),
    async (c) =>
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
    builderRoute({
      operationId: "createOffer",
      tag: "Threads",
      summary: "Make an offer",
      description:
        "Proposes a priced job in reply to a buyer. Offers are immutable, and a new one supersedes the thread's open offer. The buyer accepts it by turning it into a quote and paying; the conversation so far is hashed into it. Every term except delivery time comes from the command's revision.",
      scope: "offers:write",
      body: offerDoc,
      responses: { 201: { description: "The open offer", schema: offerView } },
      errors: {
        400: [
          "INVALID_OFFER",
          "INVALID_DELIVERY_SECONDS",
          "INVALID_ARGUMENTS",
          "INVALID_ARGUMENT_FILES",
        ],
        404: ["THREAD_NOT_FOUND", "COMMAND_NOT_FOUND"],
        409: ["IDEMPOTENCY_CONFLICT", "NO_BUYER_REQUEST", "OFFER_CONFLICT"],
        422: ["PRICE_ABOVE_MAX", "PRICE_BELOW_FLOOR", "POLICY_NOT_CONFIGURED"],
      },
    }),
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
  .post(
    `${provider}/offers/:offerId/withdrawals`,
    builderRoute({
      operationId: "withdrawOffer",
      tag: "Threads",
      summary: "Withdraw an offer",
      description: "Closes an open offer before the buyer accepts it.",
      scope: "offers:write",
      responses: { 200: { description: "The withdrawn offer", schema: offerView } },
      errors: { 404: ["OFFER_NOT_FOUND"], 409: ["OFFER_NOT_OPEN"] },
    }),
    async (c) =>
      c.json(
        await c.var.cradle.presaleService.withdrawOffer(
          await providerApp(c, "offers:write"),
          c.req.param("threadId"),
          c.req.param("offerId"),
        ),
      ),
  );
