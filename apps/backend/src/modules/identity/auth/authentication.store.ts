import { UniqueConstraintViolationException } from "@mikro-orm/core";
import { EntityManager } from "@mikro-orm/postgresql";
import { Injectable } from "@nestjs/common";
import { Result } from "better-result";
import { toUserView } from "../accounts/account.view.js";
import { AppUser, ApplicationSession, AuthIdentity } from "../identity.entity.js";
import { recordIdentityAudit } from "../shared/identity-audit.js";
import { failure, type IdentityResult } from "../shared/identity.errors.js";
import { identityTransaction } from "../shared/identity.transaction.js";
import type { Principal, UserView } from "../identity.types.js";
import { requireRecentAuthentication, SESSION_ADMISSION_TTL_MS } from "./auth.policy.js";
import { SessionService } from "./session.service.js";
import type { VerifiedAuth } from "./supabase-auth.service.js";

@Injectable()
export class AuthenticationStore {
  constructor(
    private readonly em: EntityManager,
    private readonly sessions: SessionService,
  ) {}

  // All identity claims and session admission commit atomically, after external proof verification.
  async completeAuthentication(
    auth: VerifiedAuth,
    method: "email" | "wallet",
    identifier: string,
    linking?: Principal,
  ): Promise<IdentityResult<UserView>> {
    try {
      return await identityTransaction<UserView>(this.em, async (em) => {
        for (const key of [
          `subject:${auth.subjectId}`,
          `identity:${method}:${identifier}`,
        ].sort()) {
          await em.execute("select pg_advisory_xact_lock(hashtextextended(?, 0))", [key]);
        }
        if (linking) {
          const session = await this.sessions.requireSession(em, linking, true);
          if (session.isErr()) return session;
          const current = session.value;
          if (current.accountId !== linking.accountId)
            return failure("INVALID_SESSION", "Invalid session.");
          const recent = requireRecentAuthentication(current);
          if (recent.isErr()) return recent;
        }
        const bySubject = await em.findOne(AuthIdentity, { subjectId: auth.subjectId });
        const byIdentifier = await em.findOne(AuthIdentity, { method, identifier });
        if (bySubject && (bySubject.method !== method || bySubject.identifier !== identifier)) {
          return failure(
            "IDENTITY_CONFLICT",
            "This Auth identity has a different marketplace binding.",
          );
        }
        if (byIdentifier && byIdentifier.subjectId !== auth.subjectId) {
          return failure("IDENTITY_CONFLICT", "This identity has a different Auth binding.");
        }
        const identity = bySubject ?? byIdentifier;
        if (identity && linking && identity.userId !== linking.accountId) {
          return failure("IDENTITY_ALREADY_LINKED", "This identity belongs to another account.");
        }
        let user: AppUser;
        const userId = identity?.userId ?? linking?.accountId;
        if (userId) {
          const existing = await em.findOne(AppUser, { id: userId, status: "active" });
          if (!existing) return failure("ACCOUNT_UNAVAILABLE", "The account is not available.");
          user = existing;
        } else {
          user = new AppUser();
          em.persist(user);
        }
        if (!identity) {
          em.persist(
            em.create(AuthIdentity, {
              subjectId: auth.subjectId,
              userId: user.id,
              method,
              identifier,
              createdAt: new Date(),
            }),
          );
        }
        if (!linking) {
          em.persist(
            em.create(ApplicationSession, {
              id: auth.sessionId,
              subjectId: auth.subjectId,
              userId: user.id,
              createdAt: new Date(),
              expiresAt: new Date(Date.now() + SESSION_ADMISSION_TTL_MS),
            }),
          );
        }
        recordIdentityAudit(
          em,
          user.id,
          linking ? "identity.linked" : "session.admitted",
          linking ? method : auth.sessionId,
        );
        return Result.ok(toUserView(user));
      });
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException) {
        return failure(
          "IDENTITY_CONFLICT",
          "The identity or session was already claimed. Sign in again.",
        );
      }
      throw error;
    }
  }
}
