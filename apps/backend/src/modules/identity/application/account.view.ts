import type { AppUser } from "../domain/app-user.js";
import type { UserView } from "../domain/identity.types.js";

export function toUserView(user: AppUser): UserView {
  return {
    id: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    status: user.status,
  };
}
