import { TypedBody, TypedException, TypedRoute } from "@nestia/core";
import { Controller, HttpCode, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { httpValue } from "../shared/identity-http.js";
import type {
  ApiError,
  AuthTokens,
  ChallengeView,
  EmailRequest,
  EmailVerification,
  Principal,
  WalletRequest,
  WalletVerification,
} from "../identity.types.js";
import { CurrentPrincipal, PublicAuth } from "./auth.guard.js";
import { AuthenticationService } from "./authentication.service.js";
import { SessionService } from "./session.service.js";

@Controller("v1/auth")
export class IdentityAuthController {
  constructor(
    private readonly service: AuthenticationService,
    private readonly sessions: SessionService,
  ) {}

  /** Send an email OTP. Configure the Supabase template to send a code, not a magic link. */
  @PublicAuth()
  @TypedRoute.Post("email/otp")
  @TypedException<ApiError>({ status: 429 })
  @TypedException<ApiError>({ status: 503 })
  async requestEmail(
    @TypedBody() input: EmailRequest,
    @Req() request: FastifyRequest,
  ): Promise<ChallengeView> {
    return httpValue(await this.service.requestEmail(input.email, request.ip));
  }

  /** Verify one email challenge and admit the returned Supabase session. */
  @PublicAuth()
  @HttpCode(200)
  @TypedRoute.Post("email/verify")
  @TypedException<ApiError>({ status: 401 })
  @TypedException<ApiError>({ status: 409 })
  @TypedException<ApiError>({ status: 429 })
  async verifyEmail(
    @TypedBody() input: EmailVerification,
    @Req() request: FastifyRequest,
  ): Promise<AuthTokens> {
    return httpValue(await this.service.verifyEmail(input, request.ip));
  }

  /** Generate a Fuji EOA sign-in message. Connecting a wallet alone does not authenticate it. */
  @PublicAuth()
  @TypedRoute.Post("wallet/challenges")
  @TypedException<ApiError>({ status: 429 })
  async requestWallet(
    @TypedBody() input: WalletRequest,
    @Req() request: FastifyRequest,
  ): Promise<ChallengeView> {
    return httpValue(await this.service.requestWallet(input, request.ip));
  }

  /** Verify the exact server-issued message; a challenge can admit only one session. */
  @PublicAuth()
  @HttpCode(200)
  @TypedRoute.Post("wallet/verify")
  @TypedException<ApiError>({ status: 401 })
  @TypedException<ApiError>({ status: 409 })
  @TypedException<ApiError>({ status: 429 })
  async verifyWallet(
    @TypedBody() input: WalletVerification,
    @Req() request: FastifyRequest,
  ): Promise<AuthTokens> {
    return httpValue(await this.service.verifyWallet(input, request.ip));
  }

  /**
   * Revoke marketplace access for this session. Does not revoke on-chain delegation.
   * @security bearer
   */
  @HttpCode(204)
  @TypedRoute.Post("logout")
  @TypedException<ApiError>({ status: 401 })
  async logout(@CurrentPrincipal() principal: Principal): Promise<void> {
    await this.sessions.revoke(principal, false);
  }

  /**
   * Revoke all marketplace sessions, including those from other linked Auth subjects.
   * @security bearer
   */
  @HttpCode(204)
  @TypedRoute.Post("logout-all")
  @TypedException<ApiError>({ status: 401 })
  async logoutAll(@CurrentPrincipal() principal: Principal): Promise<void> {
    await this.sessions.revoke(principal, true);
  }
}
