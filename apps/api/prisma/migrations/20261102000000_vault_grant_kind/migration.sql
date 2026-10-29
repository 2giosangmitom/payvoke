-- Who signs for a vault grant: a coding agent or one browser.
-- AlterTable
ALTER TABLE "vault_grants" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'agent';
