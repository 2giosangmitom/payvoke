-- AlterTable
ALTER TABLE "settlement_operations" ADD COLUMN     "nextCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "settlement_attempts" ADD COLUMN     "actualGasCost" DECIMAL(78,0),
ADD COLUMN     "broadcastCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "finalizedAt" TIMESTAMP(3),
ADD COLUMN     "finalizedBlockHash" TEXT,
ADD COLUMN     "finalizedBlockNumber" BIGINT,
ADD COLUMN     "receiptBlockHash" TEXT,
ADD COLUMN     "receiptBlockNumber" BIGINT;

-- CreateTable
CREATE TABLE "invocation_ready" (
    "invocationId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invocation_ready_pkey" PRIMARY KEY ("invocationId")
);

-- CreateTable
CREATE TABLE "settlement_scan_cursors" (
    "id" TEXT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "blockHash" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settlement_scan_cursors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_incidents" (
    "id" TEXT NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "invocationKey" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlement_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "settlement_attempts_network_relayer_finalizedAt_idx" ON "settlement_attempts"("network", "relayer", "finalizedAt");

-- AddForeignKey
ALTER TABLE "invocation_ready" ADD CONSTRAINT "invocation_ready_invocationId_fkey" FOREIGN KEY ("invocationId") REFERENCES "invocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
