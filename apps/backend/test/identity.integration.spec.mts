import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { MikroORM, PostgreSqlDriver } from "@mikro-orm/postgresql";
import { ReflectMetadataProvider } from "@mikro-orm/decorators/legacy";
import { Migrator } from "@mikro-orm/migrations";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { Result } from "better-result";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Migration20261017070519 } from "../src/database/migrations/Migration20261017070519.js";
import { SupabaseAuthService } from "../src/modules/identity/auth/supabase-auth.service.js";
import { AppUser } from "../src/modules/identity/identity.entity.js";
import { IdentityModule } from "../src/modules/identity/identity.module.js";
import { failure } from "../src/modules/identity/shared/identity.errors.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const accountId = randomUUID();
const headers = { authorization: "Bearer supabase-token" };

describe.skipIf(!databaseUrl)("Identity API", () => {
  let app: NestFastifyApplication;
  let orm: MikroORM;
  const authenticate = vi.fn();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        MikroOrmModule.forRoot({
          driver: PostgreSqlDriver,
          clientUrl: databaseUrl,
          entities: [AppUser],
          metadataProvider: ReflectMetadataProvider,
          extensions: [Migrator],
          migrations: { migrationsList: [Migration20261017070519], snapshot: false },
        }),
        IdentityModule,
      ],
    })
      .overrideProvider(SupabaseAuthService)
      .useValue({ authenticate })
      .compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
      logger: false,
    });
    orm = module.get(MikroORM);
    await orm.migrator.up();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    authenticate.mockReset().mockResolvedValue(Result.ok({ accountId }));
    await orm.em.fork().nativeDelete(AppUser, {});
  });

  const api = () => app.getHttpAdapter().getInstance();

  it("rejects missing or invalid Supabase tokens without creating a profile", async () => {
    expect((await api().inject({ method: "GET", url: "/v1/me" })).statusCode).toBe(401);
    expect(authenticate).not.toHaveBeenCalled();
    authenticate.mockResolvedValue(failure("INVALID_SESSION", "Invalid session."));
    expect((await api().inject({ method: "GET", url: "/v1/me", headers })).statusCode).toBe(401);
    expect(await orm.em.fork().count(AppUser, {})).toBe(0);
  });

  it("creates one profile using the Supabase user ID, including concurrent first requests", async () => {
    const responses = await Promise.all(
      [0, 1].map(() => api().inject({ method: "GET", url: "/v1/me", headers })),
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
    const response = await api().inject({
      method: "PATCH",
      url: "/v1/me",
      headers,
      payload: { displayName: " Buyer " },
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().displayName).toBe("Buyer");
    const invalid = await api().inject({
      method: "PATCH",
      url: "/v1/me",
      headers,
      payload: { avatarUrl: "http://example.com/avatar.png" },
    });
    expect(invalid.statusCode).toBe(400);
    expect((await orm.em.fork().findOneOrFail(AppUser, otherId)).displayName).toBeNull();
    expect((await api().inject({ method: "GET", url: "/v1/me", headers })).json().displayName).toBe(
      "Buyer",
    );
  });

  it("rejects suspended accounts without overwriting their status", async () => {
    const user = new AppUser();
    user.id = accountId;
    user.status = "suspended";
    await orm.em.fork().persist(user).flush();
    const response = await api().inject({ method: "GET", url: "/v1/me", headers });
    expect(response.statusCode).toBe(403);
    expect((await orm.em.fork().findOneOrFail(AppUser, accountId)).status).toBe("suspended");
  });
});
