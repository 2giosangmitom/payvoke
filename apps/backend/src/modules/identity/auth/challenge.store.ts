import { createHash } from "node:crypto";
import { EntityManager } from "@mikro-orm/postgresql";
import { Injectable } from "@nestjs/common";
import { Result } from "better-result";
import { AuthChallenge } from "../identity.entity.js";
import { failure, type IdentityResult } from "../shared/identity.errors.js";
import type { ChallengePurpose, Principal } from "../identity.types.js";

@Injectable()
export class ChallengeStore {
  constructor(private readonly em: EntityManager) {}

  async throttle(
    scope: string,
    identifier: string,
    maximum: number,
    seconds: number,
  ): Promise<IdentityResult<void>> {
    const bucket = Math.floor(Date.now() / (seconds * 1000));
    const key = createHash("sha256").update(`${scope}:${identifier}:${bucket}`).digest("hex");
    const expiresAt = new Date((bucket + 1) * seconds * 1000);
    const rows = await this.em.execute<{ count: number }[]>(
      `insert into identity.auth_rate_limits (key, count, expires_at) values (?, 1, ?)
       on conflict (key) do update set count = identity.auth_rate_limits.count + 1
       returning count`,
      [key, expiresAt],
    );
    if (!rows[0] || rows[0].count > maximum)
      return failure("RATE_LIMITED", "Too many attempts. Try again later.");
    return Result.ok(undefined);
  }

  async save(challenge: AuthChallenge): Promise<void> {
    await this.em.persist(challenge).flush();
  }

  async find(
    id: string,
    purpose: ChallengePurpose,
    principal?: Principal,
  ): Promise<IdentityResult<AuthChallenge>> {
    const challenge = await this.em.findOne(AuthChallenge, {
      id,
      purpose,
      userId: principal?.accountId ?? null,
      sessionId: principal?.sessionId ?? null,
      consumedAt: null,
      expiresAt: { $gt: new Date() },
    });
    if (!challenge)
      return failure("INVALID_CHALLENGE", "The challenge is invalid, used, or expired.");
    return Result.ok(challenge);
  }

  async consume(challenge: AuthChallenge): Promise<IdentityResult<void>> {
    const now = new Date();
    const changed = await this.em.nativeUpdate(
      AuthChallenge,
      {
        id: challenge.id,
        consumedAt: null,
        expiresAt: { $gt: now },
      },
      { consumedAt: now },
    );
    if (changed !== 1)
      return failure("INVALID_CHALLENGE", "The challenge is invalid, used, or expired.");
    return Result.ok(undefined);
  }
}
