-- App keys no longer expire; they work until they are reset or revoked.
-- Keys that had already expired are revoked first, so none comes back to life.
UPDATE "app_api_keys" SET "revokedAt" = "expiresAt" WHERE "revokedAt" IS NULL AND "expiresAt" <= NOW();

-- AlterTable
ALTER TABLE "app_api_keys" DROP COLUMN "expiresAt";
