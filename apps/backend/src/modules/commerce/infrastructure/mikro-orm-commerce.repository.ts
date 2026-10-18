import {
  LockMode,
  UniqueConstraintViolationException,
  type EntityManager,
} from "@mikro-orm/postgresql";
import { AgentListing, ManifestVersion } from "../../publishing/domain/publishing.js";
import { ProviderProfile } from "../../publishing/domain/publishing.js";
import { CommandRevision } from "../../provider-gateway/domain/provider.js";
import { Workspace } from "../../workspace/domain/conversation.js";
import { AppUser } from "../../identity/domain/app-user.js";
import {
  CommerceError,
  Order,
  Quote,
  canonicalDigest,
  quoteTerms,
  type QuoteRequest,
} from "../domain/commerce.js";

const notFound = () =>
  new CommerceError("NOT_FOUND", "Quote, order, workspace, or agent not found.");
const conflict = (message: string) => new CommerceError("CONFLICT", message);

export class MikroOrmCommerceRepository {
  constructor(private readonly em: EntityManager) {}

  async quote(buyerId: string, input: QuoteRequest): Promise<Quote> {
    const requestDigest = canonicalDigest(input);
    try {
      return await this.em.transactional(async (em) => {
        const existing = await em.findOne(Quote, input.id);
        if (existing) {
          if (existing.buyerId !== buyerId) throw notFound();
          if (existing.requestDigest !== requestDigest)
            throw conflict("Quote ID already binds different terms.");
          return existing;
        }
        const workspace = await em.findOne(
          Workspace,
          { id: input.workspaceId, ownerId: buyerId },
          { lockMode: LockMode.PESSIMISTIC_READ },
        );
        if (!workspace) throw notFound();
        if (workspace.revision !== input.briefRevision)
          throw conflict("Workspace brief changed. Request a new quote.");
        const listing = await em.findOne(AgentListing, input.listingId);
        if (!listing || listing.paused || listing.publishedVersionId !== input.versionId)
          throw new CommerceError("UNAVAILABLE", "Agent version is no longer published.");
        const provider = await em.findOne(ProviderProfile, listing.providerId);
        if (!provider || !(await em.findOne(AppUser, { id: provider.id, status: "active" })))
          throw new CommerceError("UNAVAILABLE", "Provider is unavailable.");
        const version = await em.findOne(ManifestVersion, {
          id: input.versionId,
          listingId: listing.id,
          state: "approved",
        });
        if (!version) throw new CommerceError("UNAVAILABLE", "Agent version is not approved.");
        const commands =
          version.manifest.schemaVersion === 2
            ? (
                await em.findOne(CommandRevision, {
                  id: version.manifest.gateway.commandRevisionId,
                  applicationId: version.manifest.gateway.applicationId,
                })
              )?.commands
            : undefined;
        const terms = quoteTerms(
          input,
          version.manifest,
          version.digest,
          listing.providerId,
          workspace.brief,
          commands,
        );
        const quote = Object.assign(new Quote(), {
          id: input.id,
          buyerId,
          requestDigest,
          terms,
          digest: canonicalDigest({ schemaVersion: 1, terms }),
          expiresAt: new Date(Date.now() + 15 * 60_000),
        });
        await em.persist(quote).flush();
        return quote;
      });
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException) {
        const existing = await this.em.findOne(Quote, input.id);
        if (existing?.buyerId === buyerId && existing.requestDigest === requestDigest)
          return existing;
        throw conflict("Quote ID already binds different terms.");
      }
      throw error;
    }
  }

  async getQuote(buyerId: string, id: string) {
    const quote = await this.em.findOne(Quote, { id, buyerId });
    if (!quote) throw notFound();
    return quote;
  }

  async order(
    buyerId: string,
    input: { id: string; operationId: string; quoteId: string; quoteDigest: string },
  ) {
    try {
      return await this.em.transactional(async (em) => {
        const byOperation = await em.findOne(Order, { buyerId, operationId: input.operationId });
        if (byOperation) {
          if (
            byOperation.id !== input.id ||
            byOperation.quoteId !== input.quoteId ||
            byOperation.quoteDigest !== input.quoteDigest
          )
            throw conflict("Operation ID already binds another order.");
          return byOperation;
        }
        const quote = await em.findOne(
          Quote,
          { id: input.quoteId, buyerId },
          { lockMode: LockMode.PESSIMISTIC_WRITE },
        );
        if (!quote) throw notFound();
        const existing = await em.findOne(Order, { quoteId: quote.id });
        if (existing) {
          if (
            existing.id === input.id &&
            existing.operationId === input.operationId &&
            existing.quoteDigest === input.quoteDigest
          )
            return existing;
          throw conflict("A quote can have only one order.");
        }
        if (quote.digest !== input.quoteDigest) throw conflict("Quote terms changed.");
        if (quote.expiresAt.getTime() <= Date.now())
          throw conflict("Quote expired. Request a new quote.");
        const terms = quote.terms;
        const workspace = await em.findOne(Workspace, { id: terms.workspaceId, ownerId: buyerId });
        if (
          !workspace ||
          workspace.revision !== terms.briefRevision ||
          canonicalDigest(workspace.brief) !== terms.briefDigest
        )
          throw conflict("Workspace brief changed. Request a new quote.");
        const listing = await em.findOne(AgentListing, terms.listingId);
        if (
          !listing ||
          listing.paused ||
          listing.publishedVersionId !== terms.versionId ||
          !(await em.findOne(AppUser, { id: terms.providerId, status: "active" }))
        )
          throw new CommerceError("UNAVAILABLE", "Agent version is no longer available.");
        const order = Object.assign(new Order(), {
          id: input.id,
          buyerId,
          operationId: input.operationId,
          quoteId: quote.id,
          quoteDigest: quote.digest,
        });
        await em.persist(order).flush();
        return order;
      });
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException) {
        const existing = await this.em.findOne(Order, { buyerId, operationId: input.operationId });
        if (
          existing?.id === input.id &&
          existing.quoteId === input.quoteId &&
          existing.quoteDigest === input.quoteDigest
        )
          return existing;
        throw conflict("Order or operation ID is already in use.");
      }
      throw error;
    }
  }

  async getOrder(buyerId: string, id: string) {
    const order = await this.em.findOne(Order, { id, buyerId });
    if (!order) throw notFound();
    return order;
  }
}
