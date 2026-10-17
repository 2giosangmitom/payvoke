import { Check, Entity, PrimaryKey, Property } from "@mikro-orm/decorators/legacy";

@Entity({ tableName: "app_users", rowLevelSecurity: true })
@Check({ expression: "status in ('active', 'suspended')" })
export class AppUser {
  @PrimaryKey({ type: "uuid" })
  id!: string;

  @Property({ type: "string", nullable: true, length: 100 })
  displayName: string | null = null;

  @Property({ type: "string", nullable: true, length: 2048 })
  avatarUrl: string | null = null;

  @Property({ type: "string", length: 16 })
  status: "active" | "suspended" = "active";

  @Property()
  createdAt: Date = new Date();

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
