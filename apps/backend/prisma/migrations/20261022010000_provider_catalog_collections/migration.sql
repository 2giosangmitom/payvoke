-- AlterTable
ALTER TABLE "products" ADD COLUMN     "description" TEXT,
ADD COLUMN     "name" TEXT,
ADD COLUMN     "providerAppId" TEXT;

-- AlterTable
ALTER TABLE "product_versions" ADD COLUMN     "chatTextParameter" TEXT,
ADD COLUMN     "defaultCommandId" TEXT,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "command_versions" ADD COLUMN     "description" TEXT,
ADD COLUMN     "name" TEXT,
ADD COLUMN     "outputSchema" JSONB,
ADD COLUMN     "positionalParameter" TEXT,
ADD COLUMN     "title" TEXT;

-- CreateTable
CREATE TABLE "provider_apps" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "payoutAddress" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_apps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_api_keys" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_stars" (
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_stars_pkey" PRIMARY KEY ("userId","productId")
);

-- CreateTable
CREATE TABLE "collections" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_items" (
    "collectionId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_items_pkey" PRIMARY KEY ("collectionId","productId")
);

-- CreateIndex
CREATE INDEX "provider_apps_ownerId_idx" ON "provider_apps"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "provider_apps_ownerId_clientRequestId_key" ON "provider_apps"("ownerId", "clientRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "provider_api_keys_prefix_key" ON "provider_api_keys"("prefix");

-- CreateIndex
CREATE UNIQUE INDEX "provider_api_keys_secretHash_key" ON "provider_api_keys"("secretHash");

-- CreateIndex
CREATE INDEX "provider_api_keys_appId_revokedAt_idx" ON "provider_api_keys"("appId", "revokedAt");

CREATE UNIQUE INDEX "provider_api_keys_one_active_per_app" ON "provider_api_keys"("appId") WHERE "revokedAt" IS NULL;

-- CreateIndex
CREATE INDEX "product_stars_userId_createdAt_idx" ON "product_stars"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "collections_ownerId_nameKey_key" ON "collections"("ownerId", "nameKey");

-- CreateIndex
CREATE UNIQUE INDEX "collections_id_ownerId_key" ON "collections"("id", "ownerId");

-- CreateIndex
CREATE INDEX "collection_items_ownerId_productId_idx" ON "collection_items"("ownerId", "productId");

-- CreateIndex
CREATE INDEX "products_status_kind_id_idx" ON "products"("status", "kind", "id");

-- AddForeignKey
ALTER TABLE "provider_api_keys" ADD CONSTRAINT "provider_api_keys_appId_fkey" FOREIGN KEY ("appId") REFERENCES "provider_apps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_providerAppId_fkey" FOREIGN KEY ("providerAppId") REFERENCES "provider_apps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_stars" ADD CONSTRAINT "product_stars_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_collectionId_ownerId_fkey" FOREIGN KEY ("collectionId", "ownerId") REFERENCES "collections"("id", "ownerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_ownerId_productId_fkey" FOREIGN KEY ("ownerId", "productId") REFERENCES "product_stars"("userId", "productId") ON DELETE CASCADE ON UPDATE CASCADE;
