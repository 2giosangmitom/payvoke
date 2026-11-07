-- PayvokeVault v2: per-job escrow funded from buyer wallets.
-- Buyers no longer keep a vault balance. A job is funded by the buyer's USDC
-- authorization or by a grant pulling through the buyer's allowance, and grant
-- changes are relayed from buyer signatures.

-- CreateEnum
CREATE TYPE "FundingMode" AS ENUM ('AUTHORIZATION', 'GRANT');

-- CreateEnum
CREATE TYPE "GrantOperationKind" AS ENUM ('SET', 'REVOKE');

-- CreateEnum
CREATE TYPE "GrantOperationState" AS ENUM ('PENDING', 'SIGNED', 'BROADCAST', 'UNKNOWN', 'FINALIZED', 'REVERTED', 'REJECTED', 'QUARANTINED');

-- Work in flight against the v1 vault cannot continue on v2. Settled history
-- (HELD and its attempts) stays readable; unfinished operations close.
UPDATE "settlement_operations"
SET "state" = 'REJECTED', "errorReason" = 'vault_migrated', "leaseOwner" = NULL, "leaseExpiresAt" = NULL
WHERE "state" IN ('PENDING', 'QUARANTINED');

UPDATE "relayer_lanes" SET "activeInvocationId" = NULL;
UPDATE "finance_lanes" SET "activeDecisionId" = NULL;
UPDATE "finance_decisions"
SET "state" = 'QUARANTINED', "errorReason" = 'vault_migrated', "leaseOwner" = NULL, "leaseExpiresAt" = NULL
WHERE "state" IN ('APPROVED', 'RESERVED', 'SIGNED', 'BROADCAST', 'UNKNOWN');

-- Grants live in the vault; v1 grants do not exist on v2 and are registered again.
DELETE FROM "vault_grants";

-- AlterTable: existing rows were all grant debits.
ALTER TABLE "settlement_operations" ADD COLUMN "fundingMode" "FundingMode" NOT NULL DEFAULT 'GRANT',
ADD COLUMN "grantId" TEXT;
ALTER TABLE "settlement_operations" ALTER COLUMN "fundingMode" DROP DEFAULT;

-- AlterTable
ALTER TABLE "relayer_lanes" ADD COLUMN "activeGrantOperationId" TEXT;

-- CreateTable
CREATE TABLE "grant_operations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "buyer" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "kind" "GrantOperationKind" NOT NULL,
    "request" JSONB NOT NULL,
    "state" "GrantOperationState" NOT NULL DEFAULT 'PENDING',
    "errorReason" TEXT,
    "relayer" TEXT,
    "nonce" BIGINT,
    "gasLimit" BIGINT,
    "maxFeePerGas" DECIMAL(78,0),
    "maxPriorityFeePerGas" DECIMAL(78,0),
    "signedTransaction" TEXT,
    "transactionHash" TEXT,
    "broadcastCount" INTEGER NOT NULL DEFAULT 0,
    "actualGasCost" DECIMAL(78,0),
    "finalizedBlockNumber" BIGINT,
    "finalizedAt" TIMESTAMP(3),
    "leaseOwner" TEXT,
    "leaseEpoch" BIGINT NOT NULL DEFAULT 0,
    "leaseExpiresAt" TIMESTAMP(3),
    "nextCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grant_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "relayer_lanes_activeGrantOperationId_key" ON "relayer_lanes"("activeGrantOperationId");

-- CreateIndex
CREATE UNIQUE INDEX "grant_operations_transactionHash_key" ON "grant_operations"("transactionHash");

-- CreateIndex
CREATE INDEX "grant_operations_state_nextCheckAt_idx" ON "grant_operations"("state", "nextCheckAt");

-- CreateIndex
CREATE INDEX "grant_operations_userId_createdAt_idx" ON "grant_operations"("userId", "createdAt");
