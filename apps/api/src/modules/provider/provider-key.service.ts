import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Cradle } from "../../container";
import { ForbiddenError, NotFoundError, UnauthorizedError } from "../../errors";
import type { KeyScope } from "./provider.validation";

const BEARER = /^Bearer (pvk_([a-f0-9]{16})\.[a-f0-9]{64})$/;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

// Provider API keys: one active key per app, stored only as a SHA-256 hash.
// Browser cookies can never stand in for a key on provider worker routes.
export class ProviderKeyService {
  private readonly db: Cradle["db"];

  constructor({ db }: Cradle) {
    this.db = db;
  }

  // Returns the key's app. Every failure is the same 401 so a caller cannot
  // probe which prefixes, apps or states exist; only a valid key learns its scope.
  async authenticate(authorization: string | undefined, appId: string, scope: KeyScope) {
    const match = BEARER.exec(authorization ?? "");
    if (!match) throw new UnauthorizedError("INVALID_PROVIDER_KEY");
    const key = await this.db.appApiKey.findUnique({
      where: { prefix: match[2] },
      include: { app: true },
    });
    const computed = Buffer.from(digest(match[1]), "hex");
    const stored = Buffer.from(key?.secretHash ?? "0".repeat(64), "hex");
    if (
      !timingSafeEqual(computed, stored) ||
      !key ||
      key.appId !== appId ||
      key.revokedAt ||
      key.app.status !== "ACTIVE" ||
      key.app.archivedAt
    )
      throw new UnauthorizedError("INVALID_PROVIDER_KEY");
    if (!key.scopes.includes(scope)) throw new ForbiddenError("INSUFFICIENT_SCOPE");
    // Best effort; a failed timestamp update must not fail the provider call.
    void this.db.appApiKey
      .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
    return key.app;
  }

  list(appId: string) {
    return this.db.appApiKey.findMany({
      where: { appId },
      select: {
        id: true,
        prefix: true,
        scopes: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
  }

  // Rotation: issuing a key revokes every earlier key of the app. The secret is
  // returned once and never stored.
  async issue(appId: string, request: { scopes: string[] }) {
    const prefix = randomBytes(8).toString("hex");
    const secret = `pvk_${prefix}.${randomBytes(32).toString("hex")}`;
    const created = await this.db.$transaction(async (tx) => {
      await tx.appApiKey.updateMany({
        where: { appId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return tx.appApiKey.create({
        data: {
          appId,
          prefix,
          secretHash: digest(secret),
          scopes: request.scopes,
        },
        select: { id: true, scopes: true },
      });
    });
    return { ...created, secret };
  }

  async revoke(appId: string, keyId: string) {
    const result = await this.db.appApiKey.updateMany({
      where: { id: keyId, appId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!result.count) throw new NotFoundError("KEY_NOT_FOUND");
    return { revoked: true };
  }
}
