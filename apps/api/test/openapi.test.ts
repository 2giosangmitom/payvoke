/// <reference types="emscripten" />
/// <reference types="bun" />
import { inject } from "#test/kit/http";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, it } from "bun:test";
import { PrismaPg } from "@prisma/adapter-pg";
import Ajv2020 from "ajv/dist/2020.js";
import { Pool } from "pg";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { createApp } from "../src/app";
import { builderSpec, type Json, type Operation } from "../src/builder-spec";
import { loadConfig } from "../src/config";
import { PrismaClient } from "#core/db";
import { readMigrations, startTestPostgres, type TestPostgres } from "#test/kit/database";

const origin = "https://app.payvoke.test";
const schema = `openapi_test_${randomUUID().replaceAll("-", "")}`;
const wallet = privateKeyToAccount(generatePrivateKey());
let postgres: TestPostgres;
let pool: Pool;
let db: PrismaClient;
let app: ReturnType<typeof createApp>;
let spec: Awaited<ReturnType<typeof builderSpec>>;

beforeAll(async () => {
  spec = await builderSpec();
  postgres = await startTestPostgres();
  const { connectionString } = postgres;
  pool = new Pool({ connectionString, max: 1, options: `-c search_path=${schema}` });
  await pool.query(`CREATE SCHEMA "${schema}"`);
  const client = await pool.connect();
  try {
    await client.query(`SET search_path TO "${schema}"`);
    for (const migration of await readMigrations()) await client.query(migration.sql);
  } finally {
    client.release();
  }
  db = new PrismaClient({ adapter: new PrismaPg(pool, { schema }) });
  const config = loadConfig({
    DATABASE_URL: connectionString,
    // Unused: the test passes in-process signals.
    REDIS_URL: "redis://127.0.0.1:1",
    WEB_ORIGIN: origin,
    API_ORIGIN: "https://api.payvoke.test",
    BETTER_AUTH_SECRET: randomBytes(48).toString("base64"),
    LOG_LEVEL: "silent",
    VAULT_ADDRESS: wallet.address,
  });
  app = createApp(config, db);
  await app.ready();
});
afterAll(async () => {
  await app?.close();
  await pool?.query(`DROP SCHEMA "${schema}" CASCADE`);
  await pool?.end();
  await postgres?.stop();
});

const BUILDER_OPERATIONS = [
  "appendMessageDelta",
  "listCommands",
  "overwriteCommands",
  "createCommand",
  "updateCommand",
  "archiveCommand",
  "setDefaultCommand",
  "sendMessage",
  "acknowledgeMessage",
  "createOffer",
  "withdrawOffer",
  "readEvents",
  "acknowledgeRun",
  "sendReport",
  "readStreamCursor",
  "streamRun",
  "requestUpload",
  "completeUpload",
  "downloadInput",
];

const operations = () =>
  Object.entries(spec.paths).flatMap(([path, item]) =>
    Object.entries(item).map(([method, operation]) => ({ path, method, operation })),
  );

it("documents every builder route, and only those", async () => {
  const listed = operations();
  assert.deepEqual(
    listed.map(({ operation }) => operation.operationId).sort(),
    [...BUILDER_OPERATIONS].sort(),
  );
  for (const { path, operation } of listed) {
    assert.ok(path.startsWith("/v1/provider/apps/{appId}/"), path);
    assert.ok(operation.summary, `${operation.operationId} has a summary`);
    assert.deepEqual(operation.security, [{ appKey: [] }]);
    assert.match(String(operation["x-payvoke-scope"]), /^[a-z]+:[a-z]+$/);
    const responses = operation.responses as Record<string, { content?: Json }>;
    const success = Object.keys(responses).find((status) => status.startsWith("2"))!;
    assert.ok(responses[success].content, `${operation.operationId} documents its response`);
    assert.ok(responses["401"] && responses["403"]);
    for (const name of path.matchAll(/\{(\w+)\}/g))
      assert.ok(
        operation.parameters?.some((p) => p.in === "path" && p.name === name[1]),
        `${operation.operationId} declares ${name[1]}`,
      );
  }
});

it("is regenerated: the web app's copy matches the routes", async () => {
  const committed = await readFile(
    join(import.meta.dir, "../../frontend/src/features/docs/openapi.json"),
    "utf8",
  );
  assert.equal(committed, `${JSON.stringify(spec, null, 2)}\n`, "run `bun --filter api docs`");
});

