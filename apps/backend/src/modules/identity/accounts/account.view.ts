import type { AppUser } from "../identity.entity.js";
import type { UserView } from "../identity.types.js";

export function toUserView(user: AppUser): UserView {
  return {
    id: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    status: user.status,
  };
}
