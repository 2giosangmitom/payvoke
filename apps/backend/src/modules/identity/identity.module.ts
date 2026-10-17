import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { IdentityMeController } from "./accounts/account.controller.js";
import { AccountService } from "./accounts/account.service.js";
import { ProjectAccessService } from "./access/project-access.service.js";
import { IdentityMembershipController } from "./access/project-membership.controller.js";
import { IdentityAuthController } from "./auth/auth.controller.js";
import { IdentityGuard } from "./auth/auth.guard.js";
import { AuthenticationService } from "./auth/authentication.service.js";
import { AuthenticationStore } from "./auth/authentication.store.js";
import { ChallengeStore } from "./auth/challenge.store.js";
import { SessionService } from "./auth/session.service.js";
import { SupabaseAuthService } from "./auth/supabase-auth.service.js";
import { IdentityExceptionFilter } from "./shared/identity-exception.filter.js";
import { identityEntities } from "./identity.entity.js";

@Module({
  imports: [MikroOrmModule.forFeature(identityEntities)],
  controllers: [IdentityAuthController, IdentityMeController, IdentityMembershipController],
  providers: [
    AccountService,
    AuthenticationStore,
    ChallengeStore,
    ProjectAccessService,
    SessionService,
    SupabaseAuthService,
    AuthenticationService,
    { provide: APP_GUARD, useClass: IdentityGuard },
    { provide: APP_FILTER, useClass: IdentityExceptionFilter },
  ],
  exports: [ProjectAccessService, SessionService],
})
export class IdentityModule {}
