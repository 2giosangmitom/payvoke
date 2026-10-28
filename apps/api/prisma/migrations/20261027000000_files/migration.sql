-- CreateTable
CREATE TABLE "file_assets" (
    "id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AWAITING_UPLOAD',
    "uploadScope" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "ownerId" TEXT,
    "threadId" TEXT,
    "appId" TEXT,
    "invocationId" TEXT,
    "name" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "sha256" TEXT NOT NULL,
    "stagingKey" TEXT NOT NULL,
    "objectKey" TEXT,
    "uploadExpiresAt" TIMESTAMP(3) NOT NULL,
    "readyAt" TIMESTAMP(3),
    "rejectionCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "file_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "file_assets_threadId_ownerId_idx" ON "file_assets"("threadId", "ownerId");

-- CreateIndex
CREATE INDEX "file_assets_invocationId_idx" ON "file_assets"("invocationId");

-- CreateIndex
CREATE INDEX "file_assets_status_uploadExpiresAt_idx" ON "file_assets"("status", "uploadExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "file_assets_uploadScope_clientRequestId_key" ON "file_assets"("uploadScope", "clientRequestId");

-- AddForeignKey
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "chat_threads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_invocationId_fkey" FOREIGN KEY ("invocationId") REFERENCES "invocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

