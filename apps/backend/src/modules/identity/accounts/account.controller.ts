import { TypedBody, TypedException, TypedRoute } from "@nestia/core";
import { Controller } from "@nestjs/common";
import { CurrentPrincipal } from "../auth/auth.guard.js";
import { httpValue } from "../shared/identity-http.js";
import type { ApiError, Principal, ProfileUpdate, UserView } from "../identity.types.js";
import { AccountService } from "./account.service.js";

@Controller("v1/me")
export class IdentityMeController {
  constructor(private readonly accounts: AccountService) {}

  /** @security bearer */
  @TypedRoute.Get()
  @TypedException<ApiError>({ status: 401 })
  @TypedException<ApiError>({ status: 403 })
  async me(@CurrentPrincipal() principal: Principal): Promise<UserView> {
    return this.accounts.me(principal);
  }

  /** @security bearer */
  @TypedRoute.Patch()
  @TypedException<ApiError>({ status: 401 })
  @TypedException<ApiError>({ status: 403 })
  @TypedException<ApiError>({ status: 400 })
  async update(
    @CurrentPrincipal() principal: Principal,
    @TypedBody() input: ProfileUpdate,
  ): Promise<UserView> {
    return httpValue(await this.accounts.updateProfile(principal, input));
  }
}
