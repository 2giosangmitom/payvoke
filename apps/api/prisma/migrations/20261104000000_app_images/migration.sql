-- An agent's picture, and payouts that always go to the owner's wallet.
-- AlterTable
ALTER TABLE "apps" ADD COLUMN "imageKey" TEXT,
ADD COLUMN "imageType" TEXT;

-- Existing agents are paid to their owner's primary Fuji wallet from now on.
UPDATE "apps" AS a
SET "payoutAddress" = w."address"
FROM "walletAddress" AS w
WHERE w."userId" = a."ownerId" AND w."chainId" = 43113 AND w."isPrimary" = true;
