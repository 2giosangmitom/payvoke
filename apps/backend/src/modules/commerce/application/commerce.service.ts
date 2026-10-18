import type { MikroOrmCommerceRepository } from "../infrastructure/mikro-orm-commerce.repository.js";
import type { QuoteRequest } from "../domain/commerce.js";

export class CommerceService {
  constructor(private readonly repository: MikroOrmCommerceRepository) {}

  quote(buyerId: string, request: QuoteRequest) {
    return this.repository.quote(buyerId, request);
  }
  getQuote(buyerId: string, id: string) {
    return this.repository.getQuote(buyerId, id);
  }
  order(
    buyerId: string,
    request: { id: string; operationId: string; quoteId: string; quoteDigest: string },
  ) {
    return this.repository.order(buyerId, request);
  }
  getOrder(buyerId: string, id: string) {
    return this.repository.getOrder(buyerId, id);
  }
}
