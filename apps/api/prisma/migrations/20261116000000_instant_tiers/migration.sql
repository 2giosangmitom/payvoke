-- Instant prices that rise with the size of the input. NULL keeps the single
-- instant price; existing revisions are unaffected.
ALTER TABLE "app_command_revisions" ADD COLUMN "instantTiers" JSONB;
