import type { FastifyInstance } from "fastify";
import type {
  BuyerFileRoute,
  BuyerUploadRoute,
  ProviderFileRoute,
  ProviderUploadRoute,
} from "./file.controller";
import { buyerUploadSchema, providerUploadSchema } from "./file.schemas";

const work = "/v1/provider/apps/:appId/invocations/:id/files";

export async function fileRoutes(app: FastifyInstance) {
  const { fileController: c } = app.diContainer.cradle;
  const signedIn = { preHandler: app.requireAccount };
  const uploads = { bodyLimit: 4096, config: { rateLimit: { max: 60, timeWindow: "1 minute" } } };

  app.post<BuyerUploadRoute>(
    "/v1/files",
    { ...signedIn, ...uploads, schema: buyerUploadSchema },
    c.requestBuyerUpload,
  );
  app.post<BuyerFileRoute>("/v1/files/:fileId/completions", signedIn, c.completeBuyer);
  app.get<BuyerFileRoute>("/v1/files/:fileId/download", signedIn, c.buyerDownload);

  // Provider worker: app key auth in the controller, never a browser session.
  app.post<ProviderUploadRoute>(
    work,
    { ...uploads, schema: providerUploadSchema },
    c.requestProviderUpload,
  );
  app.post<ProviderFileRoute>(`${work}/:fileId/completions`, c.completeProvider);
  app.get<ProviderFileRoute>(`${work}/:fileId/download`, c.providerDownload);
}
