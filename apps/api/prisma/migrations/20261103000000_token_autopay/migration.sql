-- An access token's spending policy: the vault grant its coding agent signs with.
-- AlterTable
ALTER TABLE "vault_grants" ADD COLUMN "tokenId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "vault_grants_tokenId_key" ON "vault_grants"("tokenId");
