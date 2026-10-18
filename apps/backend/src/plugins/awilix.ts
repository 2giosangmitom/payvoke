import { fastifyAwilixPlugin, type Cradle } from "@fastify/awilix";
import { asClass, asFunction, asValue, createContainer, Lifetime } from "awilix";
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import type { MikroORM } from "@mikro-orm/postgresql";
import type { Environment } from "../config/environment.js";
import { AccountService } from "../modules/identity/application/account.service.js";
import { SupabaseAuthService } from "../modules/identity/infrastructure/supabase-auth.service.js";
import { MikroOrmProfileRepository } from "../modules/identity/infrastructure/mikro-orm-profile.repository.js";
import { MikroOrmWorkspaceRepository } from "../modules/workspace/infrastructure/mikro-orm-workspace.repository.js";
import { WorkspaceService } from "../modules/workspace/application/workspace.service.js";
import { PublishingService } from "../modules/publishing/application/publishing.service.js";
import { MikroOrmPublishingRepository } from "../modules/publishing/infrastructure/mikro-orm-publishing.repository.js";
import { ProviderService } from "../modules/provider-gateway/application/provider.service.js";
import { MikroOrmProviderRepository } from "../modules/provider-gateway/infrastructure/mikro-orm-provider.repository.js";
import { CommerceService } from "../modules/commerce/application/commerce.service.js";
import { MikroOrmCommerceRepository } from "../modules/commerce/infrastructure/mikro-orm-commerce.repository.js";
import { TextResultService } from "../modules/verification/application/text-result.service.js";

export interface DiOptions {
  env: Environment;
  orm: MikroORM;
}

const diPlugin: FastifyPluginAsync<DiOptions> = async (fastify, options) => {
  const container = createContainer<Cradle>();
  container.register({
    env: asValue(options.env),
    orm: asValue(options.orm),
    authService: asClass(SupabaseAuthService, { lifetime: Lifetime.SINGLETON }),
    em: asFunction(({ orm }) => orm.em.fork(), { lifetime: Lifetime.SCOPED }),
    profiles: asClass(MikroOrmProfileRepository, { lifetime: Lifetime.SCOPED }),
    accounts: asClass(AccountService, { lifetime: Lifetime.SCOPED }),
    workspaces: asFunction(({ em }) => new MikroOrmWorkspaceRepository(em), {
      lifetime: Lifetime.SCOPED,
    }),
    workspaceService: asFunction(({ workspaces }) => new WorkspaceService(workspaces), {
      lifetime: Lifetime.SCOPED,
    }),
    publishing: asFunction(({ em }) => new MikroOrmPublishingRepository(em), {
      lifetime: Lifetime.SCOPED,
    }),
    publishingService: asFunction(({ publishing }) => new PublishingService(publishing), {
      lifetime: Lifetime.SCOPED,
    }),
    providerService: asFunction(
      ({ em }) => new ProviderService(new MikroOrmProviderRepository(em)),
      { lifetime: Lifetime.SCOPED },
    ),
    commerceService: asFunction(
      ({ em }) => new CommerceService(new MikroOrmCommerceRepository(em)),
      { lifetime: Lifetime.SCOPED },
    ),
    textResultService: asFunction(
      ({ em, providerService }) => new TextResultService(em, providerService),
      { lifetime: Lifetime.SCOPED },
    ),
  });

  await fastify.register(fastifyAwilixPlugin, {
    container,
    disposeOnClose: true,
    disposeOnResponse: true,
  });
};

export default fp(diPlugin, { name: "di" });
