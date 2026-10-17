import { EntitySchema } from "@mikro-orm/core";
import { AppUser } from "../domain/app-user.js";

export const AppUserSchema = new EntitySchema({
  class: AppUser,
  tableName: "app_users",
  rowLevelSecurity: true,
  checks: [{ expression: "status in ('active', 'suspended')" }],
  properties: {
    id: { type: "uuid", primary: true },
    displayName: { type: "string", nullable: true, length: 100 },
    avatarUrl: { type: "string", nullable: true, length: 2048 },
    status: { type: "string", length: 16, default: "active" },
    createdAt: { type: "datetime" },
    updatedAt: { type: "datetime", onUpdate: () => new Date() },
  },
});
