import type { FastifyInstance, FastifyReply } from "fastify";
import { useFinancialJson } from "../../http/financial-json";
import type {
  FinancialIntentRoute,
  InvocationListRoute,
  InvocationRoute,
  SubmitInvocationRoute,
} from "./payments.controller";
import {
  financialIntentSchema,
  invocationStatusSchema,
  submitInvocationSchema,
} from "./payments.schemas";

export async function paymentRoutes(app: FastifyInstance) {
  const { paymentsController: c } = app.diContainer.cradle;
  const noStore = {
    onRequest: async (_request: unknown, reply: FastifyReply) => {
      reply.cacheControl("no-store");
    },
  };

  // Paid submission shares the quote boundary: financial JSON, no-store.
  await app.register(async (checkout) => {
    useFinancialJson(checkout);
    checkout.post<SubmitInvocationRoute>(
      "/v1/invocations",
      {
        bodyLimit: 1024,
        preHandler: app.requireAccount,
        config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
        schema: submitInvocationSchema,
      },
      c.submit,
    );
  });

  app.get<InvocationListRoute>(
    "/v1/invocations",
    { ...noStore, preHandler: app.requireAccount },
    c.list,
  );
  app.get<InvocationRoute>(
    "/v1/invocations/:id",
    { ...noStore, preHandler: app.requireAccount, schema: invocationStatusSchema },
    c.status,
  );
  app.post<FinancialIntentRoute>(
    "/v1/invocations/:id/financial-intents",
    { ...noStore, preHandler: app.requireAccount, schema: financialIntentSchema },
    c.financialIntent,
  );
}
