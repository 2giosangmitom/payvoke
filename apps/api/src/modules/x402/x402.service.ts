import type { Cradle } from "../../container";
import { ASSET, NETWORK, SCHEME } from "@payvoke/shared/x402";
import { ConflictError, NotFoundError } from "../../errors";
import type { AccountIdentity } from "../auth/auth.service";
import { isAvailable } from "../apps/schema";
import { storedTiers } from "./pricing";
import { instantRequestHash, instantRequestId, type InstantRequest } from "../quotes/quote.service";

const CATALOG_LIMIT = 500;

// Instant (fixed-price) commands bought with the standard x402 round trip,
// with no chat. The quote, payment and job are the same as for a chat offer;
// only the offer is made by Payvoke, at the price the provider registered.
export class X402Service {
  private readonly db: Cradle["db"];
  private readonly config: Cradle["config"];
  private readonly quotes: Cradle["quoteService"];
  private readonly invocations: Cradle["invocationService"];

  constructor({ db, config, quoteService, invocationService }: Cradle) {
    this.db = db;
    this.config = config;
    this.quotes = quoteService;
    this.invocations = invocationService;
  }

  // The paid resource of one instant command. Quotes freeze it into their
  // terms, so a payment is accepted only at the URL that issued its quote.
  resource(appId: string, command: string) {
    return new URL(
      `/v1/x402/apps/${encodeURIComponent(appId)}/commands/${encodeURIComponent(command)}`,
      this.config.API_ORIGIN,
    ).href;
  }

  // An unpaid request: the quote to answer the 402 with, new or replayed.
  quote(buyer: AccountIdentity, request: InstantRequest, idempotencyKey: string) {
    return this.quotes.prepareInstant(
      buyer,
      request,
      idempotencyKey,
      this.resource(request.appId, request.command),
    );
  }

  // A paid request: the quote its 402 issued for this exact request, through
  // the same submission gates as a chat quote.
  async submittable(buyer: AccountIdentity, request: InstantRequest, idempotencyKey: string) {
    const row = await this.db.quote.findUnique({
      where: {
        buyerId_clientRequestId: {
          buyerId: buyer.id,
          clientRequestId: instantRequestId(idempotencyKey),
        },
      },
    });
    if (!row) throw new NotFoundError("QUOTE_NOT_FOUND");
    if (row.requestHash !== instantRequestHash(request))
      throw new ConflictError("IDEMPOTENCY_CONFLICT");
    // The invocation ID is the chat route's idempotency key; here the
    // Idempotency-Key already selected the quote.
    return this.invocations.submittableQuote(
      buyer,
      row.id,
      (row.document as { invocationId?: unknown }).invocationId,
    );
  }

  // Public list of what can be bought with x402 right now.
  async catalog() {
    const vault = this.quotes.vault();
    const policy = await this.db.deploymentPolicy.findUnique({ where: { activeSlot: "active" } });
    const floor = policy ? BigInt(policy.minGrossAmount.toFixed(0)) : null;
    const commands = await this.db.appCommand.findMany({
      where: {
        archivedAt: null,
        activeRevision: { instantGrossAmount: { not: null } },
        app: { visibility: "PUBLIC", status: "ACTIVE", archivedAt: null },
      },
      include: { activeRevision: true, app: true },
      orderBy: [{ appId: "asc" }, { name: "asc" }],
      take: CATALOG_LIMIT,
    });
    return {
      x402Version: 2,
      scheme: SCHEME,
      network: NETWORK,
      asset: ASSET,
      vault,
      items: commands.map(({ app, activeRevision, ...command }) => {
        const amount = BigInt(activeRevision!.instantGrossAmount!.toFixed(0));
        return {
          appId: app.id,
          appName: app.name,
          command: command.name,
          description: command.description,
          // The base price; `tiers` raise it for bigger inputs (see pricing.ts).
          amount: amount.toString(),
          tiers: storedTiers(activeRevision!.instantTiers),
          deliverySeconds: activeRevision!.deliverySeconds,
          reviewSeconds: activeRevision!.reviewSeconds,
          inputSchema: activeRevision!.inputSchema,
          resource: this.resource(app.id, command.name),
          // Online now, and priced at or above the current floor.
          available: isAvailable(app) && floor !== null && amount >= floor,
        };
      }),
    };
  }
}
