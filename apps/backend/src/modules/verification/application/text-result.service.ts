import { LockMode, type EntityManager } from "@mikro-orm/postgresql";
import { ApiHttpError } from "../../identity/http/identity-http.js";
import type { ProviderService } from "../../provider-gateway/application/provider.service.js";
import { CommandInvocation } from "../../provider-gateway/domain/provider.js";
import { inspectTextResult, TextResult } from "../domain/text-result.js";

export class TextResultService {
  constructor(
    private readonly em: EntityManager,
    private readonly providers: ProviderService,
  ) {}

  async verify(ownerId: string, applicationId: string, invocationId: string): Promise<TextResult> {
    await this.providers.invocation(ownerId, applicationId, invocationId);
    return this.em.transactional(async (em) => {
      const invocation = await em.findOneOrFail(CommandInvocation, invocationId, {
        lockMode: LockMode.PESSIMISTIC_WRITE,
      });
      const existing = await em.findOne(TextResult, invocationId);
      if (existing) return existing;
      let result: TextResult;
      try {
        result = inspectTextResult(invocation, ownerId);
      } catch (error) {
        throw new ApiHttpError(
          { code: "RESULT_NOT_READY", message: (error as Error).message },
          409,
        );
      }
      await em.persist(result).flush();
      return result;
    });
  }

  async get(ownerId: string, applicationId: string, invocationId: string): Promise<TextResult> {
    await this.providers.invocation(ownerId, applicationId, invocationId);
    const result = await this.em.findOne(TextResult, { id: invocationId, ownerId, applicationId });
    if (!result)
      throw new ApiHttpError({ code: "NOT_FOUND", message: "Checked result not found." }, 404);
    return result;
  }
}
