import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { MikroORM, PostgreSqlDriver } from "@mikro-orm/postgresql";
import { ReflectMetadataProvider } from "@mikro-orm/decorators/legacy";
import { Migrator } from "@mikro-orm/migrations";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { ConfigModule } from "@nestjs/config";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import type { Session, User } from "@supabase/supabase-js";
import { Result } from "better-result";
import { privateKeyToAccount } from "viem/accounts";
import { parseSiweMessage } from "viem/siwe";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type {
  VerifiedAuth,
  SupabaseAuthService as SupabaseAuthContract,
} from "../src/modules/identity/auth/supabase-auth.service.js";
import type { IdentityResult } from "../src/modules/identity/shared/identity.errors.js";
import type {
  AuthTokens,
  ChallengeView,
  Principal,
} from "../src/modules/identity/identity.types.js";

// Load the real CommonJS module graph once; mixed Vitest imports/require duplicate DI tokens.
const require = createRequire(import.meta.url);
const {
  AppUser,
  ApplicationSession,
  AuthChallenge,
  AuthIdentity,
  AuthRateLimit,
  identityEntities,
}: typeof import("../src/modules/identity/identity.entity.js") = require("../src/modules/identity/identity.entity.js");
const {
  failure,
}: typeof import("../src/modules/identity/shared/identity.errors.js") = require("../src/modules/identity/shared/identity.errors.js");
const {
  IdentityModule,
}: typeof import("../src/modules/identity/identity.module.js") = require("../src/modules/identity/identity.module.js");
const {
  AuthenticationStore,
}: typeof import("../src/modules/identity/auth/authentication.store.js") = require("../src/modules/identity/auth/authentication.store.js");
const {
  SessionService,
}: typeof import("../src/modules/identity/auth/session.service.js") = require("../src/modules/identity/auth/session.service.js");
const {
  ProjectAccessService,
}: typeof import("../src/modules/identity/access/project-access.service.js") = require("../src/modules/identity/access/project-access.service.js");
const {
  SupabaseAuthService,
}: typeof import("../src/modules/identity/auth/supabase-auth.service.js") = require("../src/modules/identity/auth/supabase-auth.service.js");
const {
  identityTransaction,
}: typeof import("../src/modules/identity/shared/identity.transaction.js") = require("../src/modules/identity/shared/identity.transaction.js");

// Only an explicitly supplied disposable database is used. Never falls back to DATABASE_URL.
const databaseUrl = process.env.TEST_DATABASE_URL;
const wallet = privateKeyToAccount(`0x${"11".repeat(32)}`);
const otherWallet = privateKeyToAccount(`0x${"22".repeat(32)}`);

class FakeSupabase implements Pick<
  SupabaseAuthContract,
  "sendOtp" | "verifyOtp" | "verifyWallet" | "assertWalletUser" | "authenticate"
> {
  readonly subjects = new Map<string, string>();
  readonly tokens = new Map<string, VerifiedAuth>();
  sendCount = 0;
  sendDefect: Error | null = null;
  walletFailure = false;
  walletVerifications = 0;

  async sendOtp(_email: string): Promise<IdentityResult<void>> {
    this.sendCount++;
    if (this.sendDefect) throw this.sendDefect;
    return Result.ok(undefined);
  }

  mint(identifier: string, method: "email" | "wallet"): Session {
    const subjectId = this.subjects.get(identifier) ?? randomUUID();
    this.subjects.set(identifier, subjectId);
    const sessionId = randomUUID();
    const token = `test-token-${randomUUID()}`;
    this.tokens.set(token, { subjectId, sessionId });
    const user: User = {
      id: subjectId,
      aud: "authenticated",
      created_at: new Date().toISOString(),
      app_metadata: {},
      user_metadata: {},
      ...(method === "email"
        ? { email: identifier, email_confirmed_at: new Date().toISOString() }
        : {}),
    };
    return {
      access_token: token,
      refresh_token: randomUUID(),
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: "bearer",
      user,
    };
  }

  async verifyOtp(email: string, token: string): Promise<IdentityResult<Session>> {
    if (token !== "123456") return failure("INVALID_OTP", "Invalid OTP.");
    return Result.ok(this.mint(email, "email"));
  }

  async verifyWallet(message: string, _signature: `0x${string}`): Promise<IdentityResult<Session>> {
    this.walletVerifications++;
    if (this.walletFailure) return failure("INVALID_WALLET_PROOF", "Wallet authentication failed.");
    const address = parseSiweMessage(message).address;
    if (!address) throw new Error("Expected SIWE address.");
    return Result.ok(this.mint(address.toLowerCase(), "wallet"));
  }

  assertWalletUser(_user: User, _address: string): IdentityResult<void> {
    return Result.ok(undefined);
  }

  async authenticate(token: string): Promise<IdentityResult<VerifiedAuth>> {
    const auth = this.tokens.get(token);
    if (!auth) return failure("INVALID_SESSION", "Invalid session.");
    return Result.ok(auth);
  }
}

