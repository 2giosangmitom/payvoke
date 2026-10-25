import type { Cradle } from "@fastify/awilix";
import type { FastifyRequest } from "fastify";
import { BadRequestError } from "../../errors";

export type AppParams = { Params: { appId: string } };
export type ListQuery = {
  Querystring: { q?: string; cursor?: string; limit?: string; saved?: string };
};

export class CatalogController {
  private readonly catalogService: Cradle["catalogService"];
  private readonly authService: Cradle["authService"];

  constructor({ catalogService, authService }: Cradle) {
    this.catalogService = catalogService;
    this.authService = authService;
  }

  list = async (request: FastifyRequest<ListQuery>) => {
    const { q, cursor, saved } = request.query;
    const limit = Number(request.query.limit ?? 20);
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50 ||
      (q && q.length > 100) ||
      (cursor && cursor.length > 128)
    )
      throw new BadRequestError("INVALID_CATALOG_QUERY");
    const viewer = await this.authService.optionalAccount(request.headers);
    return this.catalogService.list({
      q,
      cursor,
      limit,
      savedBy: saved === "1" ? viewer?.id : undefined,
    });
  };

  get = async (request: FastifyRequest<AppParams>) => {
    const viewer = await this.authService.optionalAccount(request.headers);
    return this.catalogService.get(request.params.appId, viewer?.id ?? null);
  };

  commands = async (request: FastifyRequest<AppParams>) => {
    const viewer = await this.authService.optionalAccount(request.headers);
    return this.catalogService.commands(request.params.appId, viewer?.id ?? null);
  };

  stars = async (request: FastifyRequest) => this.catalogService.stars(request.account!.id);

  star = async (request: FastifyRequest<AppParams>) =>
    this.catalogService.star(request.account!.id, request.params.appId);

  unstar = async (request: FastifyRequest<AppParams>) =>
    this.catalogService.unstar(request.account!.id, request.params.appId);
}
