import { timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import Fastify from "fastify";
import manifest from "./manifest.json" with { type: "json" };

// Bind this ID to an immutable manifest version when registering the provider.
export const manifestVersionId = "00000000-0000-4000-8000-000000000008";
export interface StartInput {
  operationId: string;
  generation: 1;
  versionId: string;
  action: "design-logo";
  variant: "default";
  input: { text: string };
}
export interface TextResult {
  text: string;
  usage: { inputTokens: number | null; outputTokens: number | null };
  usageSource: "provider-asserted";
}
export type Generate = (text: string, signal: AbortSignal) => Promise<TextResult>;
interface OperationRow {
  id: string;
  input: string;
  status: string;
  result: string | null;
  error: string | null;
}
const uuid = { type: "string", format: "uuid" };
const strict = { additionalProperties: false };
export const startSchema = {
  type: "object",
  ...strict,
  required: ["operationId", "generation", "versionId", "action", "variant", "input"],
  properties: {
    operationId: uuid,
    generation: { const: 1 },
    versionId: { const: manifestVersionId },
    action: { const: "design-logo" },
    variant: { const: "default" },
    input: {
      type: "object",
      ...strict,
      required: ["text"],
      properties: {
        text: {
          type: "string",
          minLength: 1,
          maxLength: manifest.limits.inputChars,
          pattern: "\\S",
        },
      },
    },
  },
};

/** One server process per database. SQLite's exclusive lock fences restart recovery. */
export function createProvider(options: {
  token: string;
  databasePath: string;
  generate: Generate;
  timeoutMs?: number;
}) {
  if (options.token.length < 32)
    throw new Error("PROVIDER_TOKEN must contain at least 32 characters.");
  const db = new DatabaseSync(options.databasePath);
  try {
    db.exec("PRAGMA busy_timeout=0; PRAGMA journal_mode=DELETE; PRAGMA locking_mode=EXCLUSIVE;");
    db.exec(
      "CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, input TEXT NOT NULL, status TEXT NOT NULL, result TEXT, error TEXT);",
    );
    db.exec(
      "BEGIN EXCLUSIVE; UPDATE operations SET status='uncertain', error='PROCESS_INTERRUPTED' WHERE status='running'; COMMIT;",
    );
  } catch (error) {
    db.close();
    throw error;
  }
  const app = Fastify({
    logger: false,
    bodyLimit: 65536,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
  });
  const expectedToken = Buffer.from(options.token);
  let busy = false;
  const controllers = new Set<AbortController>();
  const tasks = new Set<Promise<void>>();
  const get = (id: string) =>
    db.prepare("SELECT * FROM operations WHERE id=?").get(id) as unknown as
      | OperationRow
      | undefined;
  const view = (row: OperationRow) => ({
    operationId: row.id,
    status: row.status,
    result: row.result ? (JSON.parse(row.result) as TextResult) : null,
    error: row.error,
  });
  app.setErrorHandler((error, _req, reply) => {
    const invalid = (error as { validation?: unknown }).validation;
    const status = invalid ? 400 : ((error as { statusCode?: number }).statusCode ?? 500);
    return reply.code(status).send({
      code: status === 400 ? "INVALID_REQUEST" : "REQUEST_FAILED",
      message: status < 500 ? "Invalid provider request." : "Provider request failed.",
    });
  });
  app.addHook("onRequest", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const raw = req.headers.authorization;
    const token =
      raw?.startsWith("Bearer ") && raw.length < 1024 ? Buffer.from(raw.slice(7)) : Buffer.alloc(0);
    if (token.length !== expectedToken.length || !timingSafeEqual(token, expectedToken)) {
      return reply
        .code(401)
        .send({ code: "UNAUTHORIZED", message: "A provider integration token is required." });
    }
  });
  app.get("/v1/manifest", async () => ({ versionId: manifestVersionId, manifest }));
  app.get<{ Params: { operationId: string } }>(
    "/v1/operations/:operationId",
    {
      schema: {
        params: { type: "object", required: ["operationId"], properties: { operationId: uuid } },
      },
    },
    async (req, reply) => {
      const row = get(req.params.operationId);
      return row
        ? view(row)
        : reply.code(404).send({ code: "NOT_FOUND", message: "Operation not found." });
    },
  );
  app.post<{ Body: StartInput }>(
    "/v1/operations",
    { schema: { body: startSchema } },
    async (req, reply) => {
      const input = req.body;
      // Fixed canonical shape: equivalent JSON key order must recover the same operation.
      const canonical = JSON.stringify([
        input.generation,
        input.versionId,
        input.action,
        input.variant,
        input.input.text,
      ]);
      const existing = get(input.operationId);
      if (existing) {
        if (existing.input !== canonical)
          return reply
            .code(409)
            .send({ code: "CONFLICT", message: "Operation ID already binds different input." });
        return view(existing);
      }
      if (busy)
        return reply
          .code(429)
          .send({ code: "BUSY", message: "Provider capacity is full; no operation was accepted." });
      // Persist identity before the model call. A lost HTTP response is recovered by GET or identical POST.
      db.prepare("INSERT INTO operations (id,input,status) VALUES (?,?,'running')").run(
        input.operationId,
        canonical,
      );
      busy = true;
      const controller = new AbortController();
      controllers.add(controller);
      const timeout = setTimeout(
        () => {
          controller.abort();
          db.prepare(
            "UPDATE operations SET status='uncertain',error='DEADLINE_EXCEEDED' WHERE id=? AND status='running'",
          ).run(input.operationId);
        },
        options.timeoutMs ?? manifest.limits.timeoutSeconds * 1000,
      );
      const task = Promise.resolve()
        .then(() => options.generate(input.input.text, controller.signal))
        .then((result) => {
          const validTokens = (value: number | null) =>
            value === null || (Number.isSafeInteger(value) && value >= 0);
          if (
            !result.text.trim() ||
            result.text.length > 32768 ||
            result.usageSource !== "provider-asserted" ||
            !validTokens(result.usage.inputTokens) ||
            !validTokens(result.usage.outputTokens)
          )
            throw new Error("Invalid output.");
          // A late completion after uncertainty cannot silently overwrite the operation's outcome.
          db.prepare(
            "UPDATE operations SET status='succeeded',result=? WHERE id=? AND status='running'",
          ).run(JSON.stringify(result), input.operationId);
        })
        .catch(() => {
          db.prepare(
            "UPDATE operations SET status='failed',error='GENERATION_FAILED' WHERE id=? AND status='running'",
          ).run(input.operationId);
        })
        .finally(() => {
          clearTimeout(timeout);
          busy = false;
          controllers.delete(controller);
          tasks.delete(task);
        });
      tasks.add(task);
      return reply.code(202).send(view(get(input.operationId)!));
    },
  );
  app.addHook("onClose", async () => {
    db.exec(
      "UPDATE operations SET status='uncertain', error='PROCESS_INTERRUPTED' WHERE status='running';",
    );
    for (const controller of controllers) controller.abort();
    await Promise.allSettled(tasks);
    db.close();
  });
  return app;
}
