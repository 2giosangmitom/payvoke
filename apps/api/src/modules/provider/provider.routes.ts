import type { FastifyInstance } from "fastify";
import type {
  AppRoute,
  CommandRoute,
  CreateAppRoute,
  CreateCommandRoute,
  OverwriteCommandsRoute,
  IssueKeyRoute,
  KeyRoute,
  PatchAppRoute,
  PayoutRoute,
  UpdateCommandRoute,
} from "./provider.controller";

const base = "/v1/provider/apps/:appId";

export async function providerRoutes(app: FastifyInstance) {
  const { providerController: c } = app.diContainer.cradle;
  const owner = { preHandler: app.requireAccount };
  // Command routes authenticate inside the controller: session or app key.
  const commandWrite = {
    bodyLimit: 32768,
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
  };

  app.post<CreateAppRoute>(
    "/v1/provider/apps",
    { ...owner, bodyLimit: 8192, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    c.createApp,
  );
  app.get("/v1/provider/apps", owner, c.listApps);
  app.get<AppRoute>(base, owner, c.getApp);
  app.patch<PatchAppRoute>(base, { ...owner, bodyLimit: 8192 }, c.updateApp);
  app.put<PayoutRoute>(`${base}/payout`, { ...owner, bodyLimit: 2048 }, c.updatePayout);
  app.post<AppRoute>(`${base}/archive`, owner, c.archiveApp);
  app.post<AppRoute>(`${base}/suspensions`, owner, c.suspendApp);
  app.post<AppRoute>(`${base}/activations`, owner, c.activateApp);

  app.get<AppRoute>(`${base}/keys`, owner, c.listKeys);
  app.post<IssueKeyRoute>(
    `${base}/keys`,
    { ...owner, bodyLimit: 4096, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    c.issueKey,
  );
  app.post<KeyRoute>(`${base}/keys/:keyId/revocations`, owner, c.revokeKey);

  app.get<AppRoute>(`${base}/commands`, c.listCommands);
  app.post<CreateCommandRoute>(`${base}/commands`, commandWrite, c.createCommand);
  app.put<OverwriteCommandsRoute>(
    `${base}/commands`,
    { ...commandWrite, bodyLimit: 262144 },
    c.overwriteCommands,
  );
  app.patch<UpdateCommandRoute>(`${base}/commands/:commandId`, commandWrite, c.updateCommand);
  app.delete<CommandRoute>(`${base}/commands/:commandId`, c.archiveCommand);
  app.post<CommandRoute>(`${base}/commands/:commandId/default`, c.setDefaultCommand);
}
