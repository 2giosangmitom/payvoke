import type { EntityManager } from "@mikro-orm/postgresql";
import { IdentityAuditEvent } from "../identity.entity.js";

type AuditAction =
  | "identity.linked"
  | "session.admitted"
  | "session.revoked"
  | "sessions.revoked"
  | "profile.updated"
  | "membership.removed"
  | "membership.changed";

// Persist in the caller's unit of work so the audit and its mutation commit together.
export function recordIdentityAudit(
  em: EntityManager,
  actorId: string,
  action: AuditAction,
  target: string,
): void {
  em.persist(em.create(IdentityAuditEvent, { actorId, action, target, createdAt: new Date() }));
}
