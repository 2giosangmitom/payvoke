import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import Ajv2020 from "ajv/dist/2020.js";
import { randomUUID } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import { Prisma, type PrismaClient } from "../../generated/prisma/client";
import { identifier, object, providerKey, hash, validateEvent } from "./protocol";
import { verifyStructuredDeliveries } from "./verify";
import { applyOpenUIPatch, openuiCatalog } from "../openui/validator";
import { availabilityLabel } from "../apps/schema";

type Params = { appId: string; id: string; runId: string };
type Row = { cursor: bigint; event: Prisma.JsonValue };
type StreamItem = { sequence: number; event: Record<string, unknown>; digest: string };
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const json = (value: unknown) => value as Prisma.InputJsonValue;
const validSequence = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 1_000_000;
const reportTypes = ["started", "progress", "question", "result", "failed"] as const;

async function sse(
  request: FastifyRequest,
  reply: FastifyReply,
  read: (cursor: bigint) => Promise<Row[]>,
  start: bigint,
  once = false,
  eventName = "ag-ui",
) {
  reply.hijack();
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  reply.raw.write(": connected\n\n");
  let stopped = false;
  // IncomingMessage "close" can fire as soon as the GET request completes;
  // the response is the long-lived half of an SSE connection.
  reply.raw.on("close", () => {
    stopped = true;
  });
  let cursor = start;
  try {
    let lastHeartbeat = Date.now();
    do {
      const rows = await read(cursor);
      for (const row of rows) {
        if (stopped || reply.raw.destroyed) break;
        if (
          !reply.raw.write(
            `id: ${row.cursor}\nevent: ${eventName}\ndata: ${JSON.stringify(row.event)}\n\n`,
          )
        ) {
          stopped = true;
          break;
        }
        cursor = row.cursor;
      }
      if (once) break;
      if (Date.now() - lastHeartbeat > 15000) {
        reply.raw.write(": keep-alive\n\n");
        lastHeartbeat = Date.now();
      }
      await pause(600);
    } while (!stopped && !reply.raw.destroyed);
  } finally {
    reply.raw.end();
  }
}

// OpenUI ingress is a display-only projection. Question metadata is validated
// separately because it becomes the schema for a buyer answer.
function questionPayload(value: unknown) {
  if (!object(value)) throw new Error("INVALID_QUESTION");
  const { questionId, prompt, inputSchema, chatTextParameter } = value;
  if (
    !identifier(questionId) ||
    typeof prompt !== "string" ||
    prompt.length < 1 ||
    prompt.length > 2000 ||
    !object(inputSchema) ||
    JSON.stringify(inputSchema).length > 20000 ||
    (chatTextParameter !== undefined && !identifier(chatTextParameter)) ||
    Object.keys(value).some(
      (key) => !["questionId", "prompt", "inputSchema", "chatTextParameter"].includes(key),
    )
  )
    throw new Error("INVALID_QUESTION");
  try {
    new Ajv2020({ strict: true }).compile(inputSchema);
  } catch {
    throw new Error("INVALID_QUESTION_SCHEMA");
  }
  return {
    questionId,
    prompt,
    inputSchema,
    chatTextParameter: chatTextParameter as string | undefined,
  };
}

function revisionPolicy(terms: unknown) {
  if (!object(terms) || !object(terms.revisionPolicy)) return null;
  const { maxIncluded, description } = terms.revisionPolicy;
  if (!Number.isSafeInteger(maxIncluded) || (maxIncluded as number) < 0) return null;
  return {
    maxIncluded: maxIncluded as number,
    description: typeof description === "string" ? description.slice(0, 1000) : "",
  };
}