// Checks a real response against the schema the spec documents for it.
function conform(operationId: string, response: { statusCode: number; body: string }) {
  const found = operations().find(({ operation }) => operation.operationId === operationId)!;
  const documented = (found.operation as Operation & { responses: Record<string, Json> }).responses[
    String(response.statusCode)
  ];
  assert.ok(documented, `${operationId} documents status ${response.statusCode}: ${response.body}`);
  const media = (documented.content as Record<string, { schema: Json }>)["application/json"];
  const ajv = new Ajv2020({ strict: false, validateFormats: false });
  ajv.addSchema({ $id: "spec.json", ...spec } as object);
  const pointer = ["paths", found.path, found.method, "responses", String(response.statusCode)]
    .concat(["content", "application/json", "schema"])
    .map((part) => part.replaceAll("~", "~0").replaceAll("/", "~1"))
    .join("/");
  assert.ok(media);
  const validate = ajv.compile({ $ref: `spec.json#/${pointer}` });
  assert.ok(
    validate(JSON.parse(response.body)),
    `${operationId}: ${JSON.stringify(validate.errors)} in ${response.body}`,
  );
  return JSON.parse(response.body);
}

async function login() {
  const nonce = await inject(app, {
    method: "POST",
    url: "/v1/auth/siwe/nonce",
    headers: { origin },
    payload: {},
  });
  const binding = nonce.cookies.find((cookie) => cookie.name.endsWith("payvoke_siwe"))!;
  const issuedAt = new Date();
  const message = createSiweMessage({
    address: wallet.address,
    chainId: 43113,
    domain: new URL(origin).host,
    uri: origin,
    version: "1",
    nonce: nonce.json().nonce,
    issuedAt,
    expirationTime: new Date(issuedAt.getTime() + 300000),
  });
  const verified = await inject(app, {
    method: "POST",
    url: "/v1/auth/siwe/verify",
    headers: { origin, cookie: `${binding.name}=${encodeURIComponent(binding.value)}` },
    payload: { message, signature: await wallet.signMessage({ message }) },
  });
  const session = verified.cookies.find((cookie) => cookie.name.endsWith("session_token"))!;
  return `${session.name}=${encodeURIComponent(session.value)}`;
}

const command = {
  name: "write",
  description: "Writes a document",
  options: [
    { name: "brief", type: "STRING", required: true },
    { name: "pages", type: "INTEGER" },
  ],
  maxAmount: "50000",
  terms: {
    deliverySeconds: 600,
    reviewSeconds: 3600,
    revisionPolicy: { maxIncluded: 0, description: "None" },
    refundPolicy: "Refund undelivered",
    sideEffects: "none",
    dataUse: "This request",
  },
};

