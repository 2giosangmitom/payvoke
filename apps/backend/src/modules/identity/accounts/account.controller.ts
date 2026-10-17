import { TypedBody, TypedException, TypedRoute } from "@nestia/core";
import { Controller, HttpCode, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { CurrentPrincipal } from "../auth/auth.guard.js";
import { AuthenticationService } from "../auth/authentication.service.js";
import { SessionService } from "../auth/session.service.js";
import { httpValue } from "../shared/identity-http.js";
import type {
  ApiError,
  ChallengeView,
  EmailRequest,
  EmailVerification,
  IdentityView,
  Principal,
  ProfileUpdate,
  SessionView,
  UserView,
  WalletRequest,
  WalletVerification,
} from "../identity.types.js";
import { AccountService } from "./account.service.js";

@Controller("v1/me")
export class IdentityMeController {
  constructor(
    private readonly service: AuthenticationService,
    private readonly accounts: AccountService,
    private readonly sessionService: SessionService,
  ) {}

  /**
   * Get the current marketplace account.
   * @security bearer
   */
  @TypedRoute.Get()
  @TypedException<ApiError>({ status: 401 })
  async me(@CurrentPrincipal() principal: Principal): Promise<UserView> {
    return this.accounts.me(principal);
  }

  /**
   * Update display-only profile fields.
   * @security bearer
   */
  @TypedRoute.Patch()
  @TypedException<ApiError>({ status: 401 })
  @TypedException<ApiError>({ status: 400 })
  async update(
    @CurrentPrincipal() principal: Principal,
    @TypedBody() input: ProfileUpdate,
  ): Promise<UserView> {
    return httpValue(await this.accounts.updateProfile(principal, input));
  }

  /**
   * List verified marketplace identities.
   * @security bearer
   */
  @TypedRoute.Get("identities")
  @TypedException<ApiError>({ status: 401 })
  async identities(@CurrentPrincipal() principal: Principal): Promise<IdentityView[]> {
    return this.accounts.identities(principal);
  }

  /**
   * List active marketplace session admissions.
   * @security bearer
   */
  @TypedRoute.Get("sessions")
  @TypedException<ApiError>({ status: 401 })
  async sessions(@CurrentPrincipal() principal: Principal): Promise<SessionView[]> {
    return this.sessionService.list(principal);
  }

  /**
   * Request an email-link challenge.
   * @security bearer
   */
  @TypedRoute.Post("email/challenges")
  @TypedException<ApiError>({ status: 401 })
  @TypedException<ApiError>({ status: 429 })
  async requestEmail(
    @CurrentPrincipal() principal: Principal,
    @TypedBody() input: EmailRequest,
    @Req() request: FastifyRequest,
  ): Promise<ChallengeView> {
    return httpValue(await this.service.requestEmail(input.email, request.ip, principal));
  }

  /**
   * Link only after proving both the current session and the new email. Never merges accounts.
   * @security bearer
   */
  @HttpCode(204)
  @TypedRoute.Post("email/verify")
  @TypedException<ApiError>({ status: 401 })
  @TypedException<ApiError>({ status: 409 })
  async verifyEmail(
    @CurrentPrincipal() principal: Principal,
    @TypedBody() input: EmailVerification,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    httpValue(await this.service.verifyEmail(input, request.ip, principal));
  }

  /**
   * Request a wallet-link challenge.
   * @security bearer
   */
  @TypedRoute.Post("wallet/challenges")
  @TypedException<ApiError>({ status: 401 })
  @TypedException<ApiError>({ status: 429 })
  async requestWallet(
    @CurrentPrincipal() principal: Principal,
    @TypedBody() input: WalletRequest,
    @Req() request: FastifyRequest,
  ): Promise<ChallengeView> {
    return httpValue(await this.service.requestWallet(input, request.ip, principal));
  }

  /**
   * Verify and link a wallet without granting spending authority.
   * @security bearer
   */
  @HttpCode(204)
  @TypedRoute.Post("wallet/verify")
  @TypedException<ApiError>({ status: 401 })
  @TypedException<ApiError>({ status: 409 })
  async verifyWallet(
    @CurrentPrincipal() principal: Principal,
    @TypedBody() input: WalletVerification,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    httpValue(await this.service.verifyWallet(input, request.ip, principal));
  }
}
