import { EntityManager } from "@mikro-orm/postgresql";
import { Injectable } from "@nestjs/common";
import { Result } from "better-result";
import { AppUser } from "../identity.entity.js";
import { failure, type IdentityResult } from "../shared/identity.errors.js";
import type { Principal, ProfileUpdate, UserView } from "../identity.types.js";
import { toUserView } from "./account.view.js";

@Injectable()
export class AccountService {
  constructor(private readonly em: EntityManager) {}

  async ensureProfile(principal: Principal): Promise<IdentityResult<void>> {
    let user = await this.em.findOne(AppUser, principal.accountId);
    if (!user) {
      const profile = new AppUser();
      profile.id = principal.accountId;
      await this.em.createQueryBuilder(AppUser).insert(profile).onConflict("id").ignore().execute();
      user = await this.em.findOneOrFail(AppUser, principal.accountId);
    }
    if (user.status !== "active") return failure("ACCOUNT_UNAVAILABLE", "Account unavailable.");
    return Result.ok(undefined);
  }

  async me(principal: Principal): Promise<UserView> {
    const user = await this.em.findOneOrFail(AppUser, principal.accountId);
    return toUserView(user);
  }

  async updateProfile(
    principal: Principal,
    input: ProfileUpdate,
  ): Promise<IdentityResult<UserView>> {
    const displayName = input.displayName?.trim();
    if (displayName === "") return failure("INVALID_DISPLAY_NAME", "Display name cannot be blank.");
    if (input.avatarUrl != null) {
      const url = new URL(input.avatarUrl);
      if (url.protocol !== "https:" || url.username || url.password) {
        return failure("INVALID_AVATAR_URL", "Avatar URLs must use HTTPS without credentials.");
      }
    }
    const user = await this.em.findOneOrFail(AppUser, principal.accountId);
    if (displayName !== undefined) user.displayName = displayName;
    if (input.avatarUrl !== undefined) user.avatarUrl = input.avatarUrl;
    await this.em.flush();
    return Result.ok(toUserView(user));
  }
}
