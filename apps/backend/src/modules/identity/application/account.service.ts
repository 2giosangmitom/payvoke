import { Result } from "better-result";
import type { IdentityResult } from "../domain/identity.errors.js";
import type { Principal, ProfileUpdate, UserView } from "../domain/identity.types.js";
import type { ProfileRepository } from "./profile.repository.js";
import { toUserView } from "./account.view.js";

export class AccountService {
  readonly #profiles: ProfileRepository;

  constructor({ profiles }: { profiles: ProfileRepository }) {
    this.#profiles = profiles;
  }

  async ensureProfile(principal: Principal): Promise<IdentityResult<void>> {
    const user = await this.#profiles.getOrCreate(principal.accountId);
    return user.checkAvailable();
  }

  async me(principal: Principal): Promise<UserView> {
    const user = await this.#profiles.get(principal.accountId);
    return toUserView(user);
  }

  async updateProfile(
    principal: Principal,
    input: ProfileUpdate,
  ): Promise<IdentityResult<UserView>> {
    const user = await this.#profiles.get(principal.accountId);
    const result = user.updateProfile(input);
    if (result.isErr()) return result;
    await this.#profiles.save(user);
    return Result.ok(toUserView(user));
  }
}
