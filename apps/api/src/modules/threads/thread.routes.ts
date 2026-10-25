import type { FastifyInstance } from "fastify";
import type {
  CreateThreadRoute,
  ListThreadsRoute,
  RenameThreadRoute,
  ThreadEventsRoute,
  ThreadRoute,
} from "./thread.controller";

export async function threadRoutes(app: FastifyInstance) {
  const { threadController: c } = app.diContainer.cradle;
  const signedIn = { preHandler: app.requireAccount };

  app.post<CreateThreadRoute>("/v1/threads", { ...signedIn, bodyLimit: 4096 }, c.create);
  app.get<ListThreadsRoute>("/v1/threads", signedIn, c.list);
  app.get<ThreadRoute>("/v1/threads/:threadId", signedIn, c.get);
  app.patch<RenameThreadRoute>("/v1/threads/:threadId", { ...signedIn, bodyLimit: 2048 }, c.rename);
  app.post<ThreadRoute>("/v1/threads/:threadId/archive", signedIn, c.archive);
  app.get<ThreadRoute>("/v1/threads/:threadId/ag-ui/snapshot", signedIn, c.snapshot);
  app.get<ThreadEventsRoute>("/v1/threads/:threadId/ag-ui/events", signedIn, c.events);
}
