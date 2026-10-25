import type { Cradle } from "@fastify/awilix";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { FinancialIntentBody } from "./payment-status.service";

export type SubmitInvocationRoute = { Body: { quoteId: string } };
export type InvocationRoute = { Params: { id: string } };
export type FinancialIntentRoute = InvocationRoute & { Body: FinancialIntentBody };

export class PaymentsController {
  private readonly invocationService: Cradle["invocationService"];
  private readonly paymentGateway: Cradle["paymentGateway"];
  private readonly paymentStatusService: Cradle["paymentStatusService"];

  constructor({ invocationService, paymentGateway, paymentStatusService }: Cradle) {
    this.invocationService = invocationService;
    this.paymentGateway = paymentGateway;
    this.paymentStatusService = paymentStatusService;
  }

  // Without a PAYMENT-SIGNATURE this returns the 402 challenge. Only explicit
  // private-facilitator configuration enables settlement of a signed payment.
  submit = async (request: FastifyRequest<SubmitInvocationRoute>, reply: FastifyReply) => {
    const quote = await this.invocationService.submittableQuote(
      request.account!,
      request.body.quoteId,
      request.headers["idempotency-key"],
    );
    if (request.headers["payment-signature"] !== undefined)
      return this.paymentGateway.settle(quote, request, reply);
    return this.paymentGateway.challenge(quote, reply);
  };

  status = async (request: FastifyRequest<InvocationRoute>) =>
    this.paymentStatusService.status(request.account!.id, request.params.id);

  financialIntent = async (request: FastifyRequest<FinancialIntentRoute>) =>
    this.paymentStatusService.financialIntent(request.account!.id, request.params.id);
}
