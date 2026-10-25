-- Generative UI moves from A2UI v0.9.1 operations to OpenUI Lang programs.
-- The AG-UI event log keeps text and lifecycle history; only A2UI surface
-- projections are removed because the buyer renderer no longer reads them.
DELETE FROM "agui_stream_events" WHERE "event"->>'activityType' = 'a2ui-surface';

DROP TABLE "agui_surfaces";

CREATE TABLE "openui_surfaces" (
  "runId" TEXT NOT NULL,
  "surfaceId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "openui_surfaces_pkey" PRIMARY KEY ("runId", "surfaceId"),
  CONSTRAINT "openui_surfaces_runId_fkey" FOREIGN KEY ("runId") REFERENCES "provider_runs"("runId") ON DELETE RESTRICT ON UPDATE CASCADE
);
