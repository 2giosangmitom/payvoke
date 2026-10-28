-- AlterTable
ALTER TABLE "app_command_revisions" ADD COLUMN     "maxGrossAmount" DECIMAL(78,0),
ADD COLUMN     "minGrossAmount" DECIMAL(78,0),
ALTER COLUMN "grossAmount" DROP NOT NULL;

-- AlterTable
ALTER TABLE "apps" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'TOOL';

-- CreateTable
CREATE TABLE "thread_messages" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "commandId" TEXT,
    "arguments" JSONB,
    "fileManifest" JSONB,
    "clientRequestId" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "thread_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "commandRevisionId" TEXT NOT NULL,
    "arguments" JSONB NOT NULL,
    "grossAmount" DECIMAL(78,0) NOT NULL,
    "deliverySeconds" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "messageSeq" INTEGER NOT NULL,
    "conversationHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "quoteId" TEXT,
    "clientRequestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "thread_messages_threadId_role_acknowledgedAt_idx" ON "thread_messages"("threadId", "role", "acknowledgedAt");

-- CreateIndex
CREATE UNIQUE INDEX "thread_messages_threadId_seq_key" ON "thread_messages"("threadId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "thread_messages_threadId_role_clientRequestId_key" ON "thread_messages"("threadId", "role", "clientRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "offers_quoteId_key" ON "offers"("quoteId");

-- CreateIndex
CREATE INDEX "offers_threadId_createdAt_idx" ON "offers"("threadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "offers_appId_clientRequestId_key" ON "offers"("appId", "clientRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "offers_one_open_per_thread" ON "offers"("threadId") WHERE ("status" = 'OPEN');

-- AddForeignKey
ALTER TABLE "thread_messages" ADD CONSTRAINT "thread_messages_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "chat_threads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "chat_threads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_commandRevisionId_fkey" FOREIGN KEY ("commandRevisionId") REFERENCES "app_command_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Enumerations and value bounds Prisma cannot express.
ALTER TABLE "apps" ADD CONSTRAINT "apps_kind_check" CHECK ("kind" IN ('TOOL', 'AGENT'));
ALTER TABLE "thread_messages" ADD CONSTRAINT "thread_messages_role_check" CHECK ("role" IN ('BUYER', 'PROVIDER'));
ALTER TABLE "offers" ADD CONSTRAINT "offers_status_check" CHECK ("status" IN ('OPEN', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'SUPERSEDED'));
ALTER TABLE "offers" ADD CONSTRAINT "offers_amount_check" CHECK ("grossAmount" > 0 AND "deliverySeconds" > 0);
