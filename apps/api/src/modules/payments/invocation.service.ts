import type { Cradle } from "../../container";
import { BadRequestError, ConflictError, GoneError, NotFoundError } from "../../errors";
import type { AccountIdentity } from "../auth/auth.service";

// Submission gates for a paid invocation, before any x402 processing.
export class InvocationService {
  private readonly db: Cradle["db"];
  private readonly quoteService: Cradle["quoteService"];

  constructor({ db, quoteService }: Cradle) {
    this.db = db;
    this.quoteService = quoteService;
  }

  // The invocation ID is the idempotency key. A submission that already has a
  // settlement operation bypasses expiry and availability so it can be replayed.
  async submittableQuote(buyer: AccountIdentity, quoteId: string, idempotencyKey: unknown) {
    const row = await this.db.quote.findFirst({
      where: { id: quoteId, buyerId: buyer.id },
      include: { thread: true, app: true, invocation: { include: { settlement: true } } },
    });
    if (!row || row.thread.buyerId !== buyer.id) throw new NotFoundError("QUOTE_NOT_FOUND");
    const quote = this.quoteService.document(row.document, buyer.walletAddress);
    if (idempotencyKey !== quote.invocationId)
      throw new BadRequestError("IDEMPOTENCY_KEY_REQUIRED");
    if (!row.invocation?.settlement) {
      if (row.thread.archivedAt) throw new NotFoundError("QUOTE_NOT_FOUND");
      if (row.app.status !== "ACTIVE" || row.app.archivedAt)
        throw new ConflictError("APP_UNAVAILABLE");
      if (quote.validUntil <= Math.floor(Date.now() / 1000)) throw new GoneError("QUOTE_EXPIRED");
    }
    return quote;
  }
}
