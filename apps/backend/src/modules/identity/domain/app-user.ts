import { Result } from "better-result";
import { failure, type IdentityResult } from "./identity.errors.js";
import type { ProfileUpdate } from "./identity.types.js";

export class AppUser {
  id!: string;

  displayName: string | null = null;

  avatarUrl: string | null = null;

  status: "active" | "suspended" = "active";

  createdAt: Date = new Date();

  updatedAt: Date = new Date();

  checkAvailable(): IdentityResult<void> {
    if (this.status !== "active") return failure("ACCOUNT_UNAVAILABLE", "Account unavailable.");
    return Result.ok(undefined);
  }

  updateProfile(input: ProfileUpdate): IdentityResult<void> {
    const displayName = input.displayName?.trim();
    if (displayName === "") return failure("INVALID_DISPLAY_NAME", "Display name cannot be blank.");
    if (input.avatarUrl != null) {
      const url = new URL(input.avatarUrl);
      if (url.protocol !== "https:" || url.username || url.password) {
        return failure("INVALID_AVATAR_URL", "Avatar URLs must use HTTPS without credentials.");
      }
    }
    if (displayName !== undefined) this.displayName = displayName;
    if (input.avatarUrl !== undefined) this.avatarUrl = input.avatarUrl;
    return Result.ok(undefined);
  }
}
