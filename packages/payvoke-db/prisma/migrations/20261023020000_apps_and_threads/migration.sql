-- Destructive marketplace reset: apps and chat threads replace the pre-release
-- provider/product/version/session model. The repo has not shipped, so this
-- migration intentionally drops the old catalog tables instead of backfilling.
ALTER TABLE "invocations" DROP CONSTRAINT IF EXISTS "invocations_quoteId_fkey";

DROP TABLE IF EXISTS "quotes" CASCADE;
DROP TABLE IF EXISTS "collection_items" CASCADE;
DROP TABLE IF EXISTS "collections" CASCADE;
DROP TABLE IF EXISTS "product_stars" CASCADE;
DROP TABLE IF EXISTS "usage_sessions" CASCADE;
DROP TABLE IF EXISTS "command_versions" CASCADE;
DROP TABLE IF EXISTS "product_versions" CASCADE;
DROP TABLE IF EXISTS "products" CASCADE;
DROP TABLE IF EXISTS "provider_api_keys" CASCADE;
DROP TABLE IF EXISTS "provider_apps" CASCADE;

-- CreateTable
CREATE TABLE "apps" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'PUBLIC',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "payoutAddress" TEXT NOT NULL,
    "defaultCommandId" TEXT,
    "lastHeartbeatAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "apps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_api_keys" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_commands" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "activeRevisionId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_commands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_command_revisions" (
    "id" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "inputSchema" JSONB NOT NULL,
    "outputSchema" JSONB,
    "positionalParameter" TEXT,
    "grossAmount" DECIMAL(78,0) NOT NULL,
    "terms" JSONB NOT NULL,
    "deliverySeconds" INTEGER NOT NULL,
    "reviewSeconds" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_command_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_threads" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "title" TEXT,
    "clientRequestId" TEXT NOT NULL,
    "activeQuoteId" TEXT,
    "quoteLockVersion" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_stars" (
    "userId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_stars_pkey" PRIMARY KEY ("userId","appId")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "invocationId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "commandRevisionId" TEXT,
    "clientRequestId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "document" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- Rename AG-UI ownership from the old session term to thread.
ALTER TABLE "agui_stream_events" RENAME COLUMN "sessionId" TO "threadId";
ALTER INDEX IF EXISTS "agui_stream_events_sessionId_cursor_idx" RENAME TO "agui_stream_events_threadId_cursor_idx";

-- CreateIndex
CREATE UNIQUE INDEX "apps_ownerId_clientRequestId_key" ON "apps"("ownerId", "clientRequestId");
CREATE INDEX "apps_visibility_status_id_idx" ON "apps"("visibility", "status", "id");
CREATE INDEX "apps_ownerId_createdAt_idx" ON "apps"("ownerId", "createdAt");

CREATE UNIQUE INDEX "app_api_keys_prefix_key" ON "app_api_keys"("prefix");
CREATE UNIQUE INDEX "app_api_keys_secretHash_key" ON "app_api_keys"("secretHash");
CREATE INDEX "app_api_keys_appId_revokedAt_idx" ON "app_api_keys"("appId", "revokedAt");
CREATE UNIQUE INDEX "app_api_keys_one_active_per_app" ON "app_api_keys"("appId") WHERE "revokedAt" IS NULL;

CREATE UNIQUE INDEX "apps_defaultCommandId_key" ON "apps"("defaultCommandId");
CREATE UNIQUE INDEX "app_commands_appId_name_key" ON "app_commands"("appId", "name");
CREATE INDEX "app_commands_appId_archivedAt_idx" ON "app_commands"("appId", "archivedAt");
CREATE UNIQUE INDEX "app_commands_activeRevisionId_key" ON "app_commands"("activeRevisionId");
CREATE INDEX "app_command_revisions_commandId_createdAt_idx" ON "app_command_revisions"("commandId", "createdAt");

CREATE UNIQUE INDEX "chat_threads_buyerId_clientRequestId_key" ON "chat_threads"("buyerId", "clientRequestId");
CREATE UNIQUE INDEX "chat_threads_activeQuoteId_key" ON "chat_threads"("activeQuoteId");
CREATE INDEX "chat_threads_buyerId_archivedAt_updatedAt_idx" ON "chat_threads"("buyerId", "archivedAt", "updatedAt");
CREATE INDEX "chat_threads_appId_idx" ON "chat_threads"("appId");

CREATE INDEX "app_stars_userId_createdAt_idx" ON "app_stars"("userId", "createdAt");

CREATE UNIQUE INDEX "quotes_invocationId_key" ON "quotes"("invocationId");
CREATE UNIQUE INDEX "quotes_buyerId_clientRequestId_key" ON "quotes"("buyerId", "clientRequestId");
CREATE INDEX "quotes_sessionId_validUntil_idx" ON "quotes"("sessionId", "validUntil");
CREATE INDEX "quotes_appId_idx" ON "quotes"("appId");

-- AddForeignKey
ALTER TABLE "app_api_keys" ADD CONSTRAINT "app_api_keys_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app_commands" ADD CONSTRAINT "app_commands_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_command_revisions" ADD CONSTRAINT "app_command_revisions_commandId_fkey" FOREIGN KEY ("commandId") REFERENCES "app_commands"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "apps" ADD CONSTRAINT "apps_defaultCommandId_fkey" FOREIGN KEY ("defaultCommandId") REFERENCES "app_commands"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app_commands" ADD CONSTRAINT "app_commands_activeRevisionId_fkey" FOREIGN KEY ("activeRevisionId") REFERENCES "app_command_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app_stars" ADD CONSTRAINT "app_stars_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "chat_threads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_commandRevisionId_fkey" FOREIGN KEY ("commandRevisionId") REFERENCES "app_command_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invocations" ADD CONSTRAINT "invocations_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
