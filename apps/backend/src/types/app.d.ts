import type { EntityManager, MikroORM } from "@mikro-orm/postgresql";
import type { Environment } from "../config/environment.js";
import type { AccountService } from "../modules/identity/application/account.service.js";
import type { ProfileRepository } from "../modules/identity/application/profile.repository.js";
import type { SupabaseAuthService } from "../modules/identity/infrastructure/supabase-auth.service.js";
import type { Principal } from "../modules/identity/domain/identity.types.js";
import type { WorkspaceRepository } from "../modules/workspace/application/workspace.repository.js";
import type { WorkspaceService } from "../modules/workspace/application/workspace.service.js";
import type { PublishingRepository } from "../modules/publishing/application/publishing.repository.js";
import type { PublishingService } from "../modules/publishing/application/publishing.service.js";
import type { ProviderService } from "../modules/provider-gateway/application/provider.service.js";
import type { CommerceService } from "../modules/commerce/application/commerce.service.js";

// Fastify request augmentation: set by the `requireAuth` preHandler.
declare module "fastify" {
  interface FastifyRequest {
    principal?: Principal;
  }
}

// Awilix container shape shared by the application plugins and tests.
declare module "@fastify/awilix" {
  interface Cradle {
    env: Environment;
    orm: MikroORM;
    authService: SupabaseAuthService;
    em: EntityManager;
    accounts: AccountService;
    profiles: ProfileRepository;
    workspaces: WorkspaceRepository;
    workspaceService: WorkspaceService;
    publishing: PublishingRepository;
    publishingService: PublishingService;
    providerService: ProviderService;
    commerceService: CommerceService;
  }
}
