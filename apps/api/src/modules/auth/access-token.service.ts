import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getAddress } from "viem";
import { tokenSigner } from "./token-signer";
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
    return { id: token.id, userId: token.userId, signer: token.signer };
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
        signer: true,
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

  // The key's grant signer is derived from its secret, so the key alone can
  // pay once the buyer registers a vault grant for that signer and links it.
  async issue(userId: string, request: { name: string; expiresAt: Date }) {
    const active = await this.db.buyerAccessToken.count({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    if (active >= MAX_ACTIVE) throw new ConflictError("TOO_MANY_ACCESS_TOKENS");
    const prefix = randomBytes(8).toString("hex");
    const secret = `pvb_${prefix}.${randomBytes(32).toString("hex")}`;
    const created = await this.db.buyerAccessToken.create({
      data: {
        userId,
        prefix,
        secretHash: digest(secret),
        signer: tokenSigner(secret).address,
        ...request,
      },
      select: {
        id: true,
        name: true,
        prefix: true,
        signer: true,
        expiresAt: true,
        createdAt: true,
      },
    });
    return { ...created, secret };
  }

  private async live(userId: string, id: string) {
    const token = await this.db.buyerAccessToken.findFirst({
      where: { id, userId, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!token) throw new NotFoundError("ACCESS_TOKEN_NOT_FOUND");
    return token;
  }

  // Makes a vault grant the buyer registered for the key's signer its
  // autopay limit, replacing an earlier one. The vault checks the signer on
  // every payment, so a grant for another signer could never pay.
  async linkGrant(userId: string, id: string, grant: { grantId: string; buyer: string }) {
    const token = await this.live(userId, id);
    if (!token.signer) throw new ConflictError("ACCESS_TOKEN_NEEDS_RECREATE");
    const data = {
      grantId: grant.grantId.toLowerCase(),
      buyer: getAddress(grant.buyer),
      signer: token.signer,
    };
    const existing = await this.db.vaultGrant.findUnique({ where: { tokenId: id } });
    await this.grantService.admit(userId, grant.buyer, Boolean(existing));
    await this.db.vaultGrant.upsert({
      where: { tokenId: id },
      create: { userId, tokenId: id, kind: "agent", name: token.name, ...data },
      update: data,
    });
    return { linked: true };
  }

  // Extends a live key. The console moves its grant's expiry in the vault
  // to the same day first.
  async extend(userId: string, id: string, expiresAt: Date) {
    const token = await this.live(userId, id);
    if (expiresAt <= token.expiresAt) throw new ConflictError("ACCESS_TOKEN_EXPIRY_NOT_LATER");
    await this.db.buyerAccessToken.update({ where: { id }, data: { expiresAt } });
    return { expiresAt };
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
