import type { QuoteDocument } from "@payvoke/shared/x402";
import type { Cradle } from "../../container";
import { paymentPressure } from "../presale/payment-pressure";
import { holdOutcomes } from "../stats/hold-outcomes";
import { NEW_AGENT_JOBS } from "../stats/reputation";

// Why a quote that fits the grant's caps still goes to the buyer: the
// pre-payment decision layer of 402Pilot (Li et al.) plus the AP2 finding
// that agent-written text can steer an assistant into paying (Debi et al.).
// Every signal is computed from Payvoke's own records; none blocks a payment.
export type RiskSignal =
  | "payment_pressure"
  | "price_raised"
  | "price_spike"
  | "refund_rate"
  | "new_agent";

const USDC = 1_000_000n;
// A price this many times the command's median paid price is a spike.
export const SPIKE_FACTOR = 3n;
// Paid prices of the command the median is taken over, and the fewest needed.
export const PRICE_HISTORY = 20;
export const PRICE_HISTORY_MIN = 3;
// An agent with fewer than NEW_AGENT_JOBS paid jobs (the store shows it as
// new) autopays only up to NEW_AGENT_MAX.
export { NEW_AGENT_JOBS };
export const NEW_AGENT_MAX = 1n * USDC;
// Closed jobs the refund rate is taken over, the fewest needed, and the
// share (in percent) refunded or reclaimed that counts as high.
export const REFUND_HISTORY = 20;
export const REFUND_HISTORY_MIN = 5;
export const REFUND_RATE_PERCENT = 50;
// Agent messages in the thread scanned for payment pressure.
const MESSAGE_SCAN = 200;

const median = (values: bigint[]) => {
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2n;
};

export class PaymentRiskService {
  private readonly db: Cradle["db"];

  constructor({ db }: Cradle) {
    this.db = db;
  }

  /** The risk signals of a quote, most severe first; empty when it may autopay. */
  async assess(quoteId: string): Promise<RiskSignal[]> {
    const quote = await this.db.quote.findUnique({
      where: { id: quoteId },
      select: {
        threadId: true,
        appId: true,
        document: true,
        app: { select: { ownerId: true } },
        commandRevision: { select: { commandId: true } },
        offer: { select: { id: true, summary: true, arguments: true, createdAt: true } },
      },
    });
    // A quote this buyer cannot read is not one to pay without them.
    if (!quote) return ["payment_pressure"];
    const amount = BigInt((quote.document as QuoteDocument).grossAmount);
    // The owner's own purchases of their agent say nothing about it.
    const paid = {
      appId: quote.appId,
      buyerId: { not: quote.app.ownerId },
      invocation: { settlement: { state: "HELD" as const } },
    };

    const [pressure, previous, prices, jobs, closed] = await Promise.all([
      // The offer's summary and arguments are the agent's words too.
      this.pressure(
        quote.threadId,
        quote.offer ? `${quote.offer.summary}\n${JSON.stringify(quote.offer.arguments)}` : "",
      ),
      quote.offer
        ? this.db.offer.findFirst({
            where: {
              threadId: quote.threadId,
              id: { not: quote.offer.id },
              createdAt: { lte: quote.offer.createdAt },
            },
            orderBy: { createdAt: "desc" },
            select: { grossAmount: true, status: true },
          })
        : null,
      quote.commandRevision
        ? this.db.quote.findMany({
            where: {
              ...paid,
              id: { not: quoteId },
              commandRevision: { commandId: quote.commandRevision.commandId },
            },
            orderBy: { createdAt: "desc" },
            take: PRICE_HISTORY,
            select: { document: true },
          })
        : [],
      this.db.quote.count({ where: paid }),
      this.closedJobs(paid),
    ]);

    const signals: RiskSignal[] = [];
    if (pressure) signals.push("payment_pressure");
    // The agent replaced its own open offer with a dearer one; a buyer who
    // declined and asked again is negotiating, not being raised on.
    if (previous?.status === "SUPERSEDED" && BigInt(previous.grossAmount.toFixed(0)) < amount)
      signals.push("price_raised");
    if (prices.length >= PRICE_HISTORY_MIN) {
      const typical = median(
        prices.map((row) => BigInt((row.document as QuoteDocument).grossAmount)),
      );
      if (amount > typical * SPIKE_FACTOR) signals.push("price_spike");
    }
    if (
      closed.length >= REFUND_HISTORY_MIN &&
      closed.filter((outcome) => outcome === "refunded").length * 100 >=
        closed.length * REFUND_RATE_PERCENT
    )
      signals.push("refund_rate");
    if (jobs < NEW_AGENT_JOBS && amount > NEW_AGENT_MAX) signals.push("new_agent");
    return signals;
  }

  // Whether any text the agent wrote in the thread addresses the assistant.
  private async pressure(threadId: string, offer: string) {
    if (paymentPressure(offer).length) return true;
    const messages = await this.db.threadMessage.findMany({
      where: { threadId, role: "PROVIDER" },
      orderBy: { seq: "desc" },
      take: MESSAGE_SCAN,
      select: { content: true, tool: true },
    });
    return messages.some(
      (message) =>
        paymentPressure(message.content).length > 0 ||
        (message.tool !== null && paymentPressure(JSON.stringify(message.tool)).length > 0),
    );
  }

  // Outcomes of the agent's most recent jobs whose hold has closed.
  private async closedJobs(paid: object) {
    const rows = await this.db.quote.findMany({
      where: paid,
      orderBy: { createdAt: "desc" },
      take: REFUND_HISTORY * 3,
      select: { invocation: { select: { settlement: { select: { invocationKey: true } } } } },
    });
    const keys = rows.flatMap((row) => row.invocation?.settlement?.invocationKey ?? []);
    const outcome = await holdOutcomes(this.db, keys);
    return keys
      .map(outcome)
      .filter((value) => value !== "held")
      .slice(0, REFUND_HISTORY);
  }
}
