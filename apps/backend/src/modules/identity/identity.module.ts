import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { IdentityMeController } from "./accounts/account.controller.js";
import { AccountService } from "./accounts/account.service.js";
import { IdentityGuard } from "./auth/auth.guard.js";
import { SupabaseAuthService } from "./auth/supabase-auth.service.js";
import { IdentityExceptionFilter } from "./shared/identity-exception.filter.js";
import { AppUser } from "./identity.entity.js";

@Module({
  imports: [MikroOrmModule.forFeature([AppUser])],
  controllers: [IdentityMeController],
  providers: [
    AccountService,
    SupabaseAuthService,
    { provide: APP_GUARD, useClass: IdentityGuard },
    { provide: APP_FILTER, useClass: IdentityExceptionFilter },
  ],
})
export class IdentityModule {}
