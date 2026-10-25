import { getAddress } from "viem";
import type { PrismaClient } from "../generated/prisma/client";
import { integer } from "./fuji";
import type { PaymentRun } from "./payment";
import type { PreparedPayment } from "./payment";
import { readPaymentIntent } from "@payvoke/x402";

export type Seed = {
  run: PaymentRun;
  buyerId: string;
  productId: string;
  policyVersion: string;
  provider: string;
  feeRecipient: string;
  feeBps: number;
  quoteLifetimeSeconds: number;
  maxHoldSeconds: number;
  resolutionGraceSeconds: number;
  deliverySeconds: number;
  reviewSeconds: number;
  grossAmount: string;
  // Approved price floor (atomic USDC) covering sponsored hold + release gas.
  minGrossAmount: string;
};

// Fresh isolated database only. No upsert, catalog overwrite, deletion or
// production DB discovery from the normal runtime DATABASE_URL.
export function localSeedDatabase(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "postgresql:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !/^\/payvoke_fuji_[a-z0-9_]+$/.test(url.pathname)
  )
    throw new Error("Expected dedicated loopback payvoke_fuji_* database");
  return value;
}
export async function seedCeremony(db: PrismaClient, seed: Seed) {
  if (
    integer(seed.grossAmount) === 0n ||
    integer(seed.minGrossAmount) === 0n ||
    integer(seed.grossAmount) < integer(seed.minGrossAmount) ||
    integer(seed.grossAmount) > integer(seed.run.maxAmount) ||
    !Number.isSafeInteger(seed.feeBps) ||
    seed.feeBps < 0 ||
    seed.feeBps > 10000 ||
    [
      seed.quoteLifetimeSeconds,
      seed.maxHoldSeconds,
      seed.resolutionGraceSeconds,
      seed.deliverySeconds,
      seed.reviewSeconds,
    ].some((n) => !Number.isSafeInteger(n) || n < 1) ||
    seed.deliverySeconds + seed.reviewSeconds + seed.resolutionGraceSeconds > seed.maxHoldSeconds
  )
    throw new Error("Invalid test economics");
  const buyer = await db.walletAddress.findFirst({
    where: { userId: seed.buyerId, chainId: 43113, isPrimary: true },
  });
  if (!buyer || getAddress(buyer.address) !== getAddress(seed.run.buyer))
    throw new Error("Seed buyer must first authenticate through SIWE");
  await db.$transaction(async (tx) => {
    if ((await tx.deploymentPolicy.count()) || (await tx.app.count()))
      throw new Error("Fresh ceremony database required");
    const providerApp = await tx.app.create({
      data: {
        id: seed.productId,
        ownerId: seed.buyerId,
        clientRequestId: `ceremony-${seed.productId}`,
        name: "Isolated ceremony app",
        description: "Controlled payment test app",
        visibility: "PRIVATE",
        payoutAddress: getAddress(seed.provider),
        lastHeartbeatAt: new Date(),
      },
    });
    const command = await tx.appCommand.create({
      data: {
        id: seed.run.commandId,
        appId: providerApp.id,
        name: "run",
        description: "Controlled invocation",
      },
    });
    const revision = await tx.appCommandRevision.create({
      data: {
        commandId: command.id,
        options: [
          {
            name: "text",
            description: "Prompt text",
            type: "STRING",
            required: true,
          },
        ],
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: { text: { type: "string", minLength: 1 } },
          required: ["text"],
        },
        positionalParameter: "text",
        grossAmount: seed.grossAmount,
        deliverySeconds: seed.deliverySeconds,
        reviewSeconds: seed.reviewSeconds,
        terms: {
          deliverySeconds: seed.deliverySeconds,
          reviewSeconds: seed.reviewSeconds,
          revisionPolicy: {
            maxIncluded: 0,
            description: "Controlled payment test; no provider execution",
          },
          refundPolicy: "Buyer reclaims after resolveBy",
          sideEffects: "none",
          dataUse: "Test data only",
          verification: { minEvidence: "SIGN" },
        },
      },
    });
    await tx.appCommand.update({
      where: { id: command.id },
      data: { activeRevisionId: revision.id },
    });
    await tx.app.update({
      where: { id: providerApp.id },
      data: { defaultCommandId: command.id },
    });
    await tx.chatThread.create({
      data: {
        id: seed.run.threadId,
        buyerId: seed.buyerId,
        appId: providerApp.id,
        title: "Ceremony thread",
      },
    });
    await tx.deploymentPolicy.create({
      data: {
        version: seed.policyVersion,
        activeSlot: "active",
        vault: getAddress(seed.run.vault),
        feeBps: seed.feeBps,
        feeRecipient: getAddress(seed.feeRecipient),
        quoteLifetimeSeconds: seed.quoteLifetimeSeconds,
        maxHoldSeconds: seed.maxHoldSeconds,
        resolutionGraceSeconds: seed.resolutionGraceSeconds,
        minGrossAmount: seed.minGrossAmount,
      },
    });
  });
  return {
    threadId: seed.run.threadId,
    commandId: seed.run.commandId,
    appId: seed.productId,
    policyVersion: seed.policyVersion,
  };
}

export async function journalEvidence(db: PrismaClient, prepared: PreparedPayment, hash: string) {
  const intent = await readPaymentIntent(
    prepared.quote,
    prepared.paymentPayload,
    `${new URL(prepared.run.apiOrigin).origin}/v1/invocations`,
  );
  return db.$transaction(
    async (tx) => {
      const operation = await tx.settlementOperation.findUniqueOrThrow({
        where: { invocationId: prepared.quote.invocationId },
        include: { attempt: true, invocation: { include: { readyEvent: true } } },
      });
      const attempt = operation.attempt;
      if (
        operation.authorizationDigest !== intent.authorizationDigest ||
        operation.quoteDigest !== prepared.quote.quoteDigest ||
        operation.invocationKey !== prepared.quote.protocolQuote.invocationKey ||
        operation.state !== "HELD" ||
        attempt?.state !== "FINALIZED" ||
        attempt.transactionHash !== hash ||
        !attempt.finalizedAt ||
        attempt.receiptBlockNumber === null ||
        !attempt.receiptBlockHash ||
        attempt.finalizedBlockNumber === null ||
        !attempt.finalizedBlockHash ||
        attempt.actualGasCost === null
      )
        throw new Error("Journal not a finalized matching payment");
      const ready = operation.invocation.readyEvent;
      if (
        operation.errorReason === "hold_not_executable"
          ? !!ready || operation.invocation.executionStatus !== "NOT_STARTED"
          : operation.errorReason !== null ||
            !ready ||
            ready.quoteId !== prepared.quote.quoteId ||
            operation.invocation.executionStatus !== "QUEUED"
      )
        throw new Error("Ready handoff inconsistent");
      const lane = await tx.relayerLane.findUniqueOrThrow({
        where: { network_relayer: { network: attempt.network, relayer: attempt.relayer } },
      });
      if (lane.activeInvocationId === operation.invocationId)
        throw new Error("Finalized lane not released");
      return {
        invocationId: operation.invocationId,
        paymentStatus: operation.state,
        transactionHash: attempt.transactionHash,
        receiptBlock: attempt.receiptBlockNumber,
        receiptBlockHash: attempt.receiptBlockHash,
        finalizedBlock: attempt.finalizedBlockNumber,
        finalizedBlockHash: attempt.finalizedBlockHash,
        actualGasCostWei: attempt.actualGasCost.toFixed(0),
        readyEventCount: ready ? 1 : 0,
        executionStatus: operation.invocation.executionStatus,
        failure: operation.errorReason,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
