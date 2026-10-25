-- AlterTable
ALTER TABLE "deployment_policies" ADD COLUMN     "minGrossAmount" DECIMAL(78,0) NOT NULL;

-- AlterTable
ALTER TABLE "payment_delivery_evidence" ADD COLUMN     "envelope" JSONB NOT NULL,
ADD COLUMN     "envelopeHash" TEXT NOT NULL,
ADD COLUMN     "evidenceLevel" TEXT NOT NULL;
