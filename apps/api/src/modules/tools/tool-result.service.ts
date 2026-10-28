import type { Cradle } from "../../container";
import { BadRequestError, NotFoundError } from "../../errors";
import { record } from "../apps/schema";

export type ToolResultBody = { toolCallId: string; result: unknown; clientRequestId: string };

// One buyer endpoint for every interactive part of a thread. The id names a
// tool a provider message opened, a tool a paid run opened, or an offer (whose
// only result here is a decline; accepting goes through a quote and payment).
export class ToolResultService {
  private readonly db: Cradle["db"];
  private readonly presale: Cradle["presaleService"];
  private readonly continuations: Cradle["continuationService"];

  constructor({ db, presaleService, continuationService }: Cradle) {
    this.db = db;
    this.presale = presaleService;
    this.continuations = continuationService;
  }

  async submit(buyerId: string, threadId: string, body: ToolResultBody) {
    const thread = await this.db.chatThread.findFirst({
      where: { id: threadId, buyerId },
      select: { id: true },
    });
    if (!thread) throw new NotFoundError("THREAD_NOT_FOUND");
    const offer = await this.db.offer.findFirst({
      where: { id: body.toolCallId, threadId },
      select: { id: true },
    });
    if (offer) {
      if (!record(body.result) || body.result.accepted !== false)
        throw new BadRequestError("INVALID_TOOL_RESULT");
      await this.presale.declineOffer(buyerId, threadId, offer.id);
      return { toolCallId: offer.id, status: "DECLINED" };
    }
    const message = await this.presale.submitToolResult(buyerId, threadId, body);
    if (message) return { toolCallId: body.toolCallId, status: "ANSWERED", message };
    const run = await this.continuations.submitToolResult(buyerId, threadId, body);
    if (run) return { ...run, status: "ANSWERED" };
    throw new NotFoundError("TOOL_CALL_NOT_FOUND");
  }
}
