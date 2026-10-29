-- The address of the vault grant signer derived from an API key's secret.
-- Null for keys issued before payments were signed with the key alone.
-- AlterTable
ALTER TABLE "buyer_access_tokens" ADD COLUMN "signer" TEXT;
