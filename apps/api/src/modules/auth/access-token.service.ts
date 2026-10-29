import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getAddress } from "viem";
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
  private readonly grantService: Cradle["grantService"];

  constructor({ db, grantService }: Cradle) {
    this.db = db;
    this.grantService = grantService;
  }

  async userId(authorization: string | undefined) {
    return (await this.resolve(authorization)).userId;
  }

  // Returns the token's ID and user ID. Every failure is the same 401 so a
  // caller cannot probe which prefixes or states exist.
  async resolve(authorization: string | undefined) {
    const match = BEARER.exec(authorization ?? "");
    if (!match) throw new UnauthorizedError("INVALID_ACCESS_TOKEN");
    const token = await this.db.buyerAccessToken.findUnique({ where: { prefix: match[2] } });
    const computed = Buffer.from(digest(match[1]), "hex");
    const stored = Buffer.from(token?.secretHash ?? "0".repeat(64), "hex");
    if (
      !timingSafeEqual(computed, stored) ||
      !token ||
      token.revokedAt ||
      token.expiresAt <= new Date()
    )
      throw new UnauthorizedError("INVALID_ACCESS_TOKEN");
    // Best effort; a failed timestamp update must not fail the call.
    void this.db.buyerAccessToken
      .update({ where: { id: token.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
    return { id: token.id, userId: token.userId };
  }

  // Each live token with its autopay grant, if it has one; the grant's
  // limits and spending are read from the vault.
  async list(userId: string) {
    const tokens = await this.db.buyerAccessToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        name: true,
        prefix: true,
        expiresAt: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    const grants = await this.db.vaultGrant.findMany({
      where: { tokenId: { in: tokens.map((token) => token.id) } },
      select: { tokenId: true, grantId: true, buyer: true, signer: true },
    });
    return tokens.map((token) => {
      const grant = grants.find((item) => item.tokenId === token.id);
      return {
        ...token,
        autopay: grant
          ? { grantId: grant.grantId, buyer: grant.buyer, signer: grant.signer }
          : null,
      };
    });
  }

  // With `autopay`, the vault grant the buyer just registered becomes the
  // token's spending policy; without it, every payment needs approval.
  async issue(
    userId: string,
    request: { name: string; expiresAt: Date },
    autopay?: { grantId: string; buyer: string; signer: string },
  ) {
    const active = await this.db.buyerAccessToken.count({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    if (active >= MAX_ACTIVE) throw new ConflictError("TOO_MANY_ACCESS_TOKENS");
    if (autopay) await this.grantService.admit(userId, autopay.buyer);
    const prefix = randomBytes(8).toString("hex");
    const secret = `pvb_${prefix}.${randomBytes(32).toString("hex")}`;
    const created = await this.db.$transaction(async (tx) => {
      const token = await tx.buyerAccessToken.create({
        data: { userId, prefix, secretHash: digest(secret), ...request },
        select: { id: true, name: true, prefix: true, expiresAt: true, createdAt: true },
      });
      if (autopay)
        await tx.vaultGrant.create({
          data: {
            userId,
            tokenId: token.id,
            grantId: autopay.grantId.toLowerCase(),
            buyer: getAddress(autopay.buyer),
            signer: getAddress(autopay.signer),
            kind: "agent",
            name: request.name,
          },
        });
      return token;
    });
    return { ...created, secret };
  }

  async revoke(userId: string, id: string) {
    const result = await this.db.buyerAccessToken.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!result.count) throw new NotFoundError("ACCESS_TOKEN_NOT_FOUND");
    // Without its token the grant cannot reach the vault: payments are only
    // relayed for a signed-in buyer. The console also revokes it on chain.
    await this.db.vaultGrant.deleteMany({ where: { tokenId: id, userId } });
    return { revoked: true };
  }
}
