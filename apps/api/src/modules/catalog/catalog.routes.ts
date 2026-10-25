import type { FastifyInstance } from "fastify";
import type { AppParams, ListQuery } from "./catalog.controller";

export async function catalogRoutes(app: FastifyInstance) {
  const { catalogController: c } = app.diContainer.cradle;
  const signedIn = { preHandler: app.requireAccount };

  app.get<ListQuery>("/v1/apps", c.list);
  app.get<AppParams>("/v1/apps/:appId", c.get);
  app.get<AppParams>("/v1/apps/:appId/commands", c.commands);

  app.get("/v1/stars", signedIn, c.stars);
  app.put<AppParams>("/v1/apps/:appId/star", signedIn, c.star);
  app.delete<AppParams>("/v1/apps/:appId/star", signedIn, c.unstar);
  // Backwards-compatible star paths used by older clients.
  app.put<AppParams>("/v1/stars/:appId", signedIn, c.star);
  app.delete<AppParams>("/v1/stars/:appId", signedIn, c.unstar);
}
