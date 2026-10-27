import type { Cradle } from "@fastify/awilix";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { KeyScope } from "../provider/provider.validation";
import type { BuyerUploadBody, UploadBody } from "./file.schemas";

type WorkParams = { appId: string; id: string };
export type BuyerUploadRoute = { Body: BuyerUploadBody };
export type BuyerFileRoute = { Params: { fileId: string } };
export type ProviderUploadRoute = { Params: WorkParams; Body: UploadBody };
export type ProviderFileRoute = { Params: WorkParams & { fileId: string } };

export class FileController {
  private readonly files: Cradle["fileService"];
  private readonly keys: Cradle["providerKeyService"];
  private readonly runs: Cradle["providerRunService"];

  constructor({ fileService, providerKeyService, providerRunService }: Cradle) {
    this.files = fileService;
    this.keys = providerKeyService;
    this.runs = providerRunService;
  }

  // Provider routes accept only an app key with the given scope.
  private async work(request: FastifyRequest<{ Params: WorkParams }>, scope: KeyScope) {
    const { appId, id } = request.params;
    await this.keys.authenticate(request.headers.authorization, appId, scope);
    return this.runs.work(appId, id);
  }

  // Signed URLs are bearer credentials: never cache a response carrying one.
  private static signed<T>(reply: FastifyReply, body: T) {
    return reply.header("cache-control", "no-store").send(body);
  }

  requestBuyerUpload = async (request: FastifyRequest<BuyerUploadRoute>, reply: FastifyReply) =>
    FileController.signed(
      reply,
      await this.files.requestBuyerUpload(request.account!.id, request.body),
    );

  completeBuyer = async (request: FastifyRequest<BuyerFileRoute>) =>
    this.files.completeBuyer(request.account!.id, request.params.fileId);

  buyerDownload = async (request: FastifyRequest<BuyerFileRoute>, reply: FastifyReply) =>
    FileController.signed(
      reply,
      await this.files.buyerDownload(request.account!.id, request.params.fileId),
    );

  requestProviderUpload = async (
    request: FastifyRequest<ProviderUploadRoute>,
    reply: FastifyReply,
  ) =>
    FileController.signed(
      reply,
      await this.files.requestProviderUpload(await this.work(request, "files:write"), request.body),
    );

  completeProvider = async (request: FastifyRequest<ProviderFileRoute>) =>
    this.files.completeProvider(await this.work(request, "files:write"), request.params.fileId);

  providerDownload = async (request: FastifyRequest<ProviderFileRoute>, reply: FastifyReply) =>
    FileController.signed(
      reply,
      await this.files.providerDownload(
        await this.work(request, "events:read"),
        request.params.fileId,
      ),
    );
}
