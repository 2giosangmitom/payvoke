import { Hono } from "hono";
import type { AppEnv, RouteContext } from "../../http/context";
import { noStore } from "../../http/financial-json";
import { maxBody, rateLimit } from "../../http/limits";
import { validate } from "../../http/validate";
import { requireAccount } from "../auth/guard";
import type { KeyScope } from "../provider/provider.validation";
import { buyerUploadBody, providerUploadBody } from "./file.schemas";

const work = "/v1/provider/apps/:appId/invocations/:id/files";

// Provider routes accept only an app key with the given scope.
async function providerWork(c: RouteContext, scope: KeyScope) {
  const { providerKeyService, providerRunService } = c.var.cradle;
  const appId = c.req.param("appId")!;
  await providerKeyService.authenticate(c.req.header("authorization"), appId, scope);
  return providerRunService.work(appId, c.req.param("id")!);
}

// Signed URLs are bearer credentials: never cache a response carrying one.
export const fileRoutes = new Hono<AppEnv>()
  .use("/v1/files/*", noStore)
  .use("/v1/files", noStore)
  .use(`${work}/*`, noStore)
  .use(work, noStore)
  .post(
    "/v1/files",
    rateLimit("uploads", 60),
    maxBody(4096),
    validate("json", buyerUploadBody, "INVALID_UPLOAD"),
    requireAccount,
    async (c) =>
      c.json(
        await c.var.cradle.fileService.requestBuyerUpload(c.var.account.id, c.req.valid("json")),
      ),
  )
  .post("/v1/files/:fileId/completions", requireAccount, async (c) =>
    c.json(await c.var.cradle.fileService.completeBuyer(c.var.account.id, c.req.param("fileId"))),
  )
  .get("/v1/files/:fileId/download", requireAccount, async (c) =>
    c.json(await c.var.cradle.fileService.buyerDownload(c.var.account.id, c.req.param("fileId"))),
  )
  // Provider worker: app key auth, never a browser session.
  .post(
    work,
    rateLimit("uploads", 60),
    maxBody(4096),
    validate("json", providerUploadBody, "INVALID_UPLOAD"),
    async (c) =>
      c.json(
        await c.var.cradle.fileService.requestProviderUpload(
          await providerWork(c, "files:write"),
          c.req.valid("json"),
        ),
      ),
  )
  .post(`${work}/:fileId/completions`, async (c) =>
    c.json(
      await c.var.cradle.fileService.completeProvider(
        await providerWork(c, "files:write"),
        c.req.param("fileId"),
      ),
    ),
  )
  .get(`${work}/:fileId/download`, async (c) =>
    c.json(
      await c.var.cradle.fileService.providerDownload(
        await providerWork(c, "events:read"),
        c.req.param("fileId"),
      ),
    ),
  );
