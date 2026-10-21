/// <reference types="emscripten" />
/// <reference types="bun" />
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { PrismaClient } from "../src/generated/prisma/client";

describe("Better Auth SIWE / Prisma + Fastify", () => {
  const wallet = privateKeyToAccount(generatePrivateKey());
  const stranger = privateKeyToAccount(generatePrivateKey());
  const origin = "https://app.payvoke.test";
  const secret = randomBytes(48).toString("base64");
  const schema = `auth_test_${randomUUID().replaceAll("-", "")}`;
  let embedded: PGlite | undefined;
  let server: PGLiteSocketServer | undefined;
  let connectionString: string;
  let pool: Pool;
  let db: PrismaClient;
  let app: ReturnType<typeof createApp>;

  const configFor = (web = origin, api = "https://api.payvoke.test") =>
    loadConfig({
      DATABASE_URL: connectionString,
      WEB_ORIGIN: web,
      API_ORIGIN: api,
      BETTER_AUTH_SECRET: secret,
      LOG_LEVEL: "silent",
    });
  const cookiePair = (cookie: { name: string; value: string }) =>
    `${cookie.name}=${encodeURIComponent(cookie.value)}`;

  before(async () => {
    if (process.env.TEST_DATABASE_URL) connectionString = process.env.TEST_DATABASE_URL;
    else {
      embedded = await PGlite.create();
      server = new PGLiteSocketServer({ db: embedded, port: 0, host: "127.0.0.1" });
      await server.start();
      connectionString = `postgresql://postgres:postgres@${server.getServerConn()}/postgres`;
    }
    pool = new Pool({
      connectionString,
      max: embedded ? 1 : 5,
      options: `-c search_path=${schema}`,
    });
    pool.setMaxListeners(40);
    await pool.query(`CREATE SCHEMA "${schema}"`);
    const client = await pool.connect();
    try {
      await client.query(`SET search_path TO "${schema}"`);
      const directory = new URL("../prisma/migrations/", import.meta.url);
      const migrations = (await readdir(directory, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
      assert.equal(migrations[0], "20261020000000_init_better_auth");
      for (const migration of migrations) {
        const sql = await readFile(new URL(`${migration}/migration.sql`, directory), "utf8");
        await client.query(sql.replace('CREATE SCHEMA IF NOT EXISTS "public";', ""));
      }
    } finally {
      client.release();
    }
  });

  beforeEach(async () => {
    db = new PrismaClient({ adapter: new PrismaPg(pool, { schema }) });
    await db.session.deleteMany();
    await db.user.deleteMany();
    await db.verification.deleteMany();
    app = createApp(configFor(), db);
    await app.ready();
  });
  afterEach(async () => {
    await app?.close();
  });
  after(async () => {
    try {
      if (pool) {
        try {
          await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
        } finally {
          await pool.end();
        }
      }
    } finally {
      await server?.stop();
      await embedded?.close();
    }
  });

  async function nonce(web = origin) {
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/siwe/nonce",
      headers: { origin: web },
      payload: {},
    });
    assert.equal(response.statusCode, 200, response.body);
    const binding = response.cookies.find((cookie) => cookie.name.endsWith("payvoke_siwe"))!;
    assert.ok(binding, "SIWE browser-binding cookie is forwarded");
    return { nonce: response.json<{ nonce: string }>().nonce, cookie: cookiePair(binding) };
  }
  async function signedAttempt(
    overrides: Partial<Parameters<typeof createSiweMessage>[0]> = {},
    web = origin,
  ) {
    const issued = await nonce(web);
    const issuedAt = new Date();
    const message = createSiweMessage({
      address: wallet.address,
      chainId: 43113,
      domain: new URL(web).host,
      uri: web,
      version: "1",
      nonce: issued.nonce,
      issuedAt,
      expirationTime: new Date(issuedAt.getTime() + 300000),
      ...overrides,
    });
    return { ...issued, message, signature: await wallet.signMessage({ message }) };
  }
  function verify(
    attempt: Awaited<ReturnType<typeof signedAttempt>>,
    cookie = attempt.cookie,
    web = origin,
  ) {
    return app.inject({
      method: "POST",
      url: "/v1/auth/siwe/verify",
      headers: { origin: web, cookie },
      payload: { message: attempt.message, signature: attempt.signature },
    });
  }
  async function login(web = origin) {
    const attempt = await signedAttempt({}, web);
    const response = await verify(attempt, attempt.cookie, web);
    assert.equal(response.statusCode, 200, response.body);
    const session = response.cookies.find((cookie) => cookie.name.endsWith("session_token"))!;
    assert.ok(session, "Better Auth session cookie is forwarded separately");
    return { response, cookie: cookiePair(session), session, attempt };
  }

  it("uses Better Auth's native session storage and signed HttpOnly cookies", async () => {
    const { response, cookie, session } = await login();
    assert.equal(response.json().success, true);
    assert.equal(response.json().user.walletAddress.toLowerCase(), wallet.address.toLowerCase());
    const stored = await db.session.findFirstOrThrow();
    assert.equal(stored.token, response.json().token);
    assert.notEqual(session.value, stored.token);
    assert.equal(session.httpOnly, true);
    assert.equal(session.secure, true);
    assert.equal(session.sameSite, "Lax");
    assert.equal(
      Math.round((stored.expiresAt.getTime() - stored.createdAt.getTime()) / 1000),
      604800,
    );
    const me = await app.inject({ url: "/v1/me", headers: { cookie } });
    const user = await db.user.findFirstOrThrow();
    assert.equal(me.statusCode, 200);
    assert.deepEqual(me.json(), {
      buyer: { id: user.id, address: wallet.address.toLowerCase() },
      roles: [],
      scopes: [],
    });
    assert.ok(!me.body.includes(stored.token));
    assert.equal(me.headers["cache-control"], "no-store");
    assert.equal(me.headers["x-content-type-options"], "nosniff");
    const native = await app.inject({ url: "/v1/auth/get-session", headers: { cookie } });
    assert.equal(native.json().user.id, user.id);
  });

  it("issues independent nonces with a five-minute database expiry", async () => {
    const first = await nonce();
    const second = await nonce();
    assert.notEqual(first.nonce, second.nonce);
    const stored = await db.verification.findFirstOrThrow({
      where: { identifier: `siwe:${first.nonce}` },
    });
    assert.ok(stored.expiresAt.getTime() - Date.now() <= 300000);
    assert.ok(stored.expiresAt.getTime() - Date.now() > 290000);
  });

  it("consumes a nonce exactly once under concurrent verification", async () => {
    const attempt = await signedAttempt();
    const responses = await Promise.all([verify(attempt), verify(attempt)]);
    assert.deepEqual(responses.map((response) => response.statusCode).sort(), [200, 401]);
    assert.equal(await db.session.count(), 1);
    assert.equal(await db.user.count(), 1);
    assert.equal((await verify(attempt)).statusCode, 401);
  });

  it("rejects missing, forged and cross-browser nonce cookies before consumption", async () => {
    const attempt = await signedAttempt();
    const other = await nonce();
    for (const cookie of ["", "__Host-payvoke_siwe=forged", other.cookie])
      assert.equal((await verify(attempt, cookie)).statusCode, 401);
    assert.equal((await verify(attempt)).statusCode, 200);
  });

  it("rejects wrong signers and burns the failed nonce rather than implementing another retry counter", async () => {
    const attempt = await signedAttempt();
    const signature = await stranger.signMessage({ message: attempt.message });
    assert.equal((await verify({ ...attempt, signature })).statusCode, 401);
    assert.equal((await verify(attempt)).statusCode, 401);
    assert.equal(await db.session.count(), 0);
  });

  it("rejects expired nonces even if the browser sends an old cookie manually", async () => {
    const attempt = await signedAttempt();
    await db.verification.updateMany({
      where: { identifier: `siwe:${attempt.nonce}` },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    assert.equal((await verify(attempt)).statusCode, 401);
  });

  it("rejects signed messages for another domain, URI or chain, expired/future messages and long validity windows", async () => {
    for (const mutation of [
      { domain: "evil.test" },
      { uri: "https://evil.test" },
      { chainId: 1 },
      { expirationTime: new Date(Date.now() - 1) },
      { issuedAt: new Date(Date.now() + 60000) },
      { expirationTime: new Date(Date.now() + 3600000) },
      { notBefore: new Date(Date.now() + 60000) },
    ])
      assert.equal((await verify(await signedAttempt(mutation))).statusCode, 401);
    assert.equal(await db.session.count(), 0);
  });

  it("requires signed expiry and rejects malformed signatures/messages", async () => {
    const noExpiry = await signedAttempt({ expirationTime: undefined });
    assert.equal((await verify(noExpiry)).statusCode, 401);
    const badSignature = await signedAttempt();
    assert.equal((await verify({ ...badSignature, signature: "0xab" })).statusCode, 401);
    const malformed = await signedAttempt();
    const response = await verify({ ...malformed, message: "not a SIWE message" });
    assert.ok(response.statusCode >= 400 && response.statusCode < 500, response.body);
  });

  it("uses Better Auth User as buyer and Account only as the SIWE provider account", async () => {
    await login();
    const user = await db.user.findFirstOrThrow();
    await login();
    assert.equal(await db.account.count(), 1);
    assert.equal(await db.user.count(), 1);
    assert.equal(await db.walletAddress.count(), 1);
    const account = await db.account.findFirstOrThrow();
    assert.equal(account.userId, user.id);
    assert.equal(account.providerId, "siwe");
    assert.equal(account.accountId, `${wallet.address}:43113`);
    assert.equal((await db.user.findFirstOrThrow()).id, user.id);
  });

  it("keeps two wallets separate and ignores client-controlled Host headers", async () => {
    await login();
    const attempt = await signedAttempt({ address: stranger.address });
    const signature = await stranger.signMessage({ message: attempt.message });
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/siwe/verify",
      headers: {
        origin,
        host: "evil.test",
        "x-forwarded-host": "evil.test",
        cookie: attempt.cookie,
      },
      payload: { message: attempt.message, signature },
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(await db.account.count(), 2);
    assert.equal(await db.user.count(), 2);
  });

  it("blocks absent, null and foreign Origins for nonce, verify and sign-out", async () => {
    for (const badOrigin of [undefined, "null", "https://evil.test", `${origin}.evil.test`]) {
      for (const path of ["siwe/nonce", "siwe/verify", "sign-out"]) {
        const response = await app.inject({
          method: "POST",
          url: `/v1/auth/${path}`,
          headers: badOrigin ? { origin: badOrigin } : {},
          payload: {},
        });
        assert.equal(response.statusCode, 403);
      }
    }
    assert.equal(await db.verification.count(), 0);
  });

  it("supports credentialed CORS preflight", async () => {
    const response = await app.inject({
      method: "OPTIONS",
      url: "/v1/auth/siwe/verify",
      headers: {
        origin,
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    });
    assert.equal(response.statusCode, 204);
    assert.equal(response.headers["access-control-allow-origin"], origin);
    assert.equal(response.headers["access-control-allow-credentials"], "true");
  });

  it("rejects absent, unsigned, expired and revoked sessions without cookie caching", async () => {
    assert.equal((await app.inject({ url: "/v1/me" })).statusCode, 401);
    const { cookie, session } = await login();
    const stored = await db.session.findFirstOrThrow();
    assert.equal(
      (await app.inject({ url: "/v1/me", headers: { authorization: `Bearer ${stored.token}` } }))
        .statusCode,
      401,
    );
    assert.equal(
      (await app.inject({ url: "/v1/me", headers: { cookie: `${session.name}=${stored.token}` } }))
        .statusCode,
      401,
    );
    await db.session.update({
      where: { id: stored.id },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    assert.equal((await app.inject({ url: "/v1/me", headers: { cookie } })).statusCode, 401);
    const next = await login();
    await db.session.deleteMany();
    assert.equal(
      (await app.inject({ url: "/v1/me", headers: { cookie: next.cookie } })).statusCode,
      401,
    );
  });

  it("blocks suspended buyers on existing requests and new session creation", async () => {
    const { cookie } = await login();
    await db.user.updateMany({ data: { status: "SUSPENDED", suspendedAt: new Date() } });
    assert.equal((await app.inject({ url: "/v1/me", headers: { cookie } })).statusCode, 403);
    const sessions = await db.session.count();
    assert.equal((await verify(await signedAttempt())).statusCode, 403);
    assert.equal(await db.session.count(), sessions);
  });

  it("signs out with Better Auth and clears/revokes its cookie", async () => {
    const { cookie } = await login();
    for (let i = 0; i < 2; i++) {
      const response = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-out",
        headers: { origin, cookie },
        payload: {},
      });
      assert.equal(response.statusCode, 200, response.body);
      assert.ok(
        response.cookies.some(
          (cookie) => cookie.name.endsWith("session_token") && cookie.value === "",
        ),
      );
    }
    assert.equal(await db.session.count(), 0);
    assert.equal((await app.inject({ url: "/v1/me", headers: { cookie } })).statusCode, 401);
  });

  it("initializes native auth tables without legacy tables/cookies/endpoints", async () => {
    const tables = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1`,
      [schema],
    );
    const names = tables.rows.map((row) => row.table_name);
    for (const name of ["account", "session", "user", "verification", "walletAddress"]) {
      assert.ok(names.includes(name));
    }
    for (const name of ["accounts", "web_sessions", "login_challenges"]) {
      assert.ok(!names.includes(name));
    }
    assert.equal(
      (await app.inject({ url: "/v1/me", headers: { cookie: "__Host-payvoke_session=old-token" } }))
        .statusCode,
      401,
    );
    const old = await app.inject({
      method: "POST",
      url: "/v1/auth/challenges",
      headers: { origin },
      payload: {},
    });
    assert.equal(old.statusCode, 404);
  });

  it("enforces body size and Fastify rate limits", async () => {
    const oversized = await app.inject({
      method: "POST",
      url: "/v1/auth/siwe/verify",
      headers: { origin },
      payload: { message: "x".repeat(9000), signature: "0x" },
    });
    assert.equal(oversized.statusCode, 413);
    let limited = false;
    for (let i = 0; i < 21; i++) {
      const response = await app.inject({
        method: "POST",
        url: "/v1/auth/siwe/nonce",
        headers: { origin },
        payload: {},
      });
      if (response.statusCode === 429) limited = true;
    }
    assert.ok(limited);
  });

  it("supports HTTP-only loopback development and an auth guard in later modules", async () => {
    await app.close();
    const web = "http://localhost:3000";
    app = createApp(configFor(web, "http://localhost:3001"), db);
    app.register(async (feature) => {
      feature.get(
        "/protected",
        { preHandler: feature.requireAccount },
        async (request) => request.account,
      );
    });
    assert.equal((await app.inject({ url: "/protected" })).statusCode, 401);
    const { cookie, session } = await login(web);
    assert.ok(!session.secure);
    assert.equal((await app.inject({ url: "/protected", headers: { cookie } })).statusCode, 200);
  });

  it("does not expose adapter exception details on a failed authentication", async (t) => {
    const attempt = await signedAttempt();
    const transaction = db.$transaction;
    const secretUrl = "postgresql://private:password@secret-db/payvoke";
    t.after(() => {
      db.$transaction = transaction;
    });
    db.$transaction = async () => {
      throw new Error(secretUrl);
    };
    const response = await verify(attempt);
    assert.ok(response.statusCode >= 400);
    assert.ok(!response.body.includes(secretUrl), response.body);
    assert.ok(!response.cookies.some((cookie) => cookie.name.endsWith("session_token")));
    assert.equal(await db.session.count(), 0);
  });

  it("does not allow client input to change User suspension fields", async () => {
    const { cookie } = await login();
    await db.user.updateMany({ data: { status: "SUSPENDED", suspendedAt: new Date() } });
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/update-user",
      headers: { origin, cookie },
      payload: { status: "ACTIVE", suspendedAt: null },
    });
    assert.equal(response.statusCode, 400);
    const user = await db.user.findFirstOrThrow();
    assert.equal(user.status, "SUSPENDED");
    assert.ok(user.suspendedAt);
    assert.equal((await app.inject({ url: "/v1/me", headers: { cookie } })).statusCode, 403);
  });
});
