import type { FastifyInstance } from "fastify";
import type {
  BuyerMessageRoute,
  DeclineRoute,
  MessageAckRoute,
  OfferRoute,
  ProviderMessageRoute,
  WithdrawRoute,
} from "./presale.controller";

const provider = "/v1/provider/apps/:appId/threads/:threadId";

export async function presaleRoutes(app: FastifyInstance) {
  const { presaleController: c } = app.diContainer.cradle;
  const buyer = { preHandler: app.requireAccount };

  // Free messages still cost the provider compute: bound them per buyer.
  app.post<BuyerMessageRoute>(
    "/v1/threads/:threadId/messages",
    { ...buyer, bodyLimit: 32768, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    c.sendBuyerMessage,
  );
  app.post<DeclineRoute>("/v1/threads/:threadId/offers/:offerId/declines", buyer, c.decline);

  // Provider worker: app key auth in the controller.
  app.post<ProviderMessageRoute>(
    `${provider}/messages`,
    { bodyLimit: 32768 },
    c.sendProviderMessage,
  );
  app.post<MessageAckRoute>(`${provider}/messages/:messageId/acks`, c.acknowledge);
  app.post<OfferRoute>(`${provider}/offers`, { bodyLimit: 65536 }, c.offer);
  app.post<WithdrawRoute>(`${provider}/offers/:offerId/withdrawals`, c.withdraw);
}
