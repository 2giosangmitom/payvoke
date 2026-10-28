import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Cradle } from "../../container";
import { ConflictError, NotFoundError, UnauthorizedError } from "../../errors";

const BEARER = /^Bearer (pvb_([a-f0-9]{16})\.[a-f0-9]{64})$/;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const MAX_ACTIVE = 10;

export const isBuyerToken = (authorization: string | undefined) =>
  authorization?.startsWith("Bearer pvb_") ?? false;

// Buyer personal access tokens for MCP hosts and scripts, stored only as a
// SHA-256 hash. The secret is returned once, when the token is issued.
export class AccessTokenService {
  private readonly db: Cradle["db"];

  constructor({ db }: Cradle) {
    this.db = db;
  }

  // Returns the token's user ID. Every failure is the same 401 so a caller
  // cannot probe which prefixes or states exist.
  async userId(authorization: string | undefined) {
    const match = BEARER.exec(authorization ?? "");
    if (!match) throw new UnauthorizedError("INVALID_ACCESS_TOKEN");
    const token = await this.db.buyerAccessToken.findUnique({ where: { prefix: match[2] } });
    const computed = Buffer.from(digest(match[1]), "hex");
    const stored = Buffer.from(token?.secretHash ?? "0".repeat(64), "hex");
    if (!timingSafeEqual(computed, stored) || !token || token.revokedAt || token.expiresAt <= new Date())
      throw new UnauthorizedError("INVALID_ACCESS_TOKEN");
    // Best effort; a failed timestamp update must not fail the call.
    void this.db.buyerAccessToken
      .update({ where: { id: token.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
    return token.userId;
  }

  list(userId: string) {
    return this.db.buyerAccessToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, name: true, prefix: true, expiresAt: true, lastUsedAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async issue(userId: string, request: { name: string; expiresAt: Date }) {
    const active = await this.db.buyerAccessToken.count({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    if (active >= MAX_ACTIVE) throw new ConflictError("TOO_MANY_ACCESS_TOKENS");
    const prefix = randomBytes(8).toString("hex");
    const secret = `pvb_${prefix}.${randomBytes(32).toString("hex")}`;
    const created = await this.db.buyerAccessToken.create({
      data: { userId, prefix, secretHash: digest(secret), ...request },
      select: { id: true, name: true, prefix: true, expiresAt: true, createdAt: true },
    });
    return { ...created, secret };
  }

  async revoke(userId: string, id: string) {
    const result = await this.db.buyerAccessToken.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!result.count) throw new NotFoundError("ACCESS_TOKEN_NOT_FOUND");
    return { revoked: true };
  }
}
