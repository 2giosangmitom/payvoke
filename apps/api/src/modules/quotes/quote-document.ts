import { randomUUID } from "node:crypto";
import {
  businessKey,
  hashQuote,
  hashSnapshot,
  vaultDomain,
  type InvocationQuote,
  type Json,
} from "@payvoke/protocol";
import {
  ASSET,
  NETWORK,
  validateQuoteDocument,
  wireQuote,
  type QuoteDocument,
} from "@payvoke/x402";
import type { AppCommandRevision, DeploymentPolicy } from "@payvoke/db";
import type { FileManifestEntry } from "@payvoke/payments/files";
import { getAddress, type Address } from "viem";
import { ServiceUnavailableError } from "../../errors";
import type { TranscriptMessage } from "./transcript";

export type QuoteOffer = {
  offerId: string;
  summary: string;
  conversation: Json;
  conversationHash: string;
};

export type QuoteInput = {
  vault: Address;
  buyer: string;
  threadId: string;
  product: { id: string; payoutAddress: string };
  commandId: string;
  revision: AppCommandRevision;
  // The accepted offer's price and delivery time.
  grossAmount: bigint;
  deliverySeconds: number;
  offer: QuoteOffer | null;
  policy: DeploymentPolicy;
  schema: Json;
  effectiveArguments: Record<string, Json>;
  history: TranscriptMessage[];
  // READY buyer files; their digests, never URLs, enter the input hash.
  files: FileManifestEntry[];
  now: number;
};

// Deadlines chain from the quote expiry: delivery, then review, then the
// resolution grace window. The whole hold must fit the policy's maximum.
export function quoteDeadlines(
  revision: Pick<AppCommandRevision, "deliverySeconds" | "reviewSeconds">,
  policy: Pick<
    DeploymentPolicy,
    "quoteLifetimeSeconds" | "resolutionGraceSeconds" | "maxHoldSeconds"
  >,
  now: number,
) {
  const validUntil = now + policy.quoteLifetimeSeconds;
  const deliveryDeadline = validUntil + revision.deliverySeconds;
  const releaseNotBefore = deliveryDeadline + revision.reviewSeconds;
  const resolveBy = releaseNotBefore + policy.resolutionGraceSeconds;
  if (resolveBy - now > policy.maxHoldSeconds)
    throw new ServiceUnavailableError("HOLD_DURATION_EXCEEDED");
  return { validUntil, deliveryDeadline, releaseNotBefore, resolveBy };
}

// Freezes input, terms and policy snapshots and signs nothing: the EIP-712
// quote digest is what the buyer's grant signer later authorizes.
export function buildQuoteDocument(input: QuoteInput): QuoteDocument {
  const { vault, threadId, product, commandId, revision, policy, now } = input;
  const version = { number: 1 };
  const { validUntil, deliveryDeadline, releaseNotBefore, resolveBy } = quoteDeadlines(
    { deliverySeconds: input.deliverySeconds, reviewSeconds: revision.reviewSeconds },
    policy,
    now,
  );
  const quoteId = randomUUID();
  const invocationId = randomUUID();
  const contextManifest = { messages: input.history, brief: null, files: input.files };
  // v2 freezes the accepted offer and its negotiation into the input hash.
  const inputSnapshot = {
    schemaVersion: input.offer ? 2 : 1,
    sessionId: threadId,
    productId: product.id,
    productVersion: version.number,
    commandId,
    commandSchemaHash: hashSnapshot(input.schema),
    arguments: input.effectiveArguments,
    context: contextManifest,
    ...(input.offer ? { offer: input.offer } : {}),
  };
  const termsSnapshot = {
    schemaVersion: 2,
    productId: product.id,
    productVersion: version.number,
    commandId,
    definition: {
      ...(revision.terms as Record<string, Json>),
      deliverySeconds: input.deliverySeconds,
    },
    deliveryDeadline,
  };
  const policySnapshot = {
    schemaVersion: 1,
    policyVersion: policy.version,
    feeBps: policy.feeBps,
    feeRecipient: getAddress(policy.feeRecipient),
    quoteLifetimeSeconds: policy.quoteLifetimeSeconds,
    maxHoldSeconds: policy.maxHoldSeconds,
    resolutionGraceSeconds: policy.resolutionGraceSeconds,
  };
  const protocol: InvocationQuote = {
    invocationKey: businessKey("invocation", invocationId),
    quoteKey: businessKey("quote", quoteId),
    buyer: getAddress(input.buyer),
    usageSessionKey: businessKey("session", threadId),
    productKey: businessKey("product", product.id),
    productVersion: BigInt(version.number),
    commandKey: businessKey("command", commandId),
    inputHash: hashSnapshot(inputSnapshot as unknown as Json),
    termsHash: hashSnapshot(termsSnapshot),
    policyHash: hashSnapshot(policySnapshot),
    provider: getAddress(product.payoutAddress),
    asset: ASSET,
    grossAmount: input.grossAmount,
    feeBps: policy.feeBps,
    feeRecipient: policySnapshot.feeRecipient,
    validUntil,
    deliveryDeadline,
    releaseNotBefore,
    resolveBy,
  };
  const quote: QuoteDocument = {
    quoteId,
    invocationId,
    sessionId: threadId,
    productId: product.id,
    productVersion: version.number,
    commandId,
    network: NETWORK,
    asset: ASSET,
    vault,
    providerPayout: protocol.provider,
    grossAmount: protocol.grossAmount.toString(),
    feeBps: policy.feeBps,
    feeRecipient: protocol.feeRecipient,
    validUntil,
    deliveryDeadline,
    releaseNotBefore,
    resolveBy,
    policyVersion: policy.version,
    quoteLifetimeSeconds: policy.quoteLifetimeSeconds,
    quoteDigest: hashQuote(vaultDomain(vault), protocol),
    inputHash: protocol.inputHash,
    termsHash: protocol.termsHash,
    policyHash: protocol.policyHash,
    effectiveArguments: input.effectiveArguments,
    contextManifest,
    inputSnapshot,
    termsSnapshot,
    policySnapshot,
    protocolQuote: wireQuote(protocol),
  };
  validateQuoteDocument(quote, vault, protocol.buyer);
  return quote;
}