export async function registerAgui(
  app: FastifyInstance,
  db: PrismaClient,
  retentionSeconds = 604800,
) {
  // Runs independently of provider report requests. A delivery decision is
  // based on the stored immutable result and its snapshotted command schema.
  let verifying = false;
  const verifier = setInterval(async () => {
    if (verifying) return;
    verifying = true;
    try {
      await verifyStructuredDeliveries(db);
    } catch (error) {
      app.log.error({ error }, "structured delivery verifier failed");
    } finally {
      verifying = false;
    }
  }, 3000);
  verifier.unref();
  app.addHook("onClose", async () => clearInterval(verifier));
  // Fastify's default JSON parser must not buffer a long-running provider stream.
  app.addContentTypeParser("application/x-ndjson", (_request, payload, done) =>
    done(null, payload),
  );

  app.post<{ Body: { appId: string; clientRequestId: string; title?: string } }>(
    "/v1/threads",
    { preHandler: app.requireAccount, bodyLimit: 4096 },
    async (request, reply) => {
      const { appId, clientRequestId, title } = request.body ?? {};
      if (
        typeof appId !== "string" ||
        appId.length > 128 ||
        typeof clientRequestId !== "string" ||
        !/^[\w-]{1,128}$/.test(clientRequestId) ||
        (title !== undefined &&
          (typeof title !== "string" || title.trim().length < 1 || title.length > 160))
      )
        throw app.httpErrors.badRequest("INVALID_THREAD");
      const buyerId = request.account!.id;
      const key = { buyerId_clientRequestId: { buyerId, clientRequestId } };
      // Replay an earlier success before checking current app visibility or
      // status; a lost response must stay idempotent across suspend/archive.
      const prior = await db.chatThread.findUnique({ where: key });
      if (prior) {
        if (prior.appId !== appId) throw app.httpErrors.conflict("IDEMPOTENCY_CONFLICT");
        return reply.code(200).send({
          id: prior.id,
          appId: prior.appId,
          title: prior.title,
          createdAt: prior.createdAt,
        });
      }
      const appRow = await db.app.findFirst({
        where: {
          id: appId,
          status: "ACTIVE",
          archivedAt: null,
          OR: [{ visibility: "PUBLIC" }, { ownerId: buyerId }],
        },
      });
      if (!appRow) throw app.httpErrors.notFound("APP_NOT_FOUND");
      const thread = await db.chatThread.create({
        data: {
          buyerId,
          appId,
          clientRequestId,
          title: title?.trim() || null,
        },
      });
      return reply.code(201).send({
        id: thread.id,
        appId: thread.appId,
        title: thread.title,
        createdAt: thread.createdAt,
      });
    },
  );

  app.get<{ Querystring: { q?: string; cursor?: string; archived?: string } }>(
    "/v1/threads",
    { preHandler: app.requireAccount },
    async (request) => {
      const { q, cursor } = request.query;
      if ((q && q.length > 100) || (cursor && cursor.length > 128))
        throw app.httpErrors.badRequest("INVALID_THREAD_QUERY");
      const rows = await db.chatThread.findMany({
        where: {
          buyerId: request.account!.id,
          ...(request.query.archived === "1"
            ? { archivedAt: { not: null } }
            : { archivedAt: null }),
          ...(q
            ? {
                OR: [
                  { title: { contains: q.trim(), mode: "insensitive" as const } },
                  { app: { name: { contains: q.trim(), mode: "insensitive" as const } } },
                ],
              }
            : {}),
        },
        include: {
          app: {
            select: {
              id: true,
              name: true,
              description: true,
              status: true,
              defaultCommandId: true,
              lastHeartbeatAt: true,
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        take: 51,
      });
      const items = rows.slice(0, 50).map((row) => ({
        id: row.id,
        title: row.title,
        app: {
          id: row.app.id,
          name: row.app.name,
          description: row.app.description,
          availability: availabilityLabel(row.app),
        },
        lastMessageAt: row.lastMessageAt,
        archivedAt: row.archivedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));
      return { items, nextCursor: rows.length > 50 ? rows[49].id : null };
    },
  );

  app.get<{ Params: { threadId: string } }>(
    "/v1/threads/:threadId",
    { preHandler: app.requireAccount },
    async (request) => {
      const thread = await db.chatThread.findFirst({
        where: { id: request.params.threadId, buyerId: request.account!.id },
        include: {
          app: {
            include: {
              commands: {
                where: { archivedAt: null, activeRevisionId: { not: null } },
                include: { activeRevision: true },
                orderBy: { createdAt: "asc" },
              },
            },
          },
        },
      });
      if (!thread) throw app.httpErrors.notFound("THREAD_NOT_FOUND");
      const active = thread.activeQuoteId
        ? await db.quote.findUnique({
            where: { id: thread.activeQuoteId },
            select: {
              validUntil: true,
              invocation: {
                select: {
                  executionStatus: true,
                  settlement: {
                    select: {
                      state: true,
                      attempt: { select: { state: true, finalizedAt: true } },
                    },
                  },
                },
              },
            },
          })
        : null;
      const settlement = active?.invocation?.settlement;
      const reverted =
        settlement?.state === "REJECTED" &&
        settlement.attempt?.state === "REVERTED" &&
        Boolean(settlement.attempt.finalizedAt);
      // Mirrors quote admission: an unattempted rejection releases the thread
      // only after the quote expires; an unresolved attempt keeps it busy.
      const rejectedWithoutAttempt = settlement?.state === "REJECTED" && !settlement.attempt;
      const resolved =
        active?.invocation?.executionStatus === "DELIVERED" ||
        reverted ||
        (active &&
          (!settlement || rejectedWithoutAttempt) &&
          active.validUntil.getTime() <= Date.now());
      const defaultCommand =
        thread.app.commands.find((c) => c.id === thread.app.defaultCommandId) ??
        thread.app.commands[0] ??
        null;
      const revision = defaultCommand?.activeRevision;
      return {
        id: thread.id,
        appId: thread.appId,
        title: thread.title,
        archivedAt: thread.archivedAt,
        app: {
          id: thread.app.id,
          name: thread.app.name,
          description: thread.app.description,
          visibility: thread.app.visibility,
          status: thread.app.status,
          availability: availabilityLabel(thread.app),
        },
        activeQuoteId: resolved ? null : thread.activeQuoteId,
        defaultCommandId: defaultCommand?.id ?? null,
        chatTextParameter: revision?.positionalParameter ?? null,
        revisionPolicy: revisionPolicy(revision?.terms),
        commands: thread.app.commands.map((command) => ({
          id: command.id,
          name: command.name,
          description: command.description,
          revision: command.activeRevision
            ? {
                ...command.activeRevision,
                grossAmount: command.activeRevision.grossAmount.toFixed(0),
              }
            : null,
        })),
      };
    },
  );

  app.patch<{ Params: { threadId: string }; Body: { title: string } }>(
    "/v1/threads/:threadId",
    { preHandler: app.requireAccount, bodyLimit: 2048 },
    async (request) => {
      if (
        typeof request.body?.title !== "string" ||
        request.body.title.trim().length < 1 ||
        request.body.title.length > 160
      )
        throw app.httpErrors.badRequest("INVALID_TITLE");
      const changed = await db.chatThread.updateMany({
        where: { id: request.params.threadId, buyerId: request.account!.id },
        data: { title: request.body.title.trim() },
      });
      if (!changed.count) throw app.httpErrors.notFound("THREAD_NOT_FOUND");
      return { title: request.body.title.trim() };
    },
  );

  app.post<{ Params: { threadId: string } }>(
    "/v1/threads/:threadId/archive",
    { preHandler: app.requireAccount },
    async (request) => {
      const changed = await db.chatThread.updateMany({
        where: { id: request.params.threadId, buyerId: request.account!.id, archivedAt: null },
        data: { archivedAt: new Date() },
      });
      if (!changed.count) throw app.httpErrors.notFound("THREAD_NOT_FOUND");
      return { archived: true };
    },
  );

  async function work(
    request: FastifyRequest<{ Params: Params }>,
    scope: "events:read" | "events:ack" | "reports:write",
  ) {
    const { appId, id } = request.params;
    await providerKey(app, db, request, appId, scope);
    const invocation = await db.invocation.findUnique({
      where: { id },
      include: {
        quote: { include: { thread: true, app: true } },
        settlement: true,
        readyEvent: true,
        run: true,
      },
    });
    if (
      !invocation ||
      invocation.quote.appId !== appId ||
      !invocation.readyEvent ||
      invocation.settlement?.state !== "HELD"
    )
      throw app.httpErrors.notFound("INVOCATION_NOT_READY");
    return invocation;
  }

  // Continuations are durable queue items too. The provider re-reads them until
  // ACK; each one carries the Payvoke-issued runId for the next cycle.
  async function providerEvents(appId: string) {
    const ready = await db.invocationReady.findMany({
      where: {
        acknowledgedAt: null,
        invocation: {
          settlement: { state: "HELD" },
          quote: { appId },
        },
      },
      include: { invocation: { include: { quote: true } } },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    const answers = await db.invocationAnswer.findMany({
      where: {
        acknowledgedAt: null,
        invocation: {
          settlement: { state: "HELD" },
          quote: { appId },
        },
      },
      include: { invocation: { include: { quote: true } } },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    const revisions = await db.invocationRevision.findMany({
      where: {
        acknowledgedAt: null,
        invocation: {
          settlement: { state: "HELD" },
          quote: { appId },
        },
      },
      include: { invocation: { include: { quote: true } } },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    const events: { id: string; createdAt: Date; event: Record<string, unknown> }[] = [];
    for (const row of ready) {
      events.push({
        id: row.invocationId,
        createdAt: row.createdAt,
        event: {
          type: "invocation.ready",
          invocationId: row.invocationId,
          runId: row.runId,
          threadId: row.invocation.quote.threadId,
          input: (row.invocation.quote.document as Record<string, unknown>).inputSnapshot,
        },
      });
    }
    for (const row of answers) {
      events.push({
        id: row.id,
        createdAt: row.createdAt,
        event: {
          type: "invocation.answer",
          invocationId: row.invocationId,
          runId: row.runId,
          threadId: row.invocation.quote.threadId,
          answerId: row.id,
          questionId: row.questionId,
          arguments: row.arguments,
        },
      });
    }
    for (const row of revisions) {
      events.push({
        id: row.id,
        createdAt: row.createdAt,
        event: {
          type: "invocation.revision_requested",
          invocationId: row.invocationId,
          runId: row.runId,
          threadId: row.invocation.quote.threadId,
          revisionId: row.id,
          reason: row.reason,
          targetArtifactVersion: row.targetArtifactVersion,
        },
      });
    }
    return events.sort(
      (left, right) =>
        left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id),
    );
  }

  // Provider LLMs need the exact component signatures the gateway accepts.
  const catalog = openuiCatalog();
  app.get("/v1/openui/catalog", async () => catalog);

  const base = "/v1/provider/apps/:appId";
  async function heartbeat(appId: string) {
    await db.app
      .updateMany({ where: { id: appId }, data: { lastHeartbeatAt: new Date() } })
      .catch(() => undefined);
  }
  app.get<{ Params: { appId: string }; Querystring: { after?: string; once?: string } }>(
    `${base}/events`,
    async (request, reply) => {
      await providerKey(app, db, request, request.params.appId, "events:read");
      await heartbeat(request.params.appId);
      if (request.query.once === "1") {
        return {
          events: (await providerEvents(request.params.appId)).map(({ id, event }) => ({
            id,
            ...event,
          })),
        };
      }
      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      reply.raw.write(": connected\n\n");
      let closed = false;
      reply.raw.on("close", () => {
        closed = true;
      });
      try {
        while (!closed && !reply.raw.destroyed) {
          await heartbeat(request.params.appId);
          for (const row of await providerEvents(request.params.appId)) {
            if (
              !reply.raw.write(
                `id: ${row.id}\nevent: ${String(row.event.type)}\ndata: ${JSON.stringify(row.event)}\n\n`,
              )
            ) {
              closed = true;
              break;
            }
          }
          reply.raw.write(": keep-alive\n\n");
          await pause(3000);
        }
      } finally {
        reply.raw.end();
      }
    },
  );

  app.post<{ Params: Params; Body?: { eventId?: string } }>(
    `${base}/invocations/:id/acks`,
    { bodyLimit: 2048 },
    async (request) => {
      const invocation = await work(request, "events:ack");
      const ready = invocation.readyEvent!;
      const requested = request.body?.eventId;
      if (requested !== undefined && (typeof requested !== "string" || requested.length > 128))
        throw app.httpErrors.badRequest("INVALID_EVENT_ID");
      let runId = invocation.runId ?? ready.runId;
      if (requested) {
        if (requested === ready.invocationId || requested === invocation.id) {
          runId = ready.runId;
        } else {
          const answer = await db.invocationAnswer.findFirst({
            where: { id: requested, invocationId: invocation.id },
            select: { runId: true },
          });
          const revision = answer
            ? null
            : await db.invocationRevision.findFirst({
                where: { id: requested, invocationId: invocation.id },
                select: { runId: true },
              });
          if (!answer && !revision) throw app.httpErrors.notFound("EVENT_NOT_FOUND");
          runId = (answer ?? revision)!.runId;
        }
      }
      if (runId !== invocation.runId && runId !== ready.runId)
        throw app.httpErrors.conflict("STALE_RUN");
      if (!["QUEUED", "ACKED"].includes(invocation.executionStatus)) {
        if (invocation.run?.acknowledgedAt && invocation.run.runId === runId)
          return { invocationId: invocation.id, runId, status: invocation.executionStatus };
        throw app.httpErrors.conflict("RUN_NOT_QUEUEABLE");
      }
      await db.$transaction(async (tx) => {
        if (runId === ready.runId) {
          await tx.invocationReady.updateMany({
            where: { invocationId: invocation.id, acknowledgedAt: null },
            data: { acknowledgedAt: new Date() },
          });
        } else {
          await tx.invocationAnswer.updateMany({
            where: { invocationId: invocation.id, runId, acknowledgedAt: null },
            data: { acknowledgedAt: new Date() },
          });
          await tx.invocationRevision.updateMany({
            where: { invocationId: invocation.id, runId, acknowledgedAt: null },
            data: { acknowledgedAt: new Date() },
          });
        }
        await tx.providerRun.upsert({
          where: { runId },
          create: { invocationId: invocation.id, runId, acknowledgedAt: new Date() },
          update: { acknowledgedAt: new Date() },
        });
        await tx.invocation.updateMany({
          where: { id: invocation.id, executionStatus: "QUEUED" },
          data: { executionStatus: "ACKED", runId },
        });
      });
      return { invocationId: invocation.id, runId, status: "ACKED" };
    },
  );

  app.post<{
    Params: Params;
    Body: { reportId: string; sequence: number; type: string; data?: unknown };
  }>(`${base}/invocations/:id/reports`, { bodyLimit: 64000 }, async (request) => {
    const inv = await work(request, "reports:write");
    const { reportId, sequence, type, data } = request.body ?? {};
    if (
      typeof reportId !== "string" ||
      !/^[\w-]{1,128}$/.test(reportId) ||
      !validSequence(sequence) ||
      !reportTypes.includes(type as (typeof reportTypes)[number]) ||
      (data !== undefined && !object(data))
    )
      throw app.httpErrors.badRequest("INVALID_REPORT");
    const run = inv.run;
    if (!run || !run.acknowledgedAt) throw app.httpErrors.conflict("RUN_NOT_ACKED");
    const digest = hash({ reportId, sequence, type, data: data ?? null });
    // Replay the stored response before checking the current state. A finished
    // run legitimately receives the same result report again after a timeout.
    if (sequence <= run.reportSequence) {
      const prior = await db.providerReport.findUnique({
        where: { runId_sequence: { runId: run.runId, sequence } },
      });
      if (!prior || prior.reportId !== reportId || prior.contentHash !== digest)
        throw app.httpErrors.conflict("REPORT_SEQUENCE_CONFLICT");
      return { lastCommittedSequence: run.reportSequence };
    }
    if (type === "started" && run.state !== "QUEUED")
      throw app.httpErrors.conflict("RUN_ALREADY_STARTED");
    if (type === "question" && run.state !== "RUNNING")
      throw app.httpErrors.conflict("RUN_NOT_RUNNING");
    if (type === "result" && run.state !== "RUNNING")
      throw app.httpErrors.conflict("RUN_NOT_RUNNING");
    if (type === "progress" && !["RUNNING", "WAITING_BUYER"].includes(run.state))
      throw app.httpErrors.conflict("RUN_NOT_RUNNING");
    if (type === "failed" && !["RUNNING", "WAITING_BUYER"].includes(run.state))
      throw app.httpErrors.conflict("RUN_NOT_RUNNING");
    if (["question", "result", "failed"].includes(type) && run.activeMessageId)
      throw app.httpErrors.conflict("MESSAGE_NOT_CLOSED");
    if (sequence !== run.reportSequence + 1) throw app.httpErrors.conflict("REPORT_SEQUENCE_GAP");
    const question = type === "question" ? questionPayload(data) : null;
    if (question) {
      const open = await db.invocationQuestion.findFirst({
        where: { invocationId: inv.id, status: "OPEN" },
        select: { id: true },
      });
      if (open) throw app.httpErrors.conflict("QUESTION_ALREADY_OPEN");
    }
    const result = type === "result" ? (data as Record<string, unknown> | undefined) : undefined;
    if (type === "result") {
      if (
        !result ||
        !Number.isSafeInteger(result.artifactVersion) ||
        (result.artifactVersion as number) < 1 ||
        !Array.isArray(result.files)
      )
        throw app.httpErrors.badRequest("INVALID_RESULT");
      const definition = inv.quote.commandRevisionId
        ? await db.appCommandRevision.findUnique({
            where: { id: inv.quote.commandRevisionId },
          })
        : null;
      if (!definition) throw app.httpErrors.conflict("COMMAND_REVISION_NOT_FOUND");
      if (!definition.outputSchema) throw app.httpErrors.badRequest("INVALID_RESULT_OUTPUT");
      const validate = new Ajv2020({ strict: true }).compile(definition.outputSchema as object);
      if (!validate(result.output)) throw app.httpErrors.badRequest("INVALID_RESULT_OUTPUT");
      const latest = await db.paymentDeliveryEvidence.findFirst({
        where: { invocationId: inv.id },
        orderBy: { artifactVersion: "desc" },
        select: { artifactVersion: true },
      });
      // A revision must publish a strictly newer artifact than the delivered one.
      if (latest && (result.artifactVersion as number) <= latest.artifactVersion)
        throw app.httpErrors.badRequest("ARTIFACT_VERSION_NOT_INCREMENTED");
      // Artifact storage/access validation remains a separate trusted verification step.
      if (result.files.length > 0) throw app.httpErrors.badRequest("FILES_NOT_SUPPORTED");
    }
    const events: Record<string, unknown>[] = [];
    if (type === "started")
      events.push({ type: "RUN_STARTED", threadId: inv.quote.threadId, runId: run.runId });
    if (type === "progress")
      events.push({
        type: "ACTIVITY_SNAPSHOT",
        messageId: `progress-${run.runId}`,
        activityType: "payvoke.progress",
        content: data ?? {},
        replace: true,
      });
    if (type === "question") {
      events.push({ type: "CUSTOM", name: "payvoke.question", value: question });
      events.push({ type: "RUN_FINISHED", threadId: inv.quote.threadId, runId: run.runId });
    }
    if (type === "result")
      events.push({ type: "RUN_FINISHED", threadId: inv.quote.threadId, runId: run.runId });
    if (type === "failed") events.push({ type: "RUN_ERROR", message: "Provider run failed" });
    const nextState =
      type === "started"
        ? "RUNNING"
        : type === "question"
          ? "WAITING_BUYER"
          : type === "result"
            ? "VERIFYING"
            : type === "failed"
              ? "FAILED"
              : "RUNNING";
    const nextExecution =
      type === "started"
        ? "RUNNING"
        : type === "question"
          ? "WAITING_BUYER"
          : type === "result"
            ? "VERIFYING"
            : type === "failed"
              ? "FAILED"
              : inv.executionStatus;
    await db.$transaction(async (tx) => {
      const updated = await tx.providerRun.updateMany({
        where: {
          runId: run.runId,
          reportSequence: sequence - 1,
          state: run.state,
          ...(type === "failed" ? { activeMessageId: null } : {}),
        },
        data: {
          reportSequence: sequence,
          state: nextState,
          ...(type === "result" ? { result: json(data ?? {}) } : {}),
        },
      });
      if (!updated.count) throw app.httpErrors.conflict("REPORT_CONFLICT");
      await tx.providerReport.create({
        data: { runId: run.runId, sequence, reportId, contentHash: digest, type },
      });
      for (const event of events) {
        await tx.aguiStreamEvent.create({
          data: {
            invocationId: inv.id,
            threadId: inv.quote.threadId,
            runId: run.runId,
            event: json(event),
          },
        });
      }
      if (question) {
        await tx.invocationQuestion.create({
          data: {
            invocationId: inv.id,
            questionId: question.questionId,
            runId: run.runId,
            prompt: question.prompt,
            inputSchema: json(question.inputSchema),
            chatTextParameter: question.chatTextParameter ?? null,
          },
        });
      }
      if (type !== "progress") {
        await tx.invocation.update({
          where: { id: inv.id },
          data: { executionStatus: nextExecution },
        });
      }
    });
    return { lastCommittedSequence: sequence, executionStatus: nextExecution };
  });

  const stream = `${base}/invocations/:id/ag-ui/streams/:runId`;
  app.get<{ Params: Params }>(`${stream}/cursor`, async (request) => {
    const inv = await work(request, "reports:write");
    if (!inv.run || inv.run.runId !== request.params.runId)
      throw app.httpErrors.notFound("RUN_NOT_FOUND");
    return { runId: inv.run.runId, lastCommittedSequence: inv.run.sequence };
  });
  app.post<{ Params: Params }>(stream, { bodyLimit: 524288 }, async (request) => {
    const inv = await work(request, "reports:write");
    if (!inv.run || inv.run.runId !== request.params.runId || inv.run.state !== "RUNNING")
      throw app.httpErrors.conflict("RUN_NOT_RUNNING");
    if (!request.is("application/x-ndjson"))
      throw app.httpErrors.unsupportedMediaType("NDJSON_REQUIRED");
    let buffer = "";
    const decoder = new StringDecoder("utf8");
    let bytes = 0;
    let committed = inv.run.sequence;

    // Lines are committed as a short batch, not one transaction per token. A
    // failed batch rolls back, so the provider cursor always names a safe prefix.
    const commit = async (items: StreamItem[]) => {
      if (!items.length) return committed;
      return db.$transaction(async (tx) => {
        const run = await tx.providerRun.findUniqueOrThrow({ where: { runId: inv.run!.runId } });
        if (run.state !== "RUNNING" || !run.acknowledgedAt)
          throw app.httpErrors.conflict("RUN_NOT_RUNNING");
        let sequence = run.sequence;
        let messageId = run.activeMessageId;
        const pending = new Map<number, string>();
        const surfaces = new Map(
          (await tx.openUISurface.findMany({ where: { runId: run.runId } })).map((surface) => [
            surface.surfaceId,
            surface.source,
          ]),
        );
        const touched = new Set<string>();
        const rows: {
          invocationId: string;
          threadId: string;
          runId: string;
          streamSequence: number;
          sourceHash: string;
          event: Prisma.InputJsonValue;
        }[] = [];
        for (const item of items) {
          const { sequence: streamSequence, event, digest } = item;
          if (streamSequence <= sequence) {
            if (pending.has(streamSequence)) {
              if (pending.get(streamSequence) !== digest)
                throw app.httpErrors.conflict("STREAM_SEQUENCE_CONFLICT");
              continue;
            }
            const existing = await tx.aguiStreamEvent.findUnique({
              where: { runId_streamSequence: { runId: run.runId, streamSequence } },
            });
            if (!existing || existing.sourceHash !== digest)
              throw app.httpErrors.conflict("STREAM_SEQUENCE_CONFLICT");
            continue;
          }
          if (streamSequence !== sequence + 1) throw app.httpErrors.conflict("STREAM_SEQUENCE_GAP");
          let projected: Record<string, unknown> = event;
          if (event.type === "TEXT_MESSAGE_START") {
            if (messageId) throw app.httpErrors.conflict("MESSAGE_ALREADY_OPEN");
            messageId = event.messageId as string;
          } else if (event.type === "TEXT_MESSAGE_CONTENT" || event.type === "TEXT_MESSAGE_END") {
            if (messageId !== event.messageId) throw app.httpErrors.conflict("MESSAGE_NOT_OPEN");
            if (event.type === "TEXT_MESSAGE_END") messageId = null;
          } else {
            const { surfaceId, source: patch } = event.value as Record<string, string>;
            let source: string;
            try {
              source = applyOpenUIPatch(surfaces.get(surfaceId) ?? "", patch);
            } catch (error) {
              throw app.httpErrors.badRequest(
                error instanceof Error ? error.message : "INVALID_OPENUI",
              );
            }
            surfaces.set(surfaceId, source);
            touched.add(surfaceId);
            // The buyer always receives the whole program, so a reconnecting
            // client can render a surface from its latest snapshot alone.
            projected = {
              type: "ACTIVITY_SNAPSHOT",
              messageId: `openui-${surfaceId}`,
              activityType: "openui-surface",
              content: { source, invocationId: inv.id, surfaceId },
              replace: true,
            };
          }
          pending.set(streamSequence, digest);
          rows.push({
            invocationId: inv.id,
            threadId: inv.quote.threadId,
            runId: run.runId,
            streamSequence,
            sourceHash: digest,
            // All stream data is display-only, independent of paid delivery state.
            event: json(
              projected.messageId
                ? { ...projected, messageId: `${run.runId}-${projected.messageId}` }
                : projected,
            ),
          });
          sequence = streamSequence;
        }
        if (rows.length) {
          for (const surfaceId of touched) {
            const source = surfaces.get(surfaceId)!;
            await tx.openUISurface.upsert({
              where: { runId_surfaceId: { runId: run.runId, surfaceId } },
              create: { runId: run.runId, surfaceId, source },
              update: { source },
            });
          }
          const updated = await tx.providerRun.updateMany({
            where: { runId: run.runId, sequence: run.sequence, state: "RUNNING" },
            data: { sequence, activeMessageId: messageId },
          });
          if (!updated.count) throw app.httpErrors.conflict("STREAM_WRITER_CONFLICT");
          await tx.aguiStreamEvent.createMany({ data: rows });
        }
        return sequence;
      });
    };

    const consume = async (lines: string[]) => {
      const items: StreamItem[] = [];
      for (const line of lines) {
        if (!line.trim()) continue;
        if (line.length > 16384) throw app.httpErrors.payloadTooLarge("EVENT_TOO_LARGE");
        let data: unknown;
        try {
          data = JSON.parse(line);
        } catch {
          throw app.httpErrors.badRequest("INVALID_NDJSON");
        }
        if (!object(data) || !validSequence(data.streamSequence))
          throw app.httpErrors.badRequest("INVALID_SEQUENCE");
        let event: Record<string, unknown>;
        try {
          event = validateEvent(data.event);
        } catch (error) {
          throw app.httpErrors.badRequest(error instanceof Error ? error.message : "INVALID_EVENT");
        }
        items.push({ sequence: data.streamSequence, event, digest: hash(event) });
      }
      committed = await commit(items);
    };

    for await (const chunk of request.body as AsyncIterable<Buffer>) {
      bytes += chunk.length;
      if (bytes > 524288) throw app.httpErrors.payloadTooLarge("STREAM_TOO_LARGE");
      buffer += decoder.write(chunk);
      let position: number;
      const lines: string[] = [];
      while ((position = buffer.indexOf("\n")) !== -1) {
        lines.push(buffer.slice(0, position));
        buffer = buffer.slice(position + 1);
      }
      if (buffer.length > 16384) throw app.httpErrors.payloadTooLarge("EVENT_TOO_LARGE");
      await consume(lines);
    }
    buffer += decoder.end();
    if (buffer.trim()) await consume([buffer]);
    return { runId: inv.run.runId, lastCommittedSequence: committed };
  });

  const own = async (request: FastifyRequest<{ Params: { threadId: string } }>) => {
    const thread = await db.chatThread.findFirst({
      where: { id: request.params.threadId, buyerId: request.account!.id },
    });
    if (!thread) throw app.httpErrors.notFound("THREAD_NOT_FOUND");
    return thread;
  };

  // A buyer answer is free and starts a new provider run inside the same
  // invocation/hold. The input schema comes from the provider question, never
  // from the browser.
  app.post<{
    Params: { id: string };
    Body: { questionId: string; arguments: Record<string, unknown>; clientRequestId: string };
  }>(
    "/v1/invocations/:id/answers",
    { preHandler: app.requireAccount, bodyLimit: 32768 },
    async (request, reply) => {
      const body = request.body;
      if (
        !object(body) ||
        !identifier(body.questionId) ||
        !identifier(body.clientRequestId) ||
        !object(body.arguments)
      )
        throw app.httpErrors.badRequest("INVALID_ANSWER");
      const invocation = await db.invocation.findFirst({
        where: { id: request.params.id, buyerId: request.account!.id },
        include: { quote: true, run: true },
      });
      if (!invocation) throw app.httpErrors.notFound("INVOCATION_NOT_FOUND");
      const replay = await db.invocationAnswer.findUnique({
        where: {
          invocationId_clientRequestId: {
            invocationId: invocation.id,
            clientRequestId: body.clientRequestId,
          },
        },
      });
      if (replay) {
        if (
          replay.questionId !== body.questionId ||
          hash(replay.arguments) !== hash(body.arguments)
        )
          throw app.httpErrors.conflict("ANSWER_IDEMPOTENCY_CONFLICT");
        return reply.code(202).send({
          questionId: replay.questionId,
          answerId: replay.id,
          runId: replay.runId,
          executionStatus: invocation.executionStatus,
        });
      }
      if (invocation.executionStatus !== "WAITING_BUYER")
        throw app.httpErrors.conflict("QUESTION_NOT_OPEN");
      const question = await db.invocationQuestion.findFirst({
        where: { invocationId: invocation.id, questionId: body.questionId, status: "OPEN" },
      });
      if (!question) throw app.httpErrors.conflict("QUESTION_NOT_OPEN");
      let validate: ReturnType<Ajv2020["compile"]>;
      try {
        validate = new Ajv2020({ strict: true }).compile(question.inputSchema as object);
      } catch {
        throw app.httpErrors.serviceUnavailable("QUESTION_SCHEMA_UNAVAILABLE");
      }
      if (!validate(body.arguments)) throw app.httpErrors.badRequest("INVALID_ANSWER_ARGUMENTS");
      const runId = randomUUID();
      try {
        await db.$transaction(async (tx) => {
          const claimed = await tx.invocationQuestion.updateMany({
            where: { invocationId: invocation.id, questionId: body.questionId, status: "OPEN" },
            data: { status: "ANSWERED", answeredAt: new Date() },
          });
          if (!claimed.count) throw app.httpErrors.conflict("QUESTION_ALREADY_ANSWERED");
          await tx.providerRun.create({ data: { invocationId: invocation.id, runId } });
          await tx.invocationAnswer.create({
            data: {
              invocationId: invocation.id,
              questionId: body.questionId,
              runId,
              buyerId: request.account!.id,
              clientRequestId: body.clientRequestId,
              arguments: json(body.arguments),
            },
          });
          const queued = await tx.invocation.updateMany({
            where: { id: invocation.id, executionStatus: "WAITING_BUYER" },
            data: { executionStatus: "QUEUED", runId },
          });
          if (!queued.count) throw app.httpErrors.conflict("QUESTION_NOT_OPEN");
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
          throw app.httpErrors.conflict("QUESTION_ALREADY_ANSWERED");
        throw error;
      }
      const answer = await db.invocationAnswer.findUniqueOrThrow({
        where: {
          invocationId_clientRequestId: {
            invocationId: invocation.id,
            clientRequestId: body.clientRequestId,
          },
        },
      });
      return reply.code(202).send({
        questionId: body.questionId,
        answerId: answer.id,
        runId,
        executionStatus: "QUEUED",
      });
    },
  );

  // An in-scope revision reuses the delivered invocation and hold. The snapshot
  // terms decide whether the revision is allowed at all.
  app.post<{ Params: { id: string }; Body: { reason: string; clientRequestId: string } }>(
    "/v1/invocations/:id/revisions",
    { preHandler: app.requireAccount, bodyLimit: 8192 },
    async (request, reply) => {
      const body = request.body;
      if (
        !object(body) ||
        typeof body.reason !== "string" ||
        body.reason.trim().length < 1 ||
        body.reason.length > 2000 ||
        !identifier(body.clientRequestId)
      )
        throw app.httpErrors.badRequest("INVALID_REVISION");
      const invocation = await db.invocation.findFirst({
        where: { id: request.params.id, buyerId: request.account!.id },
        include: { quote: true, settlement: true },
      });
      if (!invocation) throw app.httpErrors.notFound("INVOCATION_NOT_FOUND");
      const replay = await db.invocationRevision.findUnique({
        where: {
          invocationId_clientRequestId: {
            invocationId: invocation.id,
            clientRequestId: body.clientRequestId,
          },
        },
      });
      if (replay) {
        if (replay.reason !== body.reason)
          throw app.httpErrors.conflict("REVISION_IDEMPOTENCY_CONFLICT");
        return reply.code(202).send({
          revisionId: replay.id,
          runId: replay.runId,
          executionStatus: invocation.executionStatus,
        });
      }
      if (invocation.executionStatus !== "DELIVERED")
        throw app.httpErrors.conflict("REVISION_NOT_AVAILABLE");
      const document = invocation.quote.document as Record<string, unknown>;
      const terms = object(document.termsSnapshot) ? document.termsSnapshot.definition : undefined;
      const policy = revisionPolicy(terms);
      if (!policy || policy.maxIncluded === 0)
        throw app.httpErrors.conflict("REVISION_NOT_ALLOWED");
      if (invocation.settlement?.state !== "HELD") throw app.httpErrors.conflict("HOLD_CLOSED");
      const used = await db.invocationRevision.count({ where: { invocationId: invocation.id } });
      if (used >= policy.maxIncluded) throw app.httpErrors.conflict("NEW_INVOCATION_REQUIRED");
      const latest = await db.paymentDeliveryEvidence.findFirst({
        where: { invocationId: invocation.id },
        orderBy: { artifactVersion: "desc" },
        select: { artifactVersion: true },
      });
      const runId = randomUUID();
      try {
        const created = await db.$transaction(async (tx) => {
          const revision = await tx.invocationRevision.create({
            data: {
              invocationId: invocation.id,
              runId,
              buyerId: request.account!.id,
              clientRequestId: body.clientRequestId,
              reason: body.reason.trim(),
              targetArtifactVersion: latest?.artifactVersion ?? null,
            },
          });
          await tx.providerRun.create({ data: { invocationId: invocation.id, runId } });
          const queued = await tx.invocation.updateMany({
            where: { id: invocation.id, executionStatus: "DELIVERED" },
            data: { executionStatus: "QUEUED", runId },
          });
          if (!queued.count) throw app.httpErrors.conflict("REVISION_NOT_AVAILABLE");
          return revision;
        });
        return reply.code(202).send({ revisionId: created.id, runId, executionStatus: "QUEUED" });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
          throw app.httpErrors.conflict("REVISION_ALREADY_REQUESTED");
        throw error;
      }
    },
  );

  app.get<{ Params: { threadId: string } }>(
    "/v1/threads/:threadId/ag-ui/snapshot",
    { preHandler: app.requireAccount },
    async (request) => {
      await own(request);
      // Fence the snapshot at a single high-water cursor. New events after the
      // fence are picked up by the SSE subscriber, never lost between requests.
      const fence =
        (
          await db.aguiStreamEvent.aggregate({
            where: { threadId: request.params.threadId },
            _max: { cursor: true },
          })
        )._max.cursor ?? 0n;
      const rows: { cursor: bigint; invocationId: string; event: Prisma.JsonValue }[] = [];
      let last = 0n;
      for (;;) {
        const batch = await db.aguiStreamEvent.findMany({
          where: { threadId: request.params.threadId, cursor: { gt: last, lte: fence } },
          orderBy: { cursor: "asc" },
          take: 1000,
          select: { cursor: true, invocationId: true, event: true },
        });
        if (!batch.length) break;
        rows.push(...batch);
        if (rows.length > 100000) throw app.httpErrors.payloadTooLarge("THREAD_HISTORY_TOO_LARGE");
        last = batch.at(-1)!.cursor;
      }
      const texts = new Map<
        string,
        { messageId: string; invocationId: string; content: string; complete: boolean }
      >();
      const surfaces = new Map<string, unknown>();
      for (const { event, invocationId } of rows) {
        if (!object(event)) continue;
        const id = event.messageId as string;
        if (typeof id !== "string") continue;
        if (event.type === "TEXT_MESSAGE_START")
          texts.set(id, { messageId: id, invocationId, content: "", complete: false });
        if (event.type === "TEXT_MESSAGE_CONTENT" && texts.has(id))
          texts.get(id)!.content += event.delta;
        if (event.type === "TEXT_MESSAGE_END" && texts.has(id)) texts.get(id)!.complete = true;
        if (event.type === "ACTIVITY_SNAPSHOT" && event.activityType === "openui-surface")
          surfaces.set(id, event.content);
      }
      const invocations = await db.invocation.findMany({
        where: { quote: { threadId: request.params.threadId } },
        select: { id: true, executionStatus: true, run: { select: { result: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
      const quotes = await db.quote.findMany({
        where: { threadId: request.params.threadId },
        include: { invocation: { include: { settlement: true } } },
        orderBy: { createdAt: "asc" },
        take: 100,
      });
      const prompts = quotes.map((q) => {
        const snapshot = (q.document as Record<string, unknown>).inputSnapshot as Record<
          string,
          unknown
        >;
        const args = snapshot.arguments as Record<string, unknown>;
        const values = Object.values(args);
        return {
          quoteId: q.id,
          invocationId: q.invocationId,
          text:
            values.length === 1 && typeof values[0] === "string" ? values[0] : JSON.stringify(args),
          paid: q.invocation?.settlement?.state === "HELD",
        };
      });
      const [questions, answers, revisions] = await Promise.all([
        db.invocationQuestion.findMany({
          where: { invocation: { quote: { threadId: request.params.threadId } } },
          orderBy: { createdAt: "asc" },
          take: 100,
        }),
        db.invocationAnswer.findMany({
          where: { invocation: { quote: { threadId: request.params.threadId } } },
          orderBy: { createdAt: "asc" },
          take: 100,
        }),
        db.invocationRevision.findMany({
          where: { invocation: { quote: { threadId: request.params.threadId } } },
          orderBy: { createdAt: "asc" },
          take: 100,
        }),
      ]);
      return {
        cursor: fence.toString(),
        messages: [...texts.values()],
        surfaces: [...surfaces].map(([messageId, content]) => ({ messageId, content })),
        invocations: invocations.map((i) => ({
          id: i.id,
          executionStatus: i.executionStatus,
          output:
            i.executionStatus === "DELIVERED" && object(i.run?.result) ? i.run.result.output : null,
        })),
        prompts,
        questions: questions.map((q) => ({
          id: q.id,
          invocationId: q.invocationId,
          questionId: q.questionId,
          prompt: q.prompt,
          inputSchema: q.inputSchema,
          chatTextParameter: q.chatTextParameter,
          status: q.status,
          createdAt: q.createdAt,
          answeredAt: q.answeredAt,
        })),
        answers: answers.map((a) => ({
          questionId: a.questionId,
          invocationId: a.invocationId,
          arguments: a.arguments,
          createdAt: a.createdAt,
        })),
        revisions: revisions.map((r) => ({
          id: r.id,
          invocationId: r.invocationId,
          reason: r.reason,
          status: r.status,
          createdAt: r.createdAt,
        })),
      };
    },
  );
  app.get<{ Params: { threadId: string }; Querystring: { after?: string; once?: string } }>(
    "/v1/threads/:threadId/ag-ui/events",
    { preHandler: app.requireAccount },
    async (request, reply) => {
      await own(request);
      // Native EventSource reconnects with Last-Event-ID even when the original
      // bootstrap URL still contains an older ?after= cursor.
      const raw = request.headers["last-event-id"] ?? request.query.after ?? "0";
      if (typeof raw !== "string" || !/^[0-9]{1,20}$/.test(raw))
        throw app.httpErrors.badRequest("INVALID_CURSOR");
      const after = BigInt(raw);
      // If the requested point is older than the retention window, replay cannot
      // be complete. The client must load the snapshot and resume from its cursor.
      const oldest = await db.aguiStreamEvent.findFirst({
        where: {
          threadId: request.params.threadId,
          createdAt: { gte: new Date(Date.now() - retentionSeconds * 1000) },
        },
        orderBy: { cursor: "asc" },
        select: { cursor: true },
      });
      if (after > 0n && oldest && after < oldest.cursor - 1n)
        throw app.httpErrors.conflict("CURSOR_EXPIRED");
      return sse(
        request,
        reply,
        async (cursor) =>
          db.aguiStreamEvent
            .findMany({
              where: { threadId: request.params.threadId, cursor: { gt: cursor } },
              orderBy: { cursor: "asc" },
              take: 100,
            })
            .then((r) => r.map((x) => ({ cursor: x.cursor, event: x.event }))),
        after,
        request.query.once === "1",
      );
    },
  );
}
