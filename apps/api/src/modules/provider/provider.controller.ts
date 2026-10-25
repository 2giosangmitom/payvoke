import type { Cradle } from "@fastify/awilix";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  parseAppPatch,
  parseKeyRequest,
  parseNewApp,
  parsePayout,
  type AppPatchBody,
  type CommandBody,
  type KeyRequestBody,
  type NewAppBody,
} from "./provider.validation";

export type AppRoute = { Params: { appId: string } };
export type CommandRoute = { Params: { appId: string; commandId: string } };
export type KeyRoute = { Params: { appId: string; keyId: string } };
export type CreateAppRoute = { Body: Partial<NewAppBody> };
export type PatchAppRoute = AppRoute & { Body: AppPatchBody };
export type PayoutRoute = AppRoute & { Body: { payoutAddress?: string } };
export type IssueKeyRoute = AppRoute & { Body: KeyRequestBody };
export type CreateCommandRoute = AppRoute & { Body: CommandBody };
export type UpdateCommandRoute = CommandRoute & { Body: CommandBody };

export class ProviderController {
  private readonly authService: Cradle["authService"];
  private readonly apps: Cradle["providerAppService"];
  private readonly commandService: Cradle["providerCommandService"];
  private readonly keys: Cradle["providerKeyService"];

  constructor({
    authService,
    providerAppService,
    providerCommandService,
    providerKeyService,
  }: Cradle) {
    this.authService = authService;
    this.apps = providerAppService;
    this.commandService = providerCommandService;
    this.keys = providerKeyService;
  }

  // Owner session only (Studio). Routes using this also run requireAccount.
  private async owner(request: FastifyRequest, appId: string) {
    request.account ??= await this.authService.requireAccount(request.headers);
    return this.apps.owned(request.account.id, appId);
  }

  // Command writes accept the owner session or an app key with products:write.
  private writer(request: FastifyRequest, appId: string) {
    const bearer = request.headers.authorization;
    if (!bearer) return this.owner(request, appId);
    return this.keys.authenticate(bearer, appId, "products:write");
  }

  createApp = async (request: FastifyRequest<CreateAppRoute>, reply: FastifyReply) => {
    const { created, app } = await this.apps.create(request.account!.id, parseNewApp(request.body));
    return reply.code(created ? 201 : 200).send(app);
  };

  listApps = async (request: FastifyRequest) => this.apps.list(request.account!.id);

  getApp = async (request: FastifyRequest<AppRoute>) =>
    this.apps.detail(await this.owner(request, request.params.appId));

  updateApp = async (request: FastifyRequest<PatchAppRoute>) => {
    await this.owner(request, request.params.appId);
    return this.apps.update(request.params.appId, parseAppPatch(request.body));
  };

  // Kept for callers that still patch only the payout address.
  updatePayout = async (request: FastifyRequest<PayoutRoute>) => {
    await this.owner(request, request.params.appId);
    return this.apps.update(request.params.appId, {
      payoutAddress: parsePayout(request.body),
    });
  };

  archiveApp = async (request: FastifyRequest<AppRoute>) => {
    await this.owner(request, request.params.appId);
    return this.apps.archive(request.params.appId);
  };

  suspendApp = async (request: FastifyRequest<AppRoute>) => {
    await this.owner(request, request.params.appId);
    return this.apps.suspend(request.params.appId);
  };

  activateApp = async (request: FastifyRequest<AppRoute>) => {
    await this.owner(request, request.params.appId);
    return this.apps.activate(request.params.appId);
  };

  listKeys = async (request: FastifyRequest<AppRoute>) => {
    await this.owner(request, request.params.appId);
    return this.keys.list(request.params.appId);
  };

  issueKey = async (request: FastifyRequest<IssueKeyRoute>, reply: FastifyReply) => {
    await this.owner(request, request.params.appId);
    const key = await this.keys.issue(request.params.appId, parseKeyRequest(request.body));
    return reply.code(201).header("Cache-Control", "no-store").send(key);
  };

  revokeKey = async (request: FastifyRequest<KeyRoute>) => {
    await this.owner(request, request.params.appId);
    return this.keys.revoke(request.params.appId, request.params.keyId);
  };

  listCommands = async (request: FastifyRequest<AppRoute>) => {
    const app = await this.writer(request, request.params.appId);
    return this.commandService.list(app.id);
  };

  createCommand = async (request: FastifyRequest<CreateCommandRoute>, reply: FastifyReply) => {
    const app = await this.writer(request, request.params.appId);
    return reply.code(201).send(await this.commandService.create(app, request.body));
  };

  updateCommand = async (request: FastifyRequest<UpdateCommandRoute>) => {
    const app = await this.writer(request, request.params.appId);
    return this.commandService.update(app, request.params.commandId, request.body);
  };

  archiveCommand = async (request: FastifyRequest<CommandRoute>) => {
    const app = await this.writer(request, request.params.appId);
    return this.commandService.archive(app, request.params.commandId);
  };

  setDefaultCommand = async (request: FastifyRequest<CommandRoute>) => {
    const app = await this.writer(request, request.params.appId);
    return this.commandService.setDefault(app, request.params.commandId);
  };
}
