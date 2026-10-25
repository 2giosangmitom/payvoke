import type { FastifyInstance } from "fastify";
import type {
  AckRoute,
  AnswerRoute,
  FeedRoute,
  ReportRoute,
  RevisionRoute,
  StreamRoute,
} from "./runs.controller";

const base = "/v1/provider/apps/:appId";
const work = `${base}/invocations/:id`;
const stream = `${work}/ag-ui/streams/:runId`;

export async function runRoutes(app: FastifyInstance) {
  const { runsController: c } = app.diContainer.cradle;
  // Fastify's default JSON parser must not buffer a long-running provider stream.
  app.addContentTypeParser("application/x-ndjson", (_request, payload, done) =>
    done(null, payload),
  );

  // Provider worker: app key auth in the controller, never a browser session.
  app.get<FeedRoute>(`${base}/events`, c.feed);
  app.post<AckRoute>(`${work}/acks`, { bodyLimit: 2048 }, c.acknowledge);
  app.post<ReportRoute>(`${work}/reports`, { bodyLimit: 64000 }, c.report);
  app.get<StreamRoute>(`${stream}/cursor`, c.streamCursor);
  app.post<StreamRoute>(stream, { bodyLimit: 524288 }, c.stream);

  // Buyer continuations.
  app.post<AnswerRoute>(
    "/v1/invocations/:id/answers",
    { preHandler: app.requireAccount, bodyLimit: 32768 },
    c.answer,
  );
  app.post<RevisionRoute>(
    "/v1/invocations/:id/revisions",
    { preHandler: app.requireAccount, bodyLimit: 8192 },
    c.requestRevision,
  );
}
