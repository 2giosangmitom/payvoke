import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { MikroORM, PostgreSqlDriver } from "@mikro-orm/postgresql";
import { ReflectMetadataProvider } from "@mikro-orm/decorators/legacy";
import { Migrator } from "@mikro-orm/migrations";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { ConfigModule } from "@nestjs/config";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import type { Session } from "@supabase/supabase-js";
import { Result } from "better-result";
import { privateKeyToAccount } from "viem/accounts";
import { parseSiweMessage } from "viem/siwe";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Migration20261017020812 } from "../src/database/migrations/Migration20261017020812.js";
import {
  SupabaseAuthService,
  type VerifiedAuth,
} from "../src/modules/identity/auth/supabase-auth.service.js";
import { SessionService } from "../src/modules/identity/auth/session.service.js";
import { ProjectAccessService } from "../src/modules/identity/access/project-access.service.js";
import { AppUser, identityEntities } from "../src/modules/identity/identity.entity.js";
import { IdentityModule } from "../src/modules/identity/identity.module.js";
import type { AuthTokens, ChallengeView } from "../src/modules/identity/identity.types.js";
import { failure } from "../src/modules/identity/shared/identity.errors.js";
import { identityTransaction } from "../src/modules/identity/shared/identity.transaction.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const wallet = privateKeyToAccount(`0x${"11".repeat(32)}`);

class FakeSupabase {
  readonly tokens = new Map<string, VerifiedAuth>();

  async sendOtp() {
    return Result.ok(undefined);
  }

  mint(): Session {
    const subjectId = randomUUID();
    const sessionId = randomUUID();
    const token = randomUUID();
    this.tokens.set(token, { subjectId, sessionId });
    return {
      access_token: token,
      refresh_token: randomUUID(),
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: "bearer",
      user: {
        id: subjectId,
        aud: "authenticated",
        created_at: new Date().toISOString(),
        app_metadata: {},
        user_metadata: {},
      },
    };
  }

  async verifyOtp() {
    return Result.ok(this.mint());
  }

  async verifyWallet(message: string) {
    if (!parseSiweMessage(message).address) throw new Error("Expected SIWE address");
    return Result.ok(this.mint());
  }

  assertWalletUser() {
    return Result.ok(undefined);
  }

  async authenticate(token: string) {
    const auth = this.tokens.get(token);
    return auth ? Result.ok(auth) : failure("INVALID_SESSION", "Invalid session.");
  }
}