describe.skipIf(!databaseUrl)("M01 API (isolated PostgreSQL; mocked Supabase transport)", () => {
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
          migrations: {
            path: fileURLToPath(new URL("../src/database/migrations/", import.meta.url)),
            glob: "!(*.d).js",
          },
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
    supabase.subjects.clear();
    supabase.tokens.clear();
    supabase.sendCount = 0;
    supabase.sendDefect = null;
    supabase.walletFailure = false;
    supabase.walletVerifications = 0;
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
    const challenge = request.json<ChallengeView>();
    const response = await api().inject({
      method: "POST",
      url: "/v1/auth/email/verify",
      payload: { challengeId: challenge.challengeId, token: "123456" },
    });
    expect(response.statusCode, response.body).toBe(200);
    return response.json<AuthTokens>();
  }

  async function walletChallenge(token?: string): Promise<ChallengeView> {
    const response = await api().inject({
      method: "POST",
      url: token ? "/v1/me/wallet/challenges" : "/v1/auth/wallet/challenges",
      headers: token ? bearer(token) : {},
      payload: { address: wallet.address, chainId: 43113 },
    });
    expect(response.statusCode, response.body).toBe(201);
    return response.json<ChallengeView>();
  }

  async function principal(login: AuthTokens): Promise<Principal> {
    const sessions = new SessionService(orm.em.fork());
    return (
      await sessions.principal((await supabase.authenticate(login.accessToken)).unwrap())
    ).unwrap();
  }

  it("denies missing/malformed tokens and rejects direct Supabase sessions", async () => {
    for (const authorization of [undefined, "Basic a", "Bearer bad", "Bearer x y"]) {
      const response = await api().inject({
        method: "GET",
        url: "/v1/me",
        headers: authorization ? { authorization } : {},
      });
      expect(response.statusCode).toBe(401);
    }
    const direct = supabase.mint(wallet.address.toLowerCase(), "wallet");
    const response = await api().inject({
      method: "GET",
      url: "/v1/me",
      headers: bearer(direct.access_token),
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe("SESSION_NOT_ADMITTED");
  });

  it("creates a profile on email login, reuses the account, and only returns safe fields", async () => {
    const first = await emailLogin();
    await orm.em.fork().nativeDelete(AuthRateLimit, {});
    const second = await emailLogin();
    expect(second.user.id).toBe(first.user.id);
    expect(await orm.em.fork().count(AppUser, {})).toBe(1);
    const response = await api().inject({
      method: "GET",
      url: "/v1/me",
      headers: bearer(first.accessToken),
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual({
      id: first.user.id,
      displayName: null,
      avatarUrl: null,
      status: "active",
    });
    const update = await api().inject({
      method: "PATCH",
      url: "/v1/me",
      headers: bearer(first.accessToken),
      payload: { displayName: "  Buyer  " },
    });
    expect(update.json().displayName).toBe("Buyer");
  });

  it("rejects unsafe profile URLs and blank names without persisting changes", async () => {
    const login = await emailLogin();
    for (const payload of [
      { displayName: "   " },
      { avatarUrl: "javascript:alert(1)" },
      { avatarUrl: "http://example.com/a.png" },
    ]) {
      const response = await api().inject({
        method: "PATCH",
        url: "/v1/me",
        headers: bearer(login.accessToken),
        payload,
      });
      expect(response.statusCode).toBe(400);
    }
    expect((await orm.em.fork().findOneOrFail(AppUser, login.user.id)).displayName).toBeNull();
  });

  it("rate-limits OTP sends and consumes invalid OTP attempts", async () => {
    const first = await api().inject({
      method: "POST",
      url: "/v1/auth/email/otp",
      payload: { email: "buyer@example.com" },
    });
    const second = await api().inject({
      method: "POST",
      url: "/v1/auth/email/otp",
      payload: { email: "buyer@example.com" },
    });
    expect(second.statusCode).toBe(429);
    expect(supabase.sendCount).toBe(1);
    const challengeId = first.json<ChallengeView>().challengeId;
    const wrong = await api().inject({
      method: "POST",
      url: "/v1/auth/email/verify",
      payload: { challengeId, token: "000000" },
    });
    expect(wrong.statusCode).toBe(401);
    const retry = await api().inject({
      method: "POST",
      url: "/v1/auth/email/verify",
      payload: { challengeId, token: "123456" },
    });
    expect(retry.statusCode).toBe(401);
    expect(await orm.em.fork().count(AppUser, {})).toBe(0);
  });

  it("verifies a real EOA signature and admits only one concurrent wallet request", async () => {
    const challenge = await walletChallenge();
    expect(challenge.message).toContain("localhost:3000 wants you to sign in");
    expect(challenge.message).toContain("Chain ID: 43113");
    const signature = await wallet.signMessage({ message: challenge.message! });
    const responses = await Promise.all(
      [0, 1].map(() =>
        api().inject({
          method: "POST",
          url: "/v1/auth/wallet/verify",
          payload: { challengeId: challenge.challengeId, signature },
        }),
      ),
    );
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 401]);
    expect(await orm.em.fork().count(ApplicationSession, {})).toBe(1);
  });

  it("rejects another signer, modified-domain signatures, wrong chains, and expired challenges", async () => {
    const challenge = await walletChallenge();
    for (const signature of [
      await otherWallet.signMessage({ message: challenge.message! }),
      await wallet.signMessage({
        message: challenge.message!.replace("localhost:3000", "evil.example"),
      }),
    ]) {
      const response = await api().inject({
        method: "POST",
        url: "/v1/auth/wallet/verify",
        payload: { challengeId: challenge.challengeId, signature },
      });
      expect(response.statusCode).toBe(401);
    }
    const chain = await api().inject({
      method: "POST",
      url: "/v1/auth/wallet/challenges",
      payload: { address: wallet.address, chainId: 1 },
    });
    expect(chain.statusCode).toBe(400);
    await orm.em
      .fork()
      .nativeUpdate(AuthChallenge, challenge.challengeId, { expiresAt: new Date(0) });
    const expired = await api().inject({
      method: "POST",
      url: "/v1/auth/wallet/verify",
      payload: {
        challengeId: challenge.challengeId,
        signature: await wallet.signMessage({ message: challenge.message! }),
      },
    });
    expect(expired.statusCode).toBe(401);
  });

  it("links a wallet without switching sessions, then wallet login resolves the same account", async () => {
    const login = await emailLogin();
    const challenge = await walletChallenge(login.accessToken);
    const response = await api().inject({
      method: "POST",
      url: "/v1/me/wallet/verify",
      headers: bearer(login.accessToken),
      payload: {
        challengeId: challenge.challengeId,
        signature: await wallet.signMessage({ message: challenge.message! }),
      },
    });
    expect(response.statusCode, response.body).toBe(204);
    expect(await orm.em.fork().count(ApplicationSession, {})).toBe(1);
    const next = await walletChallenge();
    const walletLogin = await api().inject({
      method: "POST",
      url: "/v1/auth/wallet/verify",
      payload: {
        challengeId: next.challengeId,
        signature: await wallet.signMessage({ message: next.message! }),
      },
    });
    expect(walletLogin.statusCode, walletLogin.body).toBe(200);
    expect(walletLogin.json<AuthTokens>().user.id).toBe(login.user.id);
    const identities = await api().inject({
      method: "GET",
      url: "/v1/me/identities",
      headers: bearer(login.accessToken),
    });
    expect(identities.json<unknown[]>()).toHaveLength(2);
    // A native login/replay can mint another Supabase session for this same subject,
    // but that session has no marketplace admission and cannot bypass our nonce check.
    const direct = supabase.mint(wallet.address.toLowerCase(), "wallet");
    expect(
      (await api().inject({ method: "GET", url: "/v1/me", headers: bearer(direct.access_token) }))
        .statusCode,
    ).toBe(401);
    await api().inject({
      method: "POST",
      url: "/v1/auth/logout-all",
      headers: bearer(login.accessToken),
    });
    for (const token of [login.accessToken, walletLogin.json<AuthTokens>().accessToken]) {
      expect(
        (await api().inject({ method: "GET", url: "/v1/me", headers: bearer(token) })).statusCode,
      ).toBe(401);
    }
  });

  it("serializes concurrent first-login provisioning for the same native identity", async () => {
    const first = supabase.mint("concurrent@example.com", "email");
    const second = supabase.mint("concurrent@example.com", "email");
    const results = await Promise.all(
      [first, second].map(async (session) => {
        const em = orm.em.fork();
        const authentication = new AuthenticationStore(em, new SessionService(em));
        return authentication.completeAuthentication(
          (await supabase.authenticate(session.access_token)).unwrap(),
          "email",
          "concurrent@example.com",
        );
      }),
    );
    expect(results[0]!.unwrap().id).toBe(results[1]!.unwrap().id);
    expect(await orm.em.fork().count(AppUser, {})).toBe(1);
    expect(await orm.em.fork().count(AuthIdentity, {})).toBe(1);
    expect(await orm.em.fork().count(ApplicationSession, {})).toBe(2);
  });

  it("rechecks session revocation when committing an identity link", async () => {
    const login = await emailLogin();
    const actor = await principal(login);
    const em = orm.em.fork();
    const sessions = new SessionService(em);
    const authentication = new AuthenticationStore(em, sessions);
    await sessions.revoke(actor, false);
    const walletSession = supabase.mint(wallet.address.toLowerCase(), "wallet");
    await expect(
      authentication.completeAuthentication(
        (await supabase.authenticate(walletSession.access_token)).unwrap(),
        "wallet",
        wallet.address.toLowerCase(),
        actor,
      ),
    ).resolves.toMatchObject({ status: "error", error: { code: "SESSION_NOT_ADMITTED" } });
    expect(await orm.em.fork().count(AuthIdentity, {})).toBe(1);
  });

  it("links email to a wallet-first account", async () => {
    const challenge = await walletChallenge();
    const login = await api().inject({
      method: "POST",
      url: "/v1/auth/wallet/verify",
      payload: {
        challengeId: challenge.challengeId,
        signature: await wallet.signMessage({ message: challenge.message! }),
      },
    });
    const walletUser = login.json<AuthTokens>();
    const email = await api().inject({
      method: "POST",
      url: "/v1/me/email/challenges",
      headers: bearer(walletUser.accessToken),
      payload: { email: "new@example.com" },
    });
    expect(email.statusCode).toBe(201);
    const linked = await api().inject({
      method: "POST",
      url: "/v1/me/email/verify",
      headers: bearer(walletUser.accessToken),
      payload: { challengeId: email.json<ChallengeView>().challengeId, token: "123456" },
    });
    expect(linked.statusCode, linked.body).toBe(204);
    expect(await orm.em.fork().count(AppUser, {})).toBe(1);
    expect(await orm.em.fork().count(AuthIdentity, { userId: walletUser.user.id })).toBe(2);
  });

  it("refuses account merge, cross-session linking, and reuse of link proofs for login", async () => {
    const first = await emailLogin("first@example.com");
    const second = await emailLogin("second@example.com");
    const challenge = await walletChallenge(first.accessToken);
    const signature = await wallet.signMessage({ message: challenge.message! });
    const wrongSession = await api().inject({
      method: "POST",
      url: "/v1/me/wallet/verify",
      headers: bearer(second.accessToken),
      payload: { challengeId: challenge.challengeId, signature },
    });
    expect(wrongSession.statusCode).toBe(401);
    const wrongPurpose = await api().inject({
      method: "POST",
      url: "/v1/auth/wallet/verify",
      payload: { challengeId: challenge.challengeId, signature },
    });
    expect(wrongPurpose.statusCode).toBe(401);
    const linked = await api().inject({
      method: "POST",
      url: "/v1/me/wallet/verify",
      headers: bearer(first.accessToken),
      payload: { challengeId: challenge.challengeId, signature },
    });
    expect(linked.statusCode).toBe(204);
    const conflict = await walletChallenge(second.accessToken);
    const rejected = await api().inject({
      method: "POST",
      url: "/v1/me/wallet/verify",
      headers: bearer(second.accessToken),
      payload: {
        challengeId: conflict.challengeId,
        signature: await wallet.signMessage({ message: conflict.message! }),
      },
    });
    expect(rejected.statusCode).toBe(409);
    expect(await orm.em.fork().count(AppUser, {})).toBe(2);
  });

  it("requires recent authentication for linking; expired/suspended sessions fail", async () => {
    const login = await emailLogin();
    const auth = (await supabase.authenticate(login.accessToken)).unwrap();
    await orm.em.fork().nativeUpdate(ApplicationSession, auth.sessionId, {
      createdAt: new Date(Date.now() - 11 * 60 * 1000),
    });
    const stale = await api().inject({
      method: "POST",
      url: "/v1/me/wallet/challenges",
      headers: bearer(login.accessToken),
      payload: { address: wallet.address, chainId: 43113 },
    });
    expect(stale.statusCode).toBe(401);
    expect(stale.json().code).toBe("REAUTHENTICATION_REQUIRED");
    await orm.em.fork().nativeUpdate(AppUser, login.user.id, { status: "suspended" });
    const suspended = await api().inject({
      method: "GET",
      url: "/v1/me",
      headers: bearer(login.accessToken),
    });
    expect(suspended.statusCode).toBe(403);
    await orm.em.fork().nativeUpdate(AppUser, login.user.id, { status: "active" });
    await orm.em
      .fork()
      .nativeUpdate(ApplicationSession, auth.sessionId, { expiresAt: new Date(0) });
    const expired = await api().inject({
      method: "GET",
      url: "/v1/me",
      headers: bearer(login.accessToken),
    });
    expect(expired.statusCode).toBe(401);
  });

  it("logout and logout-all invalidate access even when Supabase still accepts/refreshed the token", async () => {
    const first = await emailLogin();
    const second = await emailLogin("second@example.com");
    const logout = await api().inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: bearer(first.accessToken),
    });
    expect(logout.statusCode).toBe(204);
    const refreshed = `refreshed-${randomUUID()}`;
    supabase.tokens.set(refreshed, (await supabase.authenticate(first.accessToken)).unwrap());
    for (const token of [first.accessToken, refreshed]) {
      expect(
        (await api().inject({ method: "GET", url: "/v1/me", headers: bearer(token) })).statusCode,
      ).toBe(401);
    }
    expect(
      (await api().inject({ method: "GET", url: "/v1/me", headers: bearer(second.accessToken) }))
        .statusCode,
    ).toBe(200);
    await api().inject({
      method: "POST",
      url: "/v1/auth/logout-all",
      headers: bearer(second.accessToken),
    });
    expect(
      (await api().inject({ method: "GET", url: "/v1/me", headers: bearer(second.accessToken) }))
        .statusCode,
    ).toBe(401);
  });

  it("enforces owner/editor/viewer permissions and immediate membership revocation", async () => {
    const owner = await emailLogin("owner@example.com");
    const viewer = await emailLogin("viewer@example.com");
    const outsider = await emailLogin("outsider@example.com");
    const projectId = randomUUID();
    const em = orm.em.fork();
    const access = new ProjectAccessService(em, new SessionService(em));
    (
      await identityTransaction(orm.em.fork(), (em) =>
        access.provisionOwner(em, projectId, owner.user.id),
      )
    ).unwrap();
    // Internal/MCP callers must fail closed too, even if they bypass HTTP DTO validation.
    const ownerPrincipal = await principal(owner);
    await expect(
      Reflect.apply(access.authorizeProject, access, [ownerPrincipal, projectId, "spend"]),
    ).resolves.toMatchObject({ status: "error", error: { code: "FORBIDDEN" } });
    await expect(
      Reflect.apply(access.changeMember, access, [
        ownerPrincipal,
        projectId,
        viewer.user.id,
        "owner",
        true,
      ]),
    ).resolves.toMatchObject({ status: "error", error: { code: "INVALID_ROLE" } });
    const path = `/v1/projects/${projectId}/members`;
    expect(
      (await api().inject({ method: "GET", url: path, headers: bearer(outsider.accessToken) }))
        .statusCode,
    ).toBe(404);
    const add = await api().inject({
      method: "POST",
      url: path,
      headers: bearer(owner.accessToken),
      payload: { accountId: viewer.user.id, role: "viewer" },
    });
    expect(add.statusCode, add.body).toBe(204);
    expect(
      (await api().inject({ method: "GET", url: path, headers: bearer(viewer.accessToken) }))
        .statusCode,
    ).toBe(200);
    await expect(
      access.authorizeProject(await principal(viewer), projectId, "draft"),
    ).resolves.toMatchObject({ status: "error", error: { code: "FORBIDDEN" } });
    const denied = await api().inject({
      method: "PATCH",
      url: `${path}/${owner.user.id}`,
      headers: bearer(viewer.accessToken),
      payload: { role: "editor" },
    });
    expect(denied.statusCode).toBe(403);
    const elevated = await api().inject({
      method: "PATCH",
      url: `${path}/${viewer.user.id}`,
      headers: bearer(owner.accessToken),
      payload: { role: "owner" },
    });
    expect(elevated.statusCode).toBe(400);
    const update = await api().inject({
      method: "PATCH",
      url: `${path}/${viewer.user.id}`,
      headers: bearer(owner.accessToken),
      payload: { role: "editor" },
    });
    expect(update.statusCode).toBe(204);
    await expect(
      access.authorizeProject(await principal(viewer), projectId, "draft"),
    ).resolves.toMatchObject({ status: "ok", value: undefined });
    const removeOwner = await api().inject({
      method: "DELETE",
      url: `${path}/${owner.user.id}`,
      headers: bearer(owner.accessToken),
    });
    expect(removeOwner.statusCode).toBe(409);
    const remove = await api().inject({
      method: "DELETE",
      url: `${path}/${viewer.user.id}`,
      headers: bearer(owner.accessToken),
    });
    expect(remove.statusCode).toBe(204);
    expect(
      (await api().inject({ method: "GET", url: path, headers: bearer(viewer.accessToken) }))
        .statusCode,
    ).toBe(404);
  });

  it("RLS denies non-backend roles even if table privileges are accidentally granted", async () => {
    await emailLogin();
    const em = orm.em.fork();
    await em.execute(
      "do $$ begin if not exists (select from pg_roles where rolname = 'm01_untrusted') then create role m01_untrusted; end if; end $$",
    );
    await em.execute("grant usage on schema identity to m01_untrusted");
    await em.execute("grant select on all tables in schema identity to m01_untrusted");
    await em.transactional(async (transaction) => {
      await transaction.execute("set local role m01_untrusted");
      const rows = await transaction.execute<unknown[]>("select * from identity.app_users");
      expect(rows).toEqual([]);
      const sessions = await transaction.execute<unknown[]>(
        "select * from identity.application_sessions",
      );
      expect(sessions).toEqual([]);
    });
  });

  it("rolls back flushed writes on an expected Err, and commits only Ok", async () => {
    const rejected = await identityTransaction(orm.em.fork(), async (em) => {
      em.persist(new AppUser());
      await em.flush();
      return failure("IDENTITY_CONFLICT", "Rejected after a write.");
    });
    expect(rejected).toMatchObject({ status: "error", error: { code: "IDENTITY_CONFLICT" } });
    expect(await orm.em.fork().count(AppUser, {})).toBe(0);
    const accepted = await identityTransaction(orm.em.fork(), async (em) => {
      const user = new AppUser();
      em.persist(user);
      return Result.ok(user.id);
    });
    expect(accepted.isOk()).toBe(true);
    expect(await orm.em.fork().count(AppUser, {})).toBe(1);
  });

  it("does not launder database or programmer failures into typed business errors", async () => {
    const defect = new Error("Unexpected transaction failure");
    await expect(
      identityTransaction(orm.em.fork(), async (em) => {
        em.persist(new AppUser());
        await em.flush();
        throw defect;
      }),
    ).rejects.toBe(defect);
    expect(await orm.em.fork().count(AppUser, {})).toBe(0);
    supabase.sendDefect = new Error("Sensitive upstream implementation detail");
    const response = await api().inject({
      method: "POST",
      url: "/v1/auth/email/otp",
      payload: { email: "defect@example.com" },
    });
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain("Sensitive upstream");
    expect(response.body).not.toContain("IdentityError");
  });

  it("does not leak rejected transaction mutations into the caller's managed entities", async () => {
    const em = orm.em.fork();
    const user = new AppUser();
    user.displayName = "Original";
    await em.persist(user).flush();
    const rejected = await identityTransaction(em, async (transaction) => {
      const managed = await transaction.findOneOrFail(AppUser, user.id);
      managed.displayName = "Rejected";
      await transaction.flush();
      return failure("IDENTITY_CONFLICT", "Reject the mutation.");
    });
    expect(rejected.isErr()).toBe(true);
    expect(user.displayName).toBe("Original");
    await em.flush();
    expect((await orm.em.fork().findOneOrFail(AppUser, user.id)).displayName).toBe("Original");
  });

  it("keeps a consumed challenge invalid when the provider returns Err; no automatic retry", async () => {
    const challenge = await walletChallenge();
    const signature = await wallet.signMessage({ message: challenge.message! });
    supabase.walletFailure = true;
    const request = {
      method: "POST" as const,
      url: "/v1/auth/wallet/verify",
      payload: { challengeId: challenge.challengeId, signature },
    };
    const failed = await api().inject(request);
    expect(failed.statusCode).toBe(401);
    expect(failed.json()).toEqual({
      code: "INVALID_WALLET_PROOF",
      message: "Wallet authentication failed.",
    });
    const replay = await api().inject(request);
    expect(replay.statusCode).toBe(401);
    expect(replay.json().code).toBe("INVALID_CHALLENGE");
    expect(supabase.walletVerifications).toBe(1);
    expect(await orm.em.fork().count(ApplicationSession, {})).toBe(0);
  });

  it("returns a typed uniqueness conflict after rolling back all provisioning writes", async () => {
    const login = await emailLogin();
    const auth = (await supabase.authenticate(login.accessToken)).unwrap();
    const em = orm.em.fork();
    const authentication = new AuthenticationStore(em, new SessionService(em));
    const conflict = await authentication.completeAuthentication(
      { subjectId: randomUUID(), sessionId: auth.sessionId },
      "email",
      "collision@example.com",
    );
    expect(conflict).toMatchObject({ status: "error", error: { code: "IDENTITY_CONFLICT" } });
    expect(await orm.em.fork().count(AppUser, {})).toBe(1);
    expect(await orm.em.fork().count(AuthIdentity, {})).toBe(1);
    expect(await orm.em.fork().count(ApplicationSession, {})).toBe(1);
  });
});
