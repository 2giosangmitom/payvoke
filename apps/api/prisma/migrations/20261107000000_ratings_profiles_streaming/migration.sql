-- Star ratings of agents, public account profiles, and provider chat
-- replies that stream in before they are closed.

-- CreateTable
CREATE TABLE "app_ratings" (
    "userId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_ratings_pkey" PRIMARY KEY ("userId","appId"),
    CONSTRAINT "app_ratings_score_range" CHECK ("score" BETWEEN 1 AND 5)
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "userId" TEXT NOT NULL,
    "displayName" TEXT,
    "bio" TEXT,
    "imageKey" TEXT,
    "imageType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("userId")
);

-- AlterTable
ALTER TABLE "thread_messages" ADD COLUMN "streaming" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "streamSequence" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "app_ratings_appId_updatedAt_idx" ON "app_ratings"("appId", "updatedAt");

-- AddForeignKey
ALTER TABLE "app_ratings" ADD CONSTRAINT "app_ratings_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
