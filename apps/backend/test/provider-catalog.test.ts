/// <reference types="emscripten" />
/// <reference types="bun" />
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { after, before, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { PrismaClient } from "../src/generated/prisma/client";

const origin = "https://app.payvoke.test";
const schema = `catalog_test_${randomUUID().replaceAll("-", "")}`;
const wallet = privateKeyToAccount(generatePrivateKey());
const other = privateKeyToAccount(generatePrivateKey());
let embedded: PGlite;
let socket: PGLiteSocketServer;
let pool: Pool;
let db: PrismaClient;
let app: ReturnType<typeof createApp>;

before(async () => {
  embedded = await PGlite.create();
  socket = new PGLiteSocketServer({ db: embedded, port: 0, host: "127.0.0.1" });
  await socket.start();
  const connectionString = `postgresql://postgres:postgres@${socket.getServerConn()}/postgres`;
  pool = new Pool({ connectionString, max: 1, options: `-c search_path=${schema}` });
  await pool.query(`CREATE SCHEMA "${schema}"`);
  const client = await pool.connect();
  try {
    await client.query(`SET search_path TO "${schema}"`);
    const dir = new URL("../prisma/migrations/", import.meta.url);
    for (const migration of (await readdir(dir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()) {
      const sql = await readFile(new URL(`${migration}/migration.sql`, dir), "utf8");
      await client.query(sql.replace('CREATE SCHEMA IF NOT EXISTS "public";', ""));
    }
  } finally {
    client.release();
  }
  db = new PrismaClient({ adapter: new PrismaPg(pool, { schema }) });
  app = createApp(
    loadConfig({
      DATABASE_URL: connectionString,
      WEB_ORIGIN: origin,
      API_ORIGIN: "https://api.payvoke.test",
      BETTER_AUTH_SECRET: randomBytes(48).toString("base64"),
      LOG_LEVEL: "silent",
      VAULT_ADDRESS: wallet.address,
    }),
    db,
  );
  await app.ready();
});
after(async () => {
  await app?.close();
  await pool?.query(`DROP SCHEMA "${schema}" CASCADE`);
  await pool?.end();
  await socket?.stop();
  await embedded?.close();
});

async function login(account: typeof wallet) {
  const nonce = await app.inject({
    method: "POST",
    url: "/v1/auth/siwe/nonce",
    headers: { origin },
    payload: {},
  });
  assert.equal(nonce.statusCode, 200, nonce.body);
  const binding = nonce.cookies.find((cookie) => cookie.name.endsWith("payvoke_siwe"))!;
  const issuedAt = new Date();
  const message = createSiweMessage({
    address: account.address,
    chainId: 43113,
    domain: new URL(origin).host,
    uri: origin,
    version: "1",
    nonce: nonce.json().nonce,
    issuedAt,
    expirationTime: new Date(issuedAt.getTime() + 300000),
  });
  const verified = await app.inject({
    method: "POST",
    url: "/v1/auth/siwe/verify",
    headers: { origin, cookie: `${binding.name}=${encodeURIComponent(binding.value)}` },
    payload: { message, signature: await account.signMessage({ message }) },
  });
  assert.equal(verified.statusCode, 200, verified.body);
  const session = verified.cookies.find((cookie) => cookie.name.endsWith("session_token"))!;
  return `${session.name}=${encodeURIComponent(session.value)}`;
}

it("isolates provider keys, publishes catalog, and keeps starred collections private", async () => {
  const cookie = await login(wallet);
  const otherCookie = await login(other);
  const web = (
    method: string,
    url: string,
    payload?: Record<string, unknown>,
    userCookie = cookie,
  ) =>
    app.inject({
      method: method as "GET",
      url,
      headers: { origin, cookie: userCookie },
      ...(payload === undefined ? {} : { payload }),
    });
  const appOne = await web("POST", "/v1/provider/apps", {
    name: "First",
    payoutAddress: wallet.address,
    clientRequestId: randomUUID(),
  });
  assert.equal(appOne.statusCode, 201, appOne.body);
  const appTwo = await web("POST", "/v1/provider/apps", {
    name: "Second",
    payoutAddress: wallet.address,
    clientRequestId: randomUUID(),
  });
  const id = appOne.json().id;
  const otherAppId = appTwo.json().id;
  assert.equal(
    (
      await web("POST", `/v1/provider/apps/${id}/products`, {
        kind: "TOOL",
        name: "Too early",
        description: "No key",
      })
    ).statusCode,
    403,
  );
  const keys = `/v1/provider/apps/${id}/keys`;
  const key = await web("POST", keys, {
    scopes: ["products:write"],
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });
  assert.equal(key.statusCode, 201, key.body);
  assert.equal((await web("GET", keys, undefined, otherCookie)).statusCode, 404);
  const secret = key.json().secret;
  assert.equal((await db.providerApiKey.findFirstOrThrow()).secretHash.includes(secret), false);
  const bearer = (url: string, payload: Record<string, unknown>, token = secret) =>
    app.inject({ method: "POST", url, headers: { authorization: `Bearer ${token}` }, payload });
  const first = await bearer(`/v1/provider/apps/${id}/products`, {
    kind: "TOOL",
    name: "Summarizer",
    description: "Summarizes text",
  });
  assert.equal(first.statusCode, 201, first.body);
  assert.equal(
    (
      await bearer(`/v1/provider/apps/${otherAppId}/products`, {
        kind: "TOOL",
        name: "Escape",
        description: "No",
      })
    ).statusCode,
    401,
  );
  const productId = first.json().productId;
  await db.deploymentPolicy.create({
    data: {
      version: "test",
      activeSlot: "active",
      vault: wallet.address,
      feeBps: 0,
      feeRecipient: wallet.address,
      quoteLifetimeSeconds: 60,
      maxHoldSeconds: 10000,
      resolutionGraceSeconds: 60,
    },
  });
  const command = await bearer(`/v1/provider/apps/${id}/products/${productId}/commands`, {
    draftVersion: 1,
    name: "summarize",
    title: "Summarize",
    description: "Summarizes text",
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      additionalProperties: false,
      required: ["text"],
      properties: { text: { type: "string", minLength: 1 } },
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["summary"],
      properties: { summary: { type: "string" } },
    },
    grossAmount: "10000",
    terms: {
      deliverySeconds: 600,
      reviewSeconds: 3600,
      revisionPolicy: { maxIncluded: 0, description: "None" },
      refundPolicy: "Refund undelivered",
      sideEffects: "none",
      dataUse: "This request",
    },
  });
  assert.equal(command.statusCode, 201, command.body);
  const published = await bearer(
    `/v1/provider/apps/${id}/products/${productId}/versions/1/submissions`,
    { expectedRevision: command.json().revision },
  );
  assert.equal(published.statusCode, 200, published.body);
  const catalog = await web("GET", "/v1/products");
  assert.equal(catalog.json().items[0].id, productId);
  assert.equal(catalog.json().items[0].availability, "NOT_READY");
  const buyer = await db.walletAddress.findFirstOrThrow({
    where: { address: { equals: wallet.address, mode: "insensitive" } },
  });
  const session = await db.usageSession.create({ data: { buyerId: buyer.userId, productId } });
  const quote = await app.inject({
    method: "POST",
    url: "/v1/quotes",
    headers: { origin, cookie, "idempotency-key": "not-ready" },
    payload: {
      sessionId: session.id,
      commandId: command.json().commandId,
      arguments: { text: "hello" },
      contextSelection: { messageIds: [], briefVersionId: null, fileIds: [] },
      clientRequestId: "not-ready",
    },
  });
  assert.equal(quote.statusCode, 409, quote.body);
  assert.equal(quote.json().error, "PROVIDER_DELIVERY_NOT_READY");
  const cloned = await bearer(`/v1/provider/apps/${id}/products/${productId}/versions`, {
    baseVersion: 1,
  });
  assert.equal(cloned.statusCode, 201, cloned.body);
  const original = await db.commandVersion.findFirstOrThrow({
    where: { productId, productVersion: 1 },
  });
  const changed = await app.inject({
    method: "PUT",
    url: `/v1/provider/apps/${id}/products/${productId}/commands/${command.json().commandId}`,
    headers: { authorization: `Bearer ${secret}` },
    payload: {
      draftVersion: 2,
      expectedRevision: 1,
      name: original.name,
      title: original.title,
      description: original.description,
      inputSchema: original.inputSchema,
      outputSchema: original.outputSchema,
      grossAmount: "20000",
      terms: original.terms,
    },
  });
  assert.equal(changed.statusCode, 200, changed.body);
  assert.equal(
    (
      await bearer(`/v1/provider/apps/${id}/products/${productId}/versions/2/submissions`, {
        expectedRevision: changed.json().revision,
      })
    ).statusCode,
    200,
  );
  assert.equal(original.grossAmount.toString(), "10000");
  assert.equal(
    (
      await db.commandVersion.findFirstOrThrow({ where: { productId, productVersion: 2 } })
    ).grossAmount.toString(),
    "20000",
  );
  assert.equal((await web("PUT", `/v1/stars/${productId}`)).statusCode, 200);
  const collection = await web("POST", "/v1/collections", { name: "Useful" });
  assert.equal(collection.statusCode, 201, collection.body);
  const collectionId = collection.json().id;
  assert.equal(
    (await web("PUT", `/v1/collections/${collectionId}/products/${productId}`)).statusCode,
    200,
  );
  assert.equal((await web("GET", "/v1/collections", undefined, otherCookie)).json().length, 0);
  assert.equal(
    (await bearer(`/v1/provider/apps/${id}/products/${productId}/suspensions`, {})).statusCode,
    200,
  );
  assert.equal((await web("GET", "/v1/products")).json().items.length, 0);
  assert.equal((await web("GET", "/v1/stars")).json()[0].availability, "UNAVAILABLE");
  await web("DELETE", `/v1/stars/${productId}`);
  assert.equal((await web("GET", "/v1/collections")).json()[0].items.length, 0);
  const rotated = await web("POST", keys, {
    scopes: ["products:write"],
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });
  assert.equal(rotated.statusCode, 201, rotated.body);
  assert.equal(
    (
      await bearer(`/v1/provider/apps/${id}/products`, {
        kind: "TOOL",
        name: "Old",
        description: "No",
      })
    ).statusCode,
    401,
  );
  const restricted = await web("POST", keys, {
    scopes: ["events:read"],
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });
  assert.equal(restricted.statusCode, 201, restricted.body);
  assert.equal(
    (
      await bearer(
        `/v1/provider/apps/${id}/products`,
        { kind: "TOOL", name: "Denied", description: "No" },
        restricted.json().secret,
      )
    ).statusCode,
    403,
  );
  assert.equal(
    (await web("POST", `/v1/provider/apps/${id}/keys/${restricted.json().id}/revocations`))
      .statusCode,
    200,
  );
  assert.equal(
    (
      await bearer(
        `/v1/provider/apps/${id}/products`,
        { kind: "TOOL", name: "Revoked", description: "No" },
        restricted.json().secret,
      )
    ).statusCode,
    401,
  );
});
