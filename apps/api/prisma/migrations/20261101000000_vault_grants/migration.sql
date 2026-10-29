-- Names and signers of the vault grants buyers register from the console.
-- CreateTable
CREATE TABLE "vault_grants" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "buyer" TEXT NOT NULL,
    "signer" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vault_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vault_grants_userId_grantId_key" ON "vault_grants"("userId", "grantId");

-- CreateIndex
CREATE INDEX "vault_grants_userId_idx" ON "vault_grants"("userId");
