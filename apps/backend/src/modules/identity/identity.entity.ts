import { randomUUID } from "node:crypto";
import {
  Check,
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
  Unique,
} from "@mikro-orm/decorators/legacy";
import type { ChallengePurpose, MemberRole } from "./identity.types.js";

// This schema is not exposed through the Supabase Data API. Access is through M01 commands.
@Entity({ schema: "identity", tableName: "app_users", rowLevelSecurity: true })
@Check({ expression: "status in ('active', 'suspended')" })
export class AppUser {
  @PrimaryKey({ type: "uuid" })
  id: string = randomUUID();

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

@Entity({ schema: "identity", tableName: "auth_identities", rowLevelSecurity: true })
@Unique({ properties: ["method", "identifier"] })
@Check({ expression: "method in ('email', 'wallet') and identifier = lower(identifier)" })
export class AuthIdentity {
  @PrimaryKey({ type: "uuid" })
  id: string = randomUUID();

  @Property({ type: "uuid", unique: true })
  subjectId!: string;

  @ManyToOne(() => AppUser, { mapToPk: true, fieldName: "user_id", deleteRule: "restrict" })
  @Index()
  userId!: string;

  @Property({ type: "string", length: 16 })
  method!: "email" | "wallet";

  @Property({ length: 254 })
  identifier!: string;

  @Property()
  createdAt: Date = new Date();
}

@Entity({ schema: "identity", tableName: "application_sessions", rowLevelSecurity: true })
export class ApplicationSession {
  // Supabase session_id, not a second application token. Refresh preserves this ID.
  @PrimaryKey({ type: "uuid" })
  id!: string;

  @ManyToOne(() => AppUser, { mapToPk: true, fieldName: "user_id", deleteRule: "restrict" })
  @Index()
  userId!: string;

  @Property({ type: "uuid" })
  subjectId!: string;

  @Property()
  createdAt: Date = new Date();

  @Property()
  expiresAt!: Date;

  @Property({ type: "datetime", nullable: true })
  revokedAt: Date | null = null;
}

@Entity({ schema: "identity", tableName: "auth_challenges", rowLevelSecurity: true })
@Check({ expression: "purpose in ('email-login', 'wallet-login', 'email-link', 'wallet-link')" })
export class AuthChallenge {
  @PrimaryKey({ type: "uuid" })
  id: string = randomUUID();

  @Property({ type: "string", length: 24 })
  purpose!: ChallengePurpose;

  @Property({ length: 254 })
  identifier!: string;

  @Property({ type: "text", nullable: true })
  message: string | null = null;

  @ManyToOne(() => AppUser, {
    mapToPk: true,
    fieldName: "user_id",
    nullable: true,
    deleteRule: "restrict",
  })
  userId: string | null = null;

  @Property({ type: "uuid", nullable: true })
  sessionId: string | null = null;

  @Property()
  expiresAt!: Date;

  @Property({ type: "datetime", nullable: true })
  consumedAt: Date | null = null;

  @Property()
  createdAt: Date = new Date();
}

@Entity({ schema: "identity", tableName: "project_memberships", rowLevelSecurity: true })
@Unique({ properties: ["projectId", "userId"] })
@Check({ expression: "role in ('owner', 'editor', 'viewer')" })
export class ProjectMembership {
  @PrimaryKey({ type: "uuid" })
  id: string = randomUUID();

  // M02 owns projects and calls provisionOwner inside its project-creation transaction.
  @Property({ type: "uuid" })
  projectId!: string;

  @ManyToOne(() => AppUser, { mapToPk: true, fieldName: "user_id", deleteRule: "restrict" })
  @Index()
  userId!: string;

  @Property({ type: "string", length: 16 })
  role!: MemberRole;

  @Property()
  createdAt: Date = new Date();
}

@Entity({ schema: "identity", tableName: "audit_events", rowLevelSecurity: true })
export class IdentityAuditEvent {
  @PrimaryKey({ type: "uuid" })
  id: string = randomUUID();

  @ManyToOne(() => AppUser, { mapToPk: true, fieldName: "actor_id", deleteRule: "restrict" })
  @Index()
  actorId!: string;

  @Property({ length: 64 })
  action!: string;

  @Property({ length: 254 })
  target!: string;

  @Property()
  createdAt: Date = new Date();
}

@Entity({ schema: "identity", tableName: "auth_rate_limits", rowLevelSecurity: true })
export class AuthRateLimit {
  @PrimaryKey({ length: 64 })
  key!: string;

  @Property()
  count: number = 1;

  @Property()
  expiresAt!: Date;
}

export const identityEntities = [
  AppUser,
  AuthIdentity,
  ApplicationSession,
  AuthChallenge,
  ProjectMembership,
  IdentityAuditEvent,
  AuthRateLimit,
];
