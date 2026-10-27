import type { Cradle } from "@fastify/awilix";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { KeyScope } from "../provider/provider.validation";
import type { BuyerMessageBody, OfferBody, ProviderMessageBody } from "./presale.service";

type ProviderThread = { appId: string; threadId: string };
export type BuyerMessageRoute = { Params: { threadId: string }; Body?: BuyerMessageBody };
export type DeclineRoute = { Params: { threadId: string; offerId: string } };
export type ProviderMessageRoute = { Params: ProviderThread; Body?: ProviderMessageBody };
export type MessageAckRoute = { Params: ProviderThread & { messageId: string } };
export type OfferRoute = { Params: ProviderThread; Body?: OfferBody };
export type WithdrawRoute = { Params: ProviderThread & { offerId: string } };

export class PresaleController {
  private readonly presale: Cradle["presaleService"];
  private readonly keys: Cradle["providerKeyService"];

  constructor({ presaleService, providerKeyService }: Cradle) {
    this.presale = presaleService;
    this.keys = providerKeyService;
  }

  // Provider routes accept only an app key with the given scope.
  private app(request: FastifyRequest<{ Params: ProviderThread }>, scope: KeyScope) {
    return this.keys.authenticate(request.headers.authorization, request.params.appId, scope);
  }

  sendBuyerMessage = async (request: FastifyRequest<BuyerMessageRoute>, reply: FastifyReply) =>
    reply
      .code(201)
      .send(
        await this.presale.sendBuyerMessage(
          request.account!.id,
          request.params.threadId,
          request.body,
        ),
      );

  decline = async (request: FastifyRequest<DeclineRoute>) =>
    this.presale.declineOffer(request.account!.id, request.params.threadId, request.params.offerId);

  sendProviderMessage = async (
    request: FastifyRequest<ProviderMessageRoute>,
    reply: FastifyReply,
  ) =>
    reply
      .code(201)
      .send(
        await this.presale.sendProviderMessage(
          await this.app(request, "messages:write"),
          request.params.threadId,
          request.body,
        ),
      );

  acknowledge = async (request: FastifyRequest<MessageAckRoute>) =>
    this.presale.acknowledgeMessage(
      await this.app(request, "events:ack"),
      request.params.threadId,
      request.params.messageId,
    );

  offer = async (request: FastifyRequest<OfferRoute>, reply: FastifyReply) =>
    reply
      .code(201)
      .send(
        await this.presale.createOffer(
          await this.app(request, "offers:write"),
          request.params.threadId,
          request.body,
        ),
      );

  withdraw = async (request: FastifyRequest<WithdrawRoute>) =>
    this.presale.withdrawOffer(
      await this.app(request, "offers:write"),
      request.params.threadId,
      request.params.offerId,
    );
}
