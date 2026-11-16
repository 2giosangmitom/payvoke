-- Instant (fixed-price) commands bought over x402 without a chat. A NULL
-- price keeps a command chat-only; every existing thread stays a CHAT thread.
ALTER TABLE "app_command_revisions" ADD COLUMN "instantGrossAmount" DECIMAL(78,0);
ALTER TABLE "chat_threads" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'CHAT';