it("answers each builder route with the documented shape", async () => {
  const cookie = await login();
  const web = (method: string, url: string, payload?: unknown, headers = {}) =>
    inject(app, {
      method,
      url,
      headers: { origin, cookie, ...headers },
      ...(payload === undefined ? {} : { payload }),
    });
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
      minGrossAmount: "1000",
    },
  });
  const created = await web("POST", "/v1/provider/apps", {
    name: "Docs agent",
    clientRequestId: randomUUID(),
  });
  const appId = created.json().id as string;
  const secret = (await web("POST", `/v1/provider/apps/${appId}/keys`, {})).json().secret;
  const agent = (method: string, url: string, payload?: unknown, headers = {}) =>
    inject(app, {
      method,
      url: `/v1/provider/apps/${appId}${url}`,
      headers: { authorization: `Bearer ${secret}`, ...headers },
      ...(payload === undefined ? {} : { payload }),
    });

  // Commands.
  const [synced] = conform("overwriteCommands", await agent("PUT", "/commands", [command]));
  conform("listCommands", await agent("GET", "/commands"));
  const extra = conform(
    "createCommand",
    await agent("POST", "/commands", { ...command, name: "draft", maxAmount: undefined }),
  );
  conform(
    "updateCommand",
    await agent("PATCH", `/commands/${extra.id}`, { ...command, name: "draft2" }),
  );
  conform("archiveCommand", await agent("DELETE", `/commands/${extra.id}`));
  conform("setDefaultCommand", await agent("POST", `/commands/${synced.id}/default`, {}));
  conform("updateCommand", await agent("PATCH", "/commands/missing", command));

  // Pre-sale chat. Reading the feed is the heartbeat that puts the agent online.
  conform("readEvents", await agent("GET", "/events?once=1"));
  const threadId = (
    await web("POST", "/v1/threads", { appId, clientRequestId: randomUUID() })
  ).json().id as string;
  const said = await web("POST", `/v1/threads/${threadId}/messages`, {
    clientRequestId: randomUUID(),
    content: "Summarize my brief",
  });
  assert.equal(said.statusCode, 201, said.body);
  const feed = conform("readEvents", await agent("GET", "/events?once=1"));
  const message = feed.events.find((event: { type: string }) => event.type === "thread.message");
  conform(
    "acknowledgeMessage",
    await agent("POST", `/threads/${threadId}/messages/${message.id}/acks`),
  );
  conform(
    "sendMessage",
    await agent("POST", `/threads/${threadId}/messages`, {
      clientRequestId: randomUUID(),
      content: "Which tone?",
      tool: {
        name: "ask_choice",
        args: {
          prompt: "Pick a tone",
          options: [
            { id: "formal", label: "Formal" },
            { id: "casual", label: "Casual" },
          ],
        },
      },
    }),
  );
  const offer = (body = {}) =>
    agent("POST", `/threads/${threadId}/offers`, {
      clientRequestId: randomUUID(),
      arguments: { brief: "A two page summary" },
      grossAmount: "20000",
      summary: "Two-page summary of your brief.",
      ...body,
    });
  const first = conform("createOffer", await offer());
  conform(
    "withdrawOffer",
    await agent("POST", `/threads/${threadId}/offers/${first.id}/withdrawals`),
  );
  conform("createOffer", await offer({ grossAmount: "999" }));
  const accepted = conform("createOffer", await offer());

  // A paid, held invocation, as the settlement worker leaves it.
  const quoteId = randomUUID();
  const quoted = await web(
    "POST",
    "/v1/quotes",
    {
      threadId,
      offerId: accepted.id,
      contextSelection: { messageIds: [], briefVersionId: null, fileIds: [] },
      clientRequestId: quoteId,
    },
    { "idempotency-key": quoteId },
  );
  assert.equal(quoted.statusCode, 201, quoted.body);
  const document = quoted.json();
  const buyer = await db.walletAddress.findFirstOrThrow({
    where: { address: { equals: wallet.address, mode: "insensitive" } },
  });
  await db.invocation.create({
    data: {
      id: document.invocationId,
      quoteId: document.quoteId,
      buyerId: buyer.userId,
      executionStatus: "QUEUED",
    },
  });
  await db.settlementOperation.create({
    data: {
      invocationId: document.invocationId,
      invocationKey: document.protocolQuote.invocationKey,
      quoteDigest: document.quoteDigest,
      authorizationDigest: `0x${randomBytes(32).toString("hex")}`,
      recoveredSigner: wallet.address,
      paymentPayload: {},
      state: "HELD",
    },
  });
  await db.invocationReady.create({
    data: { invocationId: document.invocationId, quoteId: document.quoteId },
  });

  // The run.
  const ready = conform("readEvents", await agent("GET", "/events?once=1")).events.find(
    (event: { type: string }) => event.type === "invocation.ready",
  );
  const work = `/invocations/${ready.invocationId}`;
  const { runId } = conform(
    "acknowledgeRun",
    await agent("POST", `${work}/acks`, { eventId: ready.id }),
  );
  const report = (sequence: number, type: string, data?: unknown) =>
    agent("POST", `${work}/reports`, { reportId: `r${sequence}`, sequence, type, data });
  conform("sendReport", await report(1, "started"));
  conform("sendReport", await report(1, "started"));
  conform(
    "sendReport",
    await report(2, "progress", { stepId: "outline", label: "Outlining", status: "running" }),
  );
  conform("sendReport", await report(9, "progress", { stepId: "x", label: "Gap" }));
  const stream = `${work}/ag-ui/streams/${runId}`;
  const lines = [
    { type: "TEXT_MESSAGE_START", messageId: "m1", role: "assistant" },
    { type: "TEXT_MESSAGE_CONTENT", messageId: "m1", delta: "Working on it" },
    { type: "TEXT_MESSAGE_END", messageId: "m1" },
  ].map((event, index) => JSON.stringify({ streamSequence: index + 1, event }));
  conform(
    "streamRun",
    await agent("POST", stream, `${lines.join("\n")}\n`, {
      "content-type": "application/x-ndjson",
    }),
  );
  conform("readStreamCursor", await agent("GET", `${stream}/cursor`));
  // Storage is off in this test: file routes answer their documented 503.
  const upload = {
    name: "summary.md",
    contentType: "text/markdown",
    size: 12,
    sha256: "0".repeat(64),
    clientRequestId: randomUUID(),
  };
  conform("requestUpload", await agent("POST", `${work}/files`, upload));
  conform("downloadInput", await agent("GET", `${work}/files/missing/download`));
  conform(
    "sendReport",
    await report(3, "result", { artifactVersion: 1, output: "# Summary\n\nTwo pages.", files: [] }),
  );

  // Errors are `{ error }` with a documented status.
  conform(
    "listCommands",
    await agent("GET", "/commands", undefined, { authorization: "Bearer x" }),
  );
  assert.equal(
    (await agent("PUT", "/commands", { not: "a list" })).json().error,
    "INVALID_COMMANDS",
  );
});
