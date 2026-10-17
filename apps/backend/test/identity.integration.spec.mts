import { randomUUID } from "node:crypto";
import { Migrator } from "@mikro-orm/migrations";
import { MikroORM, PostgreSqlDriver } from "@mikro-orm/postgresql";
import { asValue } from "awilix";
import { Result } from "better-result";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { Environment } from "../src/config/environment.js";
import { Migration20261017070519 } from "../src/database/migrations/Migration20261017070519.js";
import type { SupabaseAuthService } from "../src/modules/identity/infrastructure/supabase-auth.service.js";
import { AppUser } from "../src/modules/identity/domain/app-user.js";
import { AppUserSchema } from "../src/modules/identity/infrastructure/app-user.schema.js";
import { failure } from "../src/modules/identity/domain/identity.errors.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "";
const accountId = randomUUID();
const headers = { authorization: "Bearer supabase-token" };

describe.skipIf(databaseUrl === "")("Identity API", () => {
  let app: FastifyInstance;
  let orm: MikroORM;
  const authenticate = vi.fn();

  beforeAll(async () => {
    orm = await MikroORM.init({
      driver: PostgreSqlDriver,
      clientUrl: databaseUrl,
      entities: [AppUserSchema],
      extensions: [Migrator],
      migrations: { migrationsList: [Migration20261017070519], snapshot: false },
    });
    await orm.migrator.up();
    const env = {
      DATABASE_URL: databaseUrl,
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "test-key",
      AUTH_ORIGIN: "http://localhost:3000",
      PORT: 8000,
    } satisfies Environment;
    app = await createApp({ env, orm, logger: false });
    app.diContainer.register({
      authService: asValue({ authenticate } as unknown as SupabaseAuthService),
    });
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    authenticate.mockReset().mockResolvedValue(Result.ok({ accountId }));
    await orm.em.fork().nativeDelete(AppUser, {});
  });

  it("maps explicit schemas to the existing migration without database changes", async () => {
    expect(await orm.schema.getUpdateSchemaSQL({ wrap: false })).toBe("");
  });

  it("rejects missing or invalid Supabase tokens without creating a profile", async () => {
    expect((await app.inject({ method: "GET", url: "/v1/me" })).statusCode).toBe(401);
    expect(authenticate).not.toHaveBeenCalled();
    authenticate.mockResolvedValue(failure("INVALID_SESSION", "Invalid session."));
    expect((await app.inject({ method: "GET", url: "/v1/me", headers })).statusCode).toBe(401);
    expect(await orm.em.fork().count(AppUser, {})).toBe(0);
  });

  it("creates one profile using the Supabase user ID, including concurrent first requests", async () => {
    const responses = await Promise.all(
      [0, 1].map(() => app.inject({ method: "GET", url: "/v1/me", headers })),
    );
    for (const response of responses) {
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json()).toEqual({
        id: accountId,
        displayName: null,
        avatarUrl: null,
        status: "active",
      });
      expect(response.headers["cache-control"]).toBe("no-store");
    }
    expect(authenticate).toHaveBeenCalledWith("supabase-token");
    expect(await orm.em.fork().count(AppUser, {})).toBe(1);
  });

  it("updates only the authenticated user's profile and rejects unsafe input", async () => {
    const otherId = randomUUID();
    const other = new AppUser();
    other.id = otherId;
    await orm.em.fork().persist(other).flush();
    const response = await app.inject({
      method: "PATCH",
      url: "/v1/me",
      headers,
      payload: { displayName: " Buyer " },
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().displayName).toBe("Buyer");
    const invalid = await app.inject({
      method: "PATCH",
      url: "/v1/me",
      headers,
      payload: { avatarUrl: "http://example.com/avatar.png" },
    });
    expect(invalid.statusCode, invalid.body).toBe(400);
    expect((await orm.em.fork().findOneOrFail(AppUser, otherId)).displayName).toBeNull();
    expect((await app.inject({ method: "GET", url: "/v1/me", headers })).json().displayName).toBe(
      "Buyer",
    );
  });

  it("rejects suspended accounts without overwriting their status", async () => {
    const user = new AppUser();
    user.id = accountId;
    user.status = "suspended";
    await orm.em.fork().persist(user).flush();
    const response = await app.inject({ method: "GET", url: "/v1/me", headers });
    expect(response.statusCode, response.body).toBe(403);
    expect((await orm.em.fork().findOneOrFail(AppUser, accountId)).status).toBe("suspended");
  });
});
