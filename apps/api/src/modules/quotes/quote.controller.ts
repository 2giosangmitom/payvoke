import type { Cradle } from "@fastify/awilix";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { PrepareQuoteBody } from "./quote.schemas";

export type PrepareQuoteRoute = { Body: PrepareQuoteBody };
export type QuoteRoute = { Params: { quoteId: string } };

export class QuoteController {
  private readonly quoteService: Cradle["quoteService"];

  constructor({ quoteService }: Cradle) {
    this.quoteService = quoteService;
  }

  prepare = async (request: FastifyRequest<PrepareQuoteRoute>, reply: FastifyReply) => {
    const quote = await this.quoteService.prepare(
      request.account!,
      request.body,
      request.headers["idempotency-key"],
    );
    return reply.code(201).send(quote);
  };

  restore = async (request: FastifyRequest<QuoteRoute>) =>
    this.quoteService.restore(request.account!, request.params.quoteId);
}
