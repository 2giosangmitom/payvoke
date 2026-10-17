import { LockMode } from "@mikro-orm/core";
import { EntityManager } from "@mikro-orm/postgresql";
import { Injectable } from "@nestjs/common";
import { Result } from "better-result";
import { SessionService } from "../auth/session.service.js";
import { AppUser, ProjectMembership } from "../identity.entity.js";
import { recordIdentityAudit } from "../shared/identity-audit.js";
import { failure, type IdentityResult } from "../shared/identity.errors.js";
import { identityTransaction } from "../shared/identity.transaction.js";
import type { EditableRole, MemberView, Principal } from "../identity.types.js";

@Injectable()
export class ProjectAccessService {
  constructor(
    private readonly em: EntityManager,
    private readonly sessions: SessionService,
  ) {}

  async authorizeProject(
    principal: Principal,
    projectId: string,
    action: "read" | "draft" | "manage",
  ): Promise<IdentityResult<void>> {
    const session = await this.sessions.principal(principal);
    if (session.isErr()) return session;
    if (action !== "read" && action !== "draft" && action !== "manage") {
      return failure("FORBIDDEN", "Unknown project actions grant no authority.");
    }
    const member = await this.em.findOne(ProjectMembership, {
      projectId,
      userId: principal.accountId,
    });
    // Resource identifiers never reveal another buyer's project or grant authority.
    if (!member) return failure("PROJECT_NOT_FOUND", "Project not found.");
    if (
      (action === "manage" && member.role !== "owner") ||
      (action === "draft" && member.role === "viewer")
    ) {
      return failure("FORBIDDEN", "You do not have permission for this action.");
    }
    return Result.ok(undefined);
  }

  async members(principal: Principal, projectId: string): Promise<IdentityResult<MemberView[]>> {
    const access = await this.authorizeProject(principal, projectId, "read");
    if (access.isErr()) return access;
    const rows = await this.em.find(
      ProjectMembership,
      { projectId },
      { orderBy: { createdAt: "asc" } },
    );
    return Result.ok(rows.map(({ userId, role }) => ({ accountId: userId, role })));
  }

  async changeMember(
    principal: Principal,
    projectId: string,
    userId: string,
    role: EditableRole | null,
    create = false,
  ): Promise<IdentityResult<void>> {
    if (role !== null && role !== "editor" && role !== "viewer") {
      return failure("INVALID_ROLE", "Only editor and viewer memberships can be assigned.");
    }
    return identityTransaction(this.em, async (em) => {
      const session = await this.sessions.requireSession(em, principal, true);
      if (session.isErr()) return session;
      const owner = await em.findOne(
        ProjectMembership,
        { projectId, userId: principal.accountId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!owner) return failure("PROJECT_NOT_FOUND", "Project not found.");
      if (owner.role !== "owner")
        return failure("FORBIDDEN", "Only the project owner can manage members.");
      const target = await em.findOne(ProjectMembership, { projectId, userId });
      if (target?.role === "owner")
        return failure("OWNER_IMMUTABLE", "Owner changes require an ownership-transfer workflow.");
      if (create) {
        if (target) return failure("ALREADY_MEMBER", "The account is already a project member.");
        if (!(await em.findOne(AppUser, { id: userId, status: "active" })))
          return failure("ACCOUNT_NOT_FOUND", "Account not found.");
        if (role === null) return failure("INVALID_ROLE", "A member role is required.");
        em.persist(
          em.create(ProjectMembership, { projectId, userId, role, createdAt: new Date() }),
        );
      } else {
        if (!target) return failure("MEMBER_NOT_FOUND", "Member not found.");
        if (role === null) em.remove(target);
        else target.role = role;
      }
      recordIdentityAudit(
        em,
        principal.accountId,
        role === null ? "membership.removed" : "membership.changed",
        `${projectId}:${userId}`,
      );
      return Result.ok(undefined);
    });
  }

  // Internal M02 integration: the caller owns the project-creation transaction.
  async provisionOwner(
    em: EntityManager,
    projectId: string,
    userId: string,
  ): Promise<IdentityResult<void>> {
    if (!em.isInTransaction())
      throw new Error("Project ownership must be provisioned in a transaction.");
    await em.execute("select pg_advisory_xact_lock(hashtextextended(?, 0))", [
      `project:${projectId}`,
    ]);
    if (!(await em.findOne(AppUser, { id: userId, status: "active" })))
      return failure("ACCOUNT_NOT_FOUND", "Account not found.");
    if (await em.count(ProjectMembership, { projectId }))
      return failure("PROJECT_ALREADY_INITIALIZED", "Project already has members.");
    em.persist(
      em.create(ProjectMembership, { projectId, userId, role: "owner", createdAt: new Date() }),
    );
    return Result.ok(undefined);
  }
}
