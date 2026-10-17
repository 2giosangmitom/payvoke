import { LockMode } from "@mikro-orm/core";
import { EntityManager } from "@mikro-orm/postgresql";
import { Injectable } from "@nestjs/common";
import { Result } from "better-result";
import { AppUser, ApplicationSession } from "../identity.entity.js";
import { recordIdentityAudit } from "../shared/identity-audit.js";
import { failure, type IdentityResult } from "../shared/identity.errors.js";
import type { Principal, SessionView } from "../identity.types.js";
import type { VerifiedAuth } from "./supabase-auth.service.js";

@Injectable()
export class SessionService {
  constructor(private readonly em: EntityManager) {}

  async requireSession(
    em: EntityManager,
    auth: VerifiedAuth,
    lock = false,
  ): Promise<IdentityResult<Principal>> {
    const session = await em.findOne(
      ApplicationSession,
      {
        id: auth.sessionId,
        subjectId: auth.subjectId,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      },
      lock ? { lockMode: LockMode.PESSIMISTIC_WRITE } : {},
    );
    // Native Supabase authentication alone never grants marketplace admission.
    if (!session) return failure("SESSION_NOT_ADMITTED", "Sign in through the marketplace API.");
    const user = await em.findOne(AppUser, { id: session.userId, status: "active" });
    if (!user) return failure("ACCOUNT_UNAVAILABLE", "The account is not available.");
    return Result.ok({
      accountId: user.id,
      subjectId: session.subjectId,
      sessionId: session.id,
      authenticatedAt: session.createdAt,
    });
  }

  async principal(auth: VerifiedAuth): Promise<IdentityResult<Principal>> {
    return this.requireSession(this.em, auth);
  }

  async list(principal: Principal): Promise<SessionView[]> {
    const rows = await this.em.find(
      ApplicationSession,
      {
        userId: principal.accountId,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      },
      { orderBy: { createdAt: "desc" } },
    );
    return rows.map((row) => ({
      id: row.id,
      current: row.id === principal.sessionId,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    }));
  }

  async revoke(principal: Principal, all: boolean): Promise<void> {
    await this.em.transactional(async (em) => {
      await em.nativeUpdate(
        ApplicationSession,
        {
          userId: principal.accountId,
          ...(all ? {} : { id: principal.sessionId }),
          revokedAt: null,
        },
        { revokedAt: new Date() },
      );
      recordIdentityAudit(
        em,
        principal.accountId,
        all ? "sessions.revoked" : "session.revoked",
        principal.sessionId,
      );
    });
  }
}
