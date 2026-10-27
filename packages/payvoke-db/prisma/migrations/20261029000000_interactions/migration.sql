-- Prices now always come from the bot's offer; a command keeps only an
-- optional cap (maxGrossAmount). Apps lose their kind.
-- AlterTable
ALTER TABLE "app_command_revisions" DROP COLUMN "grossAmount",
DROP COLUMN "minGrossAmount";

-- AlterTable
ALTER TABLE "apps" DROP COLUMN "kind";

-- AlterTable
ALTER TABLE "thread_messages" ADD COLUMN     "form" JSONB,
ADD COLUMN     "replyToId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "thread_messages_replyToId_key" ON "thread_messages"("replyToId");

-- AddForeignKey
ALTER TABLE "thread_messages" ADD CONSTRAINT "thread_messages_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "thread_messages"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

