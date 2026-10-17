import { CanActivate, ExecutionContext, Injectable, createParamDecorator } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { failure } from "../shared/identity.errors.js";
import { httpValue } from "../shared/identity-http.js";
import { AccountService } from "../accounts/account.service.js";
import { SupabaseAuthService } from "./supabase-auth.service.js";
import type { Principal } from "../identity.types.js";

export interface AuthenticatedRequest extends FastifyRequest {
  principal?: Principal;
}

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal => {
    const principal = context.switchToHttp().getRequest<AuthenticatedRequest>().principal;
    if (!principal) return httpValue(failure("INVALID_SESSION", "A valid session is required."));
    return principal;
  },
);

@Injectable()
export class IdentityGuard implements CanActivate {
  constructor(
    private readonly supabase: SupabaseAuthService,
    private readonly accounts: AccountService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    http.getResponse<FastifyReply>().header("Cache-Control", "no-store");
    const request = http.getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const match =
      authorization && authorization.length < 16384 ? /^Bearer (\S+)$/i.exec(authorization) : null;
    if (!match?.[1]) return httpValue(failure("INVALID_SESSION", "A bearer token is required."));
    const principal = httpValue(await this.supabase.authenticate(match[1]));
    httpValue(await this.accounts.ensureProfile(principal));
    request.principal = principal;
    return true;
  }
}
