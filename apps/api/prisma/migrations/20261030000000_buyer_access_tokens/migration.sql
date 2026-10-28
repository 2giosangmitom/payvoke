-- Buyer personal access tokens, used by MCP hosts.
-- CreateTable
CREATE TABLE "buyer_access_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "buyer_access_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "buyer_access_tokens_prefix_key" ON "buyer_access_tokens"("prefix");

-- CreateIndex
CREATE UNIQUE INDEX "buyer_access_tokens_secretHash_key" ON "buyer_access_tokens"("secretHash");

-- CreateIndex
CREATE INDEX "buyer_access_tokens_userId_revokedAt_idx" ON "buyer_access_tokens"("userId", "revokedAt");
