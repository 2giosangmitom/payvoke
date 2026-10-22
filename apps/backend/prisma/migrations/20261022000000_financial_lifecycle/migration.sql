-- CreateEnum
CREATE TYPE "FinanceDecisionState" AS ENUM ('APPROVED', 'REJECTED', 'RESERVED', 'SIGNED', 'BROADCAST', 'UNKNOWN', 'FINALIZED', 'REVERTED', 'QUARANTINED');

-- CreateTable
CREATE TABLE "vault_financial_health" (
    "id" TEXT NOT NULL,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vault_financial_health_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vault_hold_projections" (
    "holdId" TEXT NOT NULL,
    "vault" TEXT NOT NULL,
    "invocationId" TEXT,
    "status" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "version" BIGINT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "blockHash" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vault_hold_projections_pkey" PRIMARY KEY ("holdId")
);

-- CreateTable
CREATE TABLE "vault_financial_events" (
    "id" TEXT NOT NULL,
    "vault" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "holdId" TEXT,
    "transactionHash" TEXT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "blockHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "vault_financial_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_delivery_evidence" (
    "id" TEXT NOT NULL,
    "invocationId" TEXT NOT NULL,
    "artifactVersion" INTEGER NOT NULL,
    "outputHash" TEXT NOT NULL,
    "verifier" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "accessInterruptionSeconds" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_delivery_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_decisions" (
    "id" TEXT NOT NULL,
    "holdId" TEXT NOT NULL,
    "vault" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "decision" JSONB NOT NULL,
    "beforeHold" JSONB,
    "approver" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "evidenceId" TEXT,
    "reason" TEXT NOT NULL,
    "state" "FinanceDecisionState" NOT NULL DEFAULT 'APPROVED',
    "executor" TEXT,
    "nonce" BIGINT,
    "gasLimit" BIGINT,
    "maxFeePerGas" DECIMAL(78,0),
    "maxPriorityFeePerGas" DECIMAL(78,0),
    "signedTransaction" TEXT,
    "transactionHash" TEXT,
    "broadcastCount" INTEGER NOT NULL DEFAULT 0,
    "actualGasCost" DECIMAL(78,0),
    "receipt" JSONB,
    "finalizedAt" TIMESTAMP(3),
    "errorReason" TEXT,
    "leaseOwner" TEXT,
    "leaseEpoch" BIGINT NOT NULL DEFAULT 0,
    "leaseExpiresAt" TIMESTAMP(3),
    "nextCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revision" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_lanes" (
    "id" TEXT NOT NULL,
    "activeDecisionId" TEXT,
    "revision" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "finance_lanes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vault_hold_projections_invocationId_key" ON "vault_hold_projections"("invocationId");

-- CreateIndex
CREATE INDEX "vault_hold_projections_vault_blockNumber_idx" ON "vault_hold_projections"("vault", "blockNumber");

-- CreateIndex
CREATE INDEX "vault_financial_events_holdId_blockNumber_idx" ON "vault_financial_events"("holdId", "blockNumber");

-- CreateIndex
CREATE INDEX "payment_delivery_evidence_invocationId_observedAt_idx" ON "payment_delivery_evidence"("invocationId", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "finance_decisions_digest_key" ON "finance_decisions"("digest");

-- CreateIndex
CREATE UNIQUE INDEX "finance_decisions_transactionHash_key" ON "finance_decisions"("transactionHash");

-- CreateIndex
CREATE INDEX "finance_decisions_state_nextCheckAt_idx" ON "finance_decisions"("state", "nextCheckAt");

-- CreateIndex
CREATE INDEX "finance_decisions_executor_finalizedAt_idx" ON "finance_decisions"("executor", "finalizedAt");

-- CreateIndex
CREATE UNIQUE INDEX "finance_decisions_executor_nonce_key" ON "finance_decisions"("executor", "nonce");

-- CreateIndex
CREATE UNIQUE INDEX "finance_lanes_activeDecisionId_key" ON "finance_lanes"("activeDecisionId");
