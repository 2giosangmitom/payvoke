import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { ApiHttpError } from "../../identity/http/identity-http.js";
import { ApiErrorSchema } from "../../identity/http/identity.schemas.js";
import { principalOf, requireAuth } from "../../identity/http/require-auth.js";
import { CommerceError, type Order, type Quote } from "../domain/commerce.js";
import { IdParams, OrderInput, OrderView, QuoteInput, QuoteView } from "./commerce.schemas.js";

const security = [{ bearer: [] }];
const errors = {
  400: ApiErrorSchema,
  401: ApiErrorSchema,
  403: ApiErrorSchema,
  404: ApiErrorSchema,
  409: ApiErrorSchema,
};
function quoteView(quote: Quote) {
  return {
    id: quote.id,
    digest: quote.digest,
    terms: quote.terms,
    expiresAt: quote.expiresAt.toISOString(),
    createdAt: quote.createdAt.toISOString(),
    paymentEnabled: false as const,
    executionEnabled: false as const,
  };
}
function orderView(order: Order) {
  return {
    id: order.id,
    operationId: order.operationId,
    quoteId: order.quoteId,
    quoteDigest: order.quoteDigest,
    status: order.status,
    createdAt: order.createdAt.toISOString(),
    paymentEnabled: false as const,
    executionEnabled: false as const,
  };
}
function commerceFailure(error: unknown): never {
  if (error instanceof CommerceError)
    throw new ApiHttpError(
      { code: error.code, message: error.message },
      { NOT_FOUND: 404, CONFLICT: 409, INVALID_INPUT: 400, UNAVAILABLE: 409 }[error.code],
    );
  throw error;
}

export const commerceRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.post(
    "/v1/quotes",
    {
      bodyLimit: 32768,
      preHandler: requireAuth,
      schema: { security, body: QuoteInput, response: { 200: QuoteView, ...errors } },
    },
    async (req) => {
      try {
        return quoteView(
          await req.diScope.resolve("commerceService").quote(principalOf(req).accountId, req.body),
        );
      } catch (error) {
        return commerceFailure(error);
      }
    },
  );
  app.get(
    "/v1/quotes/:id",
    {
      preHandler: requireAuth,
      schema: { security, params: IdParams, response: { 200: QuoteView, ...errors } },
    },
    async (req) => {
      try {
        return quoteView(
          await req.diScope
            .resolve("commerceService")
            .getQuote(principalOf(req).accountId, req.params.id),
        );
      } catch (error) {
        return commerceFailure(error);
      }
    },
  );
  app.post(
    "/v1/orders",
    {
      preHandler: requireAuth,
      schema: { security, body: OrderInput, response: { 200: OrderView, ...errors } },
    },
    async (req) => {
      try {
        return orderView(
          await req.diScope.resolve("commerceService").order(principalOf(req).accountId, req.body),
        );
      } catch (error) {
        return commerceFailure(error);
      }
    },
  );
  app.get(
    "/v1/orders/:id",
    {
      preHandler: requireAuth,
      schema: { security, params: IdParams, response: { 200: OrderView, ...errors } },
    },
    async (req) => {
      try {
        return orderView(
          await req.diScope
            .resolve("commerceService")
            .getOrder(principalOf(req).accountId, req.params.id),
        );
      } catch (error) {
        return commerceFailure(error);
      }
    },
  );
};
