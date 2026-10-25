-- CreateEnum
CREATE TYPE "SettlementState" AS ENUM ('PENDING', 'HELD', 'REJECTED', 'QUARANTINED');

-- CreateEnum
CREATE TYPE "SettlementAttemptState" AS ENUM ('RESERVED', 'SIGNED', 'BROADCAST', 'UNKNOWN', 'CONFIRMED', 'FINALIZED', 'REVERTED');

-- CreateEnum
CREATE TYPE "InvocationExecutionStatus" AS ENUM ('NOT_STARTED', 'QUEUED');

-- CreateTable
CREATE TABLE "invocations" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "executionStatus" "InvocationExecutionStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_operations" (
    "invocationId" TEXT NOT NULL,
    "invocationKey" TEXT NOT NULL,
    "quoteDigest" TEXT NOT NULL,
    "authorizationDigest" TEXT NOT NULL,
    "recoveredSigner" TEXT NOT NULL,
    "paymentPayload" JSONB NOT NULL,
    "state" "SettlementState" NOT NULL DEFAULT 'PENDING',
    "errorReason" TEXT,
    "leaseOwner" TEXT,
    "leaseEpoch" BIGINT NOT NULL DEFAULT 0,
    "leaseExpiresAt" TIMESTAMP(3),
    "revision" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settlement_operations_pkey" PRIMARY KEY ("invocationId")
);

-- CreateTable
CREATE TABLE "settlement_attempts" (
    "id" TEXT NOT NULL,
    "invocationId" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "relayer" TEXT NOT NULL,
    "nonce" BIGINT NOT NULL,
    "gasLimit" BIGINT NOT NULL,
    "maxFeePerGas" DECIMAL(78,0) NOT NULL,
    "maxPriorityFeePerGas" DECIMAL(78,0) NOT NULL,
    "state" "SettlementAttemptState" NOT NULL DEFAULT 'RESERVED',
    "signedTransaction" TEXT,
    "transactionHash" TEXT,
    "broadcastAt" TIMESTAMP(3),
    "lastErrorReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settlement_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relayer_lanes" (
    "network" TEXT NOT NULL,
    "relayer" TEXT NOT NULL,
    "activeInvocationId" TEXT,
    "revision" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "relayer_lanes_pkey" PRIMARY KEY ("network","relayer")
);

-- CreateIndex
CREATE UNIQUE INDEX "invocations_quoteId_key" ON "invocations"("quoteId");

-- CreateIndex
CREATE INDEX "invocations_buyerId_createdAt_idx" ON "invocations"("buyerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_operations_invocationKey_key" ON "settlement_operations"("invocationKey");

-- CreateIndex
CREATE INDEX "settlement_operations_state_leaseExpiresAt_createdAt_idx" ON "settlement_operations"("state", "leaseExpiresAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_attempts_invocationId_key" ON "settlement_attempts"("invocationId");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_attempts_transactionHash_key" ON "settlement_attempts"("transactionHash");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_attempts_network_relayer_nonce_key" ON "settlement_attempts"("network", "relayer", "nonce");

-- CreateIndex
CREATE UNIQUE INDEX "relayer_lanes_activeInvocationId_key" ON "relayer_lanes"("activeInvocationId");

-- AddForeignKey
ALTER TABLE "invocations" ADD CONSTRAINT "invocations_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_operations" ADD CONSTRAINT "settlement_operations_invocationId_fkey" FOREIGN KEY ("invocationId") REFERENCES "invocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_attempts" ADD CONSTRAINT "settlement_attempts_invocationId_fkey" FOREIGN KEY ("invocationId") REFERENCES "settlement_operations"("invocationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_attempts" ADD CONSTRAINT "settlement_attempts_network_relayer_fkey" FOREIGN KEY ("network", "relayer") REFERENCES "relayer_lanes"("network", "relayer") ON DELETE RESTRICT ON UPDATE CASCADE;
