import { Hono } from "hono";
import type { AppEnv, RouteContext } from "../../http/context";
import { noStore } from "../../http/financial-json";
import { maxBody, rateLimit } from "../../http/limits";
import { builderRoute } from "../../http/openapi";
import { validate } from "../../http/validate";
import { requireAccount } from "../auth/guard";
import type { KeyScope } from "../provider/provider.validation";
import {
  buyerUploadBody,
  downloadTarget,
  fileView,
  providerUploadBody,
  uploadTicket,
} from "./file.schemas";

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
  // Inline URL for audio playback and image previews in the chat.
  .get("/v1/files/:fileId/stream", requireAccount, async (c) =>
    c.json(
      await c.var.cradle.fileService.buyerDownload(c.var.account.id, c.req.param("fileId"), true),
    ),
  )
  // Provider worker: app key auth, never a browser session.
  .post(
    work,
    rateLimit("uploads", 60),
    maxBody(4096),
    validate("json", providerUploadBody, "INVALID_UPLOAD"),
    builderRoute({
      operationId: "requestUpload",
      tag: "Files",
      summary: "Request an artifact upload",
      description:
        "Reserves a result file for an acknowledged run and returns a presigned PUT. Upload the exact bytes, then complete the file. Idempotent on `clientRequestId`; a retry re-signs the same upload without extending its deadline.",
      scope: "files:write",
      responses: { 200: { description: "The file and its upload", schema: uploadTicket } },
      errors: {
        400: ["INVALID_UPLOAD"],
        404: ["INVOCATION_NOT_READY"],
        409: ["RUN_NOT_ACKED", "FILE_LIMIT_REACHED", "IDEMPOTENCY_CONFLICT"],
        413: ["FILE_TOO_LARGE"],
        429: ["RATE_LIMITED"],
        503: ["FILES_DISABLED"],
      },
    }),
    async (c) =>
      c.json(
        await c.var.cradle.fileService.requestProviderUpload(
          await providerWork(c, "files:write"),
          c.req.valid("json"),
        ),
      ),
  )
  .post(
    `${work}/:fileId/completions`,
    builderRoute({
      operationId: "completeUpload",
      tag: "Files",
      summary: "Complete an upload",
      description:
        "Payvoke copies the uploaded bytes to a private key and checks their size and SHA-256. The file becomes READY, or REJECTED with a `rejectionCode`. Only READY files can be listed in a `result` report.",
      scope: "files:write",
      responses: { 200: { description: "The settled file", schema: fileView } },
      errors: {
        404: ["INVOCATION_NOT_READY", "FILE_NOT_FOUND"],
        409: ["UPLOAD_NOT_FOUND"],
        410: ["UPLOAD_EXPIRED"],
        503: ["FILES_DISABLED"],
      },
    }),
    async (c) =>
      c.json(
        await c.var.cradle.fileService.completeProvider(
          await providerWork(c, "files:write"),
          c.req.param("fileId"),
        ),
      ),
  )
  .get(
    `${work}/:fileId/download`,
    builderRoute({
      operationId: "downloadInput",
      tag: "Files",
      summary: "Download a buyer file",
      description:
        "A short-lived URL for a buyer file frozen into this invocation's paid input (`input.context.files`).",
      scope: "events:read",
      responses: { 200: { description: "A presigned download", schema: downloadTarget } },
      errors: { 404: ["INVOCATION_NOT_READY", "FILE_NOT_FOUND"], 503: ["FILES_DISABLED"] },
    }),
    async (c) =>
      c.json(
        await c.var.cradle.fileService.providerDownload(
          await providerWork(c, "events:read"),
          c.req.param("fileId"),
        ),
      ),
  );
