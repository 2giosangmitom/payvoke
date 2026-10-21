-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "activeVersion" INTEGER,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_versions" (
    "productId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "payoutAddress" TEXT NOT NULL,

    CONSTRAINT "product_versions_pkey" PRIMARY KEY ("productId","number")
);

-- CreateTable
CREATE TABLE "command_versions" (
    "id" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productVersion" INTEGER NOT NULL,
    "inputSchema" JSONB NOT NULL,
    "grossAmount" DECIMAL(78,0) NOT NULL,
    "terms" JSONB NOT NULL,
    "deliverySeconds" INTEGER NOT NULL,
    "reviewSeconds" INTEGER NOT NULL,

    CONSTRAINT "command_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_sessions" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "activeQuoteId" TEXT,
    "quoteLockVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "usage_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deployment_policies" (
    "version" TEXT NOT NULL,
    "activeSlot" TEXT,
    "vault" TEXT NOT NULL,
    "feeBps" INTEGER NOT NULL,
    "feeRecipient" TEXT NOT NULL,
    "quoteLifetimeSeconds" INTEGER NOT NULL,
    "maxHoldSeconds" INTEGER NOT NULL,
    "resolutionGraceSeconds" INTEGER NOT NULL,

    CONSTRAINT "deployment_policies_pkey" PRIMARY KEY ("version")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "invocationId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "document" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "command_versions_productId_productVersion_commandId_key" ON "command_versions"("productId", "productVersion", "commandId");

-- CreateIndex
CREATE UNIQUE INDEX "usage_sessions_activeQuoteId_key" ON "usage_sessions"("activeQuoteId");

-- CreateIndex
CREATE INDEX "usage_sessions_buyerId_idx" ON "usage_sessions"("buyerId");

-- CreateIndex
CREATE UNIQUE INDEX "deployment_policies_activeSlot_key" ON "deployment_policies"("activeSlot");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_invocationId_key" ON "quotes"("invocationId");

-- CreateIndex
CREATE INDEX "quotes_sessionId_validUntil_idx" ON "quotes"("sessionId", "validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_buyerId_clientRequestId_key" ON "quotes"("buyerId", "clientRequestId");

-- AddForeignKey
ALTER TABLE "product_versions" ADD CONSTRAINT "product_versions_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "command_versions" ADD CONSTRAINT "command_versions_productId_productVersion_fkey" FOREIGN KEY ("productId", "productVersion") REFERENCES "product_versions"("productId", "number") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_sessions" ADD CONSTRAINT "usage_sessions_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "usage_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
