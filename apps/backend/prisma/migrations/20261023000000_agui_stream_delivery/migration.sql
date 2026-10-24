ALTER TYPE "InvocationExecutionStatus" ADD VALUE IF NOT EXISTS 'ACKED';
ALTER TYPE "InvocationExecutionStatus" ADD VALUE IF NOT EXISTS 'RUNNING';
ALTER TYPE "InvocationExecutionStatus" ADD VALUE IF NOT EXISTS 'WAITING_BUYER';
ALTER TYPE "InvocationExecutionStatus" ADD VALUE IF NOT EXISTS 'VERIFYING';
ALTER TYPE "InvocationExecutionStatus" ADD VALUE IF NOT EXISTS 'DELIVERED';
ALTER TYPE "InvocationExecutionStatus" ADD VALUE IF NOT EXISTS 'FAILED';

ALTER TABLE "invocation_ready" ADD COLUMN "acknowledgedAt" TIMESTAMP(3);
ALTER TABLE "invocation_ready" ADD COLUMN "runId" TEXT NOT NULL DEFAULT gen_random_uuid()::text;

CREATE TABLE "provider_runs" (
  "invocationId" TEXT NOT NULL PRIMARY KEY,
  "runId" TEXT NOT NULL UNIQUE,
  "sequence" INTEGER NOT NULL DEFAULT 0,
  "reportSequence" INTEGER NOT NULL DEFAULT 0,
  "activeMessageId" TEXT,
  "state" TEXT NOT NULL DEFAULT 'QUEUED',
  "result" JSONB,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "provider_runs_invocationId_fkey" FOREIGN KEY ("invocationId") REFERENCES "invocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "agui_stream_events" (
  "cursor" BIGSERIAL NOT NULL PRIMARY KEY,
  "invocationId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "streamSequence" INTEGER,
  "sourceHash" TEXT,
  "event" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agui_stream_events_invocationId_fkey" FOREIGN KEY ("invocationId") REFERENCES "invocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "agui_stream_events_runId_streamSequence_key" ON "agui_stream_events"("runId", "streamSequence");
CREATE INDEX "agui_stream_events_sessionId_cursor_idx" ON "agui_stream_events"("sessionId", "cursor");

CREATE TABLE "agui_surfaces" (
  "runId" TEXT NOT NULL,
  "surfaceId" TEXT NOT NULL,
  "operations" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agui_surfaces_pkey" PRIMARY KEY ("runId", "surfaceId"),
  CONSTRAINT "agui_surfaces_runId_fkey" FOREIGN KEY ("runId") REFERENCES "provider_runs"("runId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "provider_reports" (
  "runId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "reportId" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  CONSTRAINT "provider_reports_pkey" PRIMARY KEY ("runId", "sequence"),
  CONSTRAINT "provider_reports_runId_fkey" FOREIGN KEY ("runId") REFERENCES "provider_runs"("runId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "provider_reports_runId_reportId_key" ON "provider_reports"("runId", "reportId");
