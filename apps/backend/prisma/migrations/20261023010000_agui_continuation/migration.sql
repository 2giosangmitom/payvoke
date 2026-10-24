-- A single invocation may execute several AG-UI runs: the initial dispatch,
-- one continuation per buyer answer, and in-scope revisions. `invocations.runId`
-- is the single active run that may stream or report.
ALTER TABLE "provider_runs" DROP CONSTRAINT "provider_runs_pkey";
ALTER TABLE "provider_runs" ADD CONSTRAINT "provider_runs_pkey" PRIMARY KEY ("runId");
ALTER TABLE "provider_runs" ADD COLUMN "acknowledgedAt" TIMESTAMP(3);
CREATE INDEX "provider_runs_invocationId_updatedAt_idx" ON "provider_runs"("invocationId", "updatedAt");

ALTER TABLE "invocations" ADD COLUMN "runId" TEXT;
UPDATE "invocations" AS i
SET "runId" = r."runId"
FROM "provider_runs" AS r
WHERE r."invocationId" = i."id";
ALTER TABLE "invocations" ADD CONSTRAINT "invocations_runId_key" UNIQUE ("runId");
ALTER TABLE "invocations" ADD CONSTRAINT "invocations_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "provider_runs"("runId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "invocation_questions" (
  "id" TEXT NOT NULL,
  "invocationId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "inputSchema" JSONB NOT NULL,
  "chatTextParameter" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "answeredAt" TIMESTAMP(3),
  CONSTRAINT "invocation_questions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invocation_questions_invocationId_fkey" FOREIGN KEY ("invocationId") REFERENCES "invocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "invocation_questions_invocationId_questionId_key" ON "invocation_questions"("invocationId", "questionId");
CREATE INDEX "invocation_questions_invocationId_status_idx" ON "invocation_questions"("invocationId", "status");

CREATE TABLE "invocation_answers" (
  "id" TEXT NOT NULL,
  "invocationId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "buyerId" TEXT NOT NULL,
  "clientRequestId" VARCHAR(128) NOT NULL,
  "arguments" JSONB NOT NULL,
  "acknowledgedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invocation_answers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invocation_answers_invocationId_fkey" FOREIGN KEY ("invocationId") REFERENCES "invocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "invocation_answers_invocationId_questionId_fkey" FOREIGN KEY ("invocationId", "questionId") REFERENCES "invocation_questions"("invocationId", "questionId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "invocation_answers_invocationId_clientRequestId_key" ON "invocation_answers"("invocationId", "clientRequestId");
CREATE UNIQUE INDEX "invocation_answers_invocationId_questionId_key" ON "invocation_answers"("invocationId", "questionId");
CREATE INDEX "invocation_answers_buyerId_createdAt_idx" ON "invocation_answers"("buyerId", "createdAt");

CREATE TABLE "invocation_revisions" (
  "id" TEXT NOT NULL,
  "invocationId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "buyerId" TEXT NOT NULL,
  "clientRequestId" VARCHAR(128) NOT NULL,
  "reason" TEXT NOT NULL,
  "targetArtifactVersion" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'REQUESTED',
  "acknowledgedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invocation_revisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invocation_revisions_invocationId_fkey" FOREIGN KEY ("invocationId") REFERENCES "invocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "invocation_revisions_invocationId_clientRequestId_key" ON "invocation_revisions"("invocationId", "clientRequestId");
CREATE INDEX "invocation_revisions_buyerId_createdAt_idx" ON "invocation_revisions"("buyerId", "createdAt");