describe.skipIf(!databaseUrl)("Identity API", () => {
  let app: NestFastifyApplication;
  let orm: MikroORM;
  const supabase = new FakeSupabase();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ AUTH_ORIGIN: "http://localhost:3000" })],
        }),
        MikroOrmModule.forRoot({
          driver: PostgreSqlDriver,
          clientUrl: databaseUrl,
          entities: identityEntities,
          metadataProvider: ReflectMetadataProvider,
          extensions: [Migrator],
          migrations: { migrationsList: [Migration20261017020812], snapshot: false },
        }),
        IdentityModule,
      ],
    })
      .overrideProvider(SupabaseAuthService)
      .useValue(supabase)
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
    supabase.tokens.clear();
    await orm.em.fork().execute(`truncate identity.application_sessions, identity.auth_identities,
      identity.auth_challenges, identity.project_memberships, identity.audit_events,
      identity.auth_rate_limits, identity.app_users cascade`);
  });

  const api = () => app.getHttpAdapter().getInstance();
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

  async function emailLogin(email = "buyer@example.com"): Promise<AuthTokens> {
    const request = await api().inject({
      method: "POST",
      url: "/v1/auth/email/otp",
      payload: { email },
    });
    expect(request.statusCode).toBe(201);
    const response = await api().inject({
      method: "POST",
      url: "/v1/auth/email/verify",
      payload: { challengeId: request.json<ChallengeView>().challengeId, token: "123456" },
    });
    expect(response.statusCode, response.body).toBe(200);
    return response.json<AuthTokens>();
  }

  it("requires local session admission, even for a valid Supabase token", async () => {
    const direct = supabase.mint();
    for (const headers of [{}, bearer(direct.access_token)]) {
      const response = await api().inject({ method: "GET", url: "/v1/me", headers });
      expect(response.statusCode).toBe(401);
    }
  });

  it("logs in by email and updates the profile", async () => {
    const login = await emailLogin();
    const headers = bearer(login.accessToken);
    const profile = await api().inject({ method: "GET", url: "/v1/me", headers });
    expect(profile.statusCode).toBe(200);
    expect(profile.json().id).toBe(login.user.id);
    const update = await api().inject({
      method: "PATCH",
      url: "/v1/me",
      headers,
      payload: { displayName: "Buyer" },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().displayName).toBe("Buyer");
  });

  it("rate-limits repeated OTP requests", async () => {
    const request = {
      method: "POST" as const,
      url: "/v1/auth/email/otp",
      payload: { email: "buyer@example.com" },
    };
    expect((await api().inject(request)).statusCode).toBe(201);
    expect((await api().inject(request)).statusCode).toBe(429);
  });

  it("links a wallet once without replacing the current session", async () => {
    const login = await emailLogin();
    const headers = bearer(login.accessToken);
    const challenge = await api().inject({
      method: "POST",
      url: "/v1/me/wallet/challenges",
      headers,
      payload: { address: wallet.address, chainId: 43113 },
    });
    expect(challenge.statusCode).toBe(201);
    const { challengeId, message } = challenge.json<ChallengeView>();
    const request = {
      method: "POST" as const,
      url: "/v1/me/wallet/verify",
      headers,
      payload: { challengeId, signature: await wallet.signMessage({ message: message! }) },
    };
    expect((await api().inject(request)).statusCode).toBe(204);
    expect((await api().inject(request)).statusCode).toBe(401);
    const identities = await api().inject({ method: "GET", url: "/v1/me/identities", headers });
    expect(identities.statusCode).toBe(200);
    expect(identities.json<unknown[]>()).toHaveLength(2);
    expect((await api().inject({ method: "GET", url: "/v1/me", headers })).json().id).toBe(
      login.user.id,
    );
  });

  it("revokes local access on logout", async () => {
    const login = await emailLogin();
    const headers = bearer(login.accessToken);
    expect(
      (await api().inject({ method: "POST", url: "/v1/auth/logout", headers })).statusCode,
    ).toBe(204);
    expect((await supabase.authenticate(login.accessToken)).isOk()).toBe(true);
    expect((await api().inject({ method: "GET", url: "/v1/me", headers })).statusCode).toBe(401);
  });

  it("lets only the owner manage project members and revokes removed members", async () => {
    const owner = await emailLogin("owner@example.com");
    const viewer = await emailLogin("viewer@example.com");
    const projectId = randomUUID();
    const em = orm.em.fork();
    const access = new ProjectAccessService(em, new SessionService(em));
    (
      await identityTransaction(em, (transaction) =>
        access.provisionOwner(transaction, projectId, owner.user.id),
      )
    ).unwrap();
    const path = `/v1/projects/${projectId}/members`;
    const ownerHeaders = bearer(owner.accessToken);
    const viewerHeaders = bearer(viewer.accessToken);
    expect(
      (await api().inject({ method: "GET", url: path, headers: viewerHeaders })).statusCode,
    ).toBe(404);
    const added = await api().inject({
      method: "POST",
      url: path,
      headers: ownerHeaders,
      payload: { accountId: viewer.user.id, role: "viewer" },
    });
    expect(added.statusCode, added.body).toBe(204);
    expect(
      (await api().inject({ method: "GET", url: path, headers: viewerHeaders })).statusCode,
    ).toBe(200);
    expect(
      (
        await api().inject({
          method: "PATCH",
          url: `${path}/${owner.user.id}`,
          headers: viewerHeaders,
          payload: { role: "editor" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await api().inject({
          method: "DELETE",
          url: `${path}/${viewer.user.id}`,
          headers: ownerHeaders,
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (await api().inject({ method: "GET", url: path, headers: viewerHeaders })).statusCode,
    ).toBe(404);
  });

  it("rolls back writes when a transaction returns Err", async () => {
    const result = await identityTransaction(orm.em.fork(), async (em) => {
      em.persist(new AppUser());
      await em.flush();
      return failure("IDENTITY_CONFLICT", "Rejected after a write.");
    });
    expect(result.isErr()).toBe(true);
    expect(await orm.em.fork().count(AppUser, {})).toBe(0);
  });
});
