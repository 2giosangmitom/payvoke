import type { FastifyInstance } from "fastify";
import { useFinancialJson } from "../../http/financial-json";
import type { PrepareQuoteRoute, QuoteRoute } from "./quote.controller";
import { prepareQuoteSchema } from "./quote.schemas";

// Encapsulated: the financial JSON parser applies to these routes only.
export async function quoteRoutes(app: FastifyInstance) {
  const { quoteController: c } = app.diContainer.cradle;
  useFinancialJson(app);

  app.post<PrepareQuoteRoute>(
    "/v1/quotes",
    {
      bodyLimit: 32768,
      preHandler: app.requireAccount,
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: prepareQuoteSchema,
    },
    c.prepare,
  );
  app.get<QuoteRoute>("/v1/quotes/:quoteId", { preHandler: app.requireAccount }, c.restore);
}
