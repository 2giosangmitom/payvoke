import Ajv2020 from "ajv/dist/2020.js";
import { randomUUID } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import type { Cradle } from "../../container";
import type { Prisma } from "#core/db";
import { channels } from "#core/queue";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  PayloadTooLargeError,
  UnsupportedMediaTypeError,
} from "../../errors";
import { applyOpenUIPatch } from "../openui/validator";
import { hash, object, validateEvent } from "./protocol";
import {
  REPORT_TYPES,
  assertReportAllowed,
  executionStatusAfter,
  parseProgress,
  parseRunToolCall,
  reportEvents,
  runStateAfter,
  validSequence,
  type ReportType,
} from "./run-rules";

type StreamItem = { sequence: number; event: Record<string, unknown>; digest: string };
export type ReportBody = { reportId: string; sequence: number; type: string; data?: unknown };
export type Work = Awaited<ReturnType<ProviderRunService["work"]>>;

const json = (value: unknown) => value as Prisma.InputJsonValue;
const STREAM_BYTES = 524288;
const LINE_BYTES = 16384;
// Text results are rendered as markdown in the thread.
const MAX_TEXT_OUTPUT = 65536;

// Provider side of a paid run: the durable work feed, ACKs, sequenced reports
// and the NDJSON AG-UI stream. Callers authenticate the app key first.
export class ProviderRunService {
  private readonly db: Cradle["db"];
  private readonly doorbell: Cradle["doorbell"];
  private readonly jobs: Cradle["jobs"];
  private readonly files: Cradle["fileService"];
  private readonly presale: Cradle["presaleService"];

  constructor({ db, doorbell, jobs, fileService, presaleService }: Cradle) {
    this.db = db;
    this.doorbell = doorbell;
    this.jobs = jobs;
    this.files = fileService;
    this.presale = presaleService;
  }

  async heartbeat(appId: string) {
    await this.db.app
      .updateMany({ where: { id: appId }, data: { lastHeartbeatAt: new Date() } })
      .catch(() => undefined);
  }

  // A held, ready invocation of this app.
  async work(appId: string, invocationId: string) {
    const invocation = await this.db.invocation.findUnique({
      where: { id: invocationId },
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
      throw new NotFoundError("INVOCATION_NOT_READY");
    return invocation;
  }

  // Continuations are durable queue items too. The provider re-reads them until
  // ACK; each one carries the Payvoke-issued runId for the next cycle. Pre-sale
  // messages are ACKed per message and carry no run.
  async feed(appId: string) {
    const pending = {
      acknowledgedAt: null,
      invocation: { settlement: { state: "HELD" as const }, quote: { appId } },
    };
    const query = {
      where: pending,
      include: { invocation: { include: { quote: true } } },
      orderBy: { createdAt: "asc" as const },
      take: 50,
    };
    const [ready, results, revisions] = [
      await this.db.invocationReady.findMany(query),
      await this.db.invocationToolResult.findMany({
        ...query,
        include: { ...query.include, call: { select: { name: true } } },
      }),
      await this.db.invocationRevision.findMany(query),
    ];
    const events: { id: string; createdAt: Date; event: Record<string, unknown> }[] = [
      ...ready.map((row) => ({
        id: row.invocationId,
        createdAt: row.createdAt,
        event: {
          type: "invocation.ready",
          invocationId: row.invocationId,
          runId: row.runId,
          threadId: row.invocation.quote.threadId,
          input: (row.invocation.quote.document as Record<string, unknown>).inputSnapshot,
        },
      })),
      ...results.map((row) => ({
        id: row.id,
        createdAt: row.createdAt,
        event: {
          type: "invocation.tool_result",
          invocationId: row.invocationId,
          runId: row.runId,
          threadId: row.invocation.quote.threadId,
          resultId: row.id,
          toolCallId: row.toolCallId,
          name: row.call.name,
          result: row.result,
        },
      })),
      ...revisions.map((row) => ({
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
      })),
      // Unpaid pre-sale chat of threads with quoted commands.
      ...(await this.presale.pendingMessages(appId)),
    ];
    return events.sort(
      (left, right) =>
        left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id),
    );
  }

  // ACK claims the run named by the event (the ready event or a continuation).
  async acknowledge(invocation: Work, eventId: unknown) {
    const ready = invocation.readyEvent!;
    if (eventId !== undefined && (typeof eventId !== "string" || eventId.length > 128))
      throw new BadRequestError("INVALID_EVENT_ID");
    let runId = invocation.runId ?? ready.runId;
    if (eventId) {
      if (eventId === ready.invocationId || eventId === invocation.id) runId = ready.runId;
      else {
        const continuation =
          (await this.db.invocationToolResult.findFirst({
            where: { id: eventId, invocationId: invocation.id },
            select: { runId: true },
          })) ??
          (await this.db.invocationRevision.findFirst({
            where: { id: eventId, invocationId: invocation.id },
            select: { runId: true },
          }));
        if (!continuation) throw new NotFoundError("EVENT_NOT_FOUND");
        runId = continuation.runId;
      }
    }
    if (runId !== invocation.runId && runId !== ready.runId) throw new ConflictError("STALE_RUN");
    if (!["QUEUED", "ACKED"].includes(invocation.executionStatus)) {
      if (invocation.run?.acknowledgedAt && invocation.run.runId === runId)
        return { invocationId: invocation.id, runId, status: invocation.executionStatus };
      throw new ConflictError("RUN_NOT_QUEUEABLE");
    }
    await this.db.$transaction(async (tx) => {
      const acknowledged = { data: { acknowledgedAt: new Date() } };
      if (runId === ready.runId) {
        await tx.invocationReady.updateMany({
          where: { invocationId: invocation.id, acknowledgedAt: null },
          ...acknowledged,
        });
      } else {
        const where = { invocationId: invocation.id, runId, acknowledgedAt: null };
        await tx.invocationToolResult.updateMany({ where, ...acknowledged });
        await tx.invocationRevision.updateMany({ where, ...acknowledged });
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
  }

  // Reports are strictly sequenced per run and idempotent by content hash.
  async report(invocation: Work, body: Partial<ReportBody> | undefined) {
    const { reportId, sequence, type, data } = body ?? {};
    if (
      typeof reportId !== "string" ||
      !/^[\w-]{1,128}$/.test(reportId) ||
      !validSequence(sequence) ||
      !REPORT_TYPES.includes(type as ReportType) ||
      (data !== undefined && !object(data))
    )
      throw new BadRequestError("INVALID_REPORT");
    const kind = type as ReportType;
    const run = invocation.run;
    if (!run || !run.acknowledgedAt) throw new ConflictError("RUN_NOT_ACKED");
    const digest = hash({ reportId, sequence, type, data: data ?? null });
    // Replay the stored response before checking the current state. A finished
    // run legitimately receives the same result report again after a timeout.
    if (sequence <= run.reportSequence) {
      const prior = await this.db.providerReport.findUnique({
        where: { runId_sequence: { runId: run.runId, sequence } },
      });
      if (!prior || prior.reportId !== reportId || prior.contentHash !== digest)
        throw new ConflictError("REPORT_SEQUENCE_CONFLICT");
      return { lastCommittedSequence: run.reportSequence };
    }
    assertReportAllowed(kind, run);
    if (sequence !== run.reportSequence + 1) throw new ConflictError("REPORT_SEQUENCE_GAP");
    const step = kind === "progress" ? parseProgress(data) : undefined;
    const toolCall =
      kind === "tool_call" ? { ...parseRunToolCall(data), id: randomUUID() } : undefined;
    if (toolCall) {
      const prior = await this.db.invocationToolCall.findFirst({
        where: {
          invocationId: invocation.id,
          OR: [{ status: "OPEN" }, { toolCallId: toolCall.toolCallId }],
        },
        select: { status: true },
      });
      if (prior?.status === "OPEN") throw new ConflictError("TOOL_CALL_ALREADY_OPEN");
      if (prior) throw new ConflictError("TOOL_CALL_ID_REUSED");
    }
    const result = kind === "result" ? await this.checkResult(invocation, data) : null;
    const events = reportEvents(
      kind,
      data,
      { threadId: invocation.quote.threadId, runId: run.runId },
      { step, toolCall },
    );
    const executionStatus = executionStatusAfter(kind, invocation.executionStatus);
    await this.db.$transaction(async (tx) => {
      const updated = await tx.providerRun.updateMany({
        where: {
          runId: run.runId,
          reportSequence: sequence - 1,
          state: run.state,
          ...(kind === "failed" ? { activeMessageId: null } : {}),
        },
        data: {
          reportSequence: sequence,
          state: runStateAfter(kind),
          ...(result ? { result: json(result) } : {}),
        },
      });
      if (!updated.count) throw new ConflictError("REPORT_CONFLICT");
      await tx.providerReport.create({
        data: { runId: run.runId, sequence, reportId, contentHash: digest, type: kind },
      });
      for (const event of events) {
        await tx.aguiStreamEvent.create({
          data: {
            invocationId: invocation.id,
            threadId: invocation.quote.threadId,
            runId: run.runId,
            event: json(event),
          },
        });
      }
      if (toolCall) {
        await tx.invocationToolCall.create({
          data: {
            id: toolCall.id,
            invocationId: invocation.id,
            toolCallId: toolCall.toolCallId,
            runId: run.runId,
            name: toolCall.name,
            args: json(toolCall.args),
          },
        });
      }
      if (kind !== "progress")
        await tx.invocation.update({ where: { id: invocation.id }, data: { executionStatus } });
    });
    // Committed: wake the buyer stream, then hand off verification or refunds.
    this.doorbell.ring(channels.thread(invocation.quote.threadId));
    if (kind === "result")
      await this.jobs.verifyDelivery(
        invocation.id,
        (data as { artifactVersion: number }).artifactVersion,
      );
    if (kind === "failed") await this.jobs.wakeFinance();
    return { lastCommittedSequence: sequence, executionStatus };
  }

  // A result carries text, JSON and/or files and publishes a strictly newer
  // artifact. Its `files: [{fileId}]` must be READY artifacts of this
  // invocation; the stored result carries their frozen manifest instead.
  private async checkResult(invocation: Work, data: unknown) {
    const result = data as Record<string, unknown> | undefined;
    if (
      !result ||
      !Number.isSafeInteger(result.artifactVersion) ||
      (result.artifactVersion as number) < 1 ||
      !Array.isArray(result.files)
    )
      throw new BadRequestError("INVALID_RESULT");
    const definition = invocation.quote.commandRevisionId
      ? await this.db.appCommandRevision.findUnique({
          where: { id: invocation.quote.commandRevisionId },
        })
      : null;
    if (!definition) throw new ConflictError("COMMAND_REVISION_NOT_FOUND");
    // Output is free-form: markdown text or any JSON, alongside or instead of
    // files. Revisions registered with an output schema still enforce it.
    const output = result.output;
    if (output === undefined && !result.files.length)
      throw new BadRequestError("INVALID_RESULT_OUTPUT");
    if (typeof output === "string" && (!output.trim() || output.length > MAX_TEXT_OUTPUT))
      throw new BadRequestError("INVALID_RESULT_OUTPUT");
    if (
      definition.outputSchema &&
      !new Ajv2020({ strict: true }).compile(definition.outputSchema as object)(output)
    )
      throw new BadRequestError("INVALID_RESULT_OUTPUT");
    const latest = await this.db.paymentDeliveryEvidence.findFirst({
      where: { invocationId: invocation.id },
      orderBy: { artifactVersion: "desc" },
      select: { artifactVersion: true },
    });
    if (latest && (result.artifactVersion as number) <= latest.artifactVersion)
      throw new BadRequestError("ARTIFACT_VERSION_NOT_INCREMENTED");
    return { ...result, files: await this.files.resultFiles(invocation, result.files) };
  }

  cursor(invocation: Work, runId: string) {
    if (!invocation.run || invocation.run.runId !== runId) throw new NotFoundError("RUN_NOT_FOUND");
    return { runId: invocation.run.runId, lastCommittedSequence: invocation.run.sequence };
  }

  // `body` is null when the request is not application/x-ndjson.
  // Consumes an NDJSON body of `{ streamSequence, event }` lines. Lines are
  // committed per received chunk, not one transaction per token; a failed batch
  // rolls back, so the provider cursor always names a safe prefix.
  async ingest(invocation: Work, runId: string, body: AsyncIterable<Uint8Array> | null) {
    const run = invocation.run;
    if (!run || run.runId !== runId || run.state !== "RUNNING")
      throw new ConflictError("RUN_NOT_RUNNING");
    if (!body) throw new UnsupportedMediaTypeError("NDJSON_REQUIRED");
    const decoder = new StringDecoder("utf8");
    let buffer = "";
    let bytes = 0;
    let committed = run.sequence;
    const consume = async (lines: string[]) => {
      const items = lines.map(parseLine).filter(isItem);
      if (items.length) committed = await this.commit(invocation, run.runId, items);
    };
    for await (const chunk of body) {
      bytes += chunk.length;
      if (bytes > STREAM_BYTES) throw new PayloadTooLargeError("STREAM_TOO_LARGE");
      buffer += decoder.write(chunk);
      const lines: string[] = [];
      let position: number;
      while ((position = buffer.indexOf("\n")) !== -1) {
        lines.push(buffer.slice(0, position));
        buffer = buffer.slice(position + 1);
      }
      if (buffer.length > LINE_BYTES) throw new PayloadTooLargeError("EVENT_TOO_LARGE");
      await consume(lines);
    }
    buffer += decoder.end();
    if (buffer.trim()) await consume([buffer]);
    return { runId: run.runId, lastCommittedSequence: committed };
  }

  private async commit(invocation: Work, runId: string, items: StreamItem[]) {
    const sequence = await this.db.$transaction(async (tx) => {
      const run = await tx.providerRun.findUniqueOrThrow({ where: { runId } });
      if (run.state !== "RUNNING" || !run.acknowledgedAt)
        throw new ConflictError("RUN_NOT_RUNNING");
      let sequence = run.sequence;
      let messageId = run.activeMessageId;
      const pending = new Map<number, string>();
      const surfaces = new Map(
        (await tx.openUISurface.findMany({ where: { runId } })).map((surface) => [
          surface.surfaceId,
          surface.source,
        ]),
      );
      const touched = new Set<string>();
      const rows: Prisma.AguiStreamEventCreateManyInput[] = [];
      for (const { sequence: streamSequence, event, digest } of items) {
        if (streamSequence <= sequence) {
          // Retransmitted prefix: must match what was committed, byte for byte.
          if (pending.has(streamSequence)) {
            if (pending.get(streamSequence) !== digest)
              throw new ConflictError("STREAM_SEQUENCE_CONFLICT");
            continue;
          }
          const existing = await tx.aguiStreamEvent.findUnique({
            where: { runId_streamSequence: { runId, streamSequence } },
          });
          if (!existing || existing.sourceHash !== digest)
            throw new ConflictError("STREAM_SEQUENCE_CONFLICT");
          continue;
        }
        if (streamSequence !== sequence + 1) throw new ConflictError("STREAM_SEQUENCE_GAP");
        let projected: Record<string, unknown> = event;
        if (event.type === "TEXT_MESSAGE_START") {
          if (messageId) throw new ConflictError("MESSAGE_ALREADY_OPEN");
          messageId = event.messageId as string;
        } else if (event.type === "TEXT_MESSAGE_CONTENT" || event.type === "TEXT_MESSAGE_END") {
          if (messageId !== event.messageId) throw new ConflictError("MESSAGE_NOT_OPEN");
          if (event.type === "TEXT_MESSAGE_END") messageId = null;
        } else {
          const { surfaceId, source: patch } = event.value as Record<string, string>;
          let source: string;
          try {
            source = applyOpenUIPatch(surfaces.get(surfaceId) ?? "", patch);
          } catch (error) {
            throw new BadRequestError(error instanceof Error ? error.message : "INVALID_OPENUI");
          }
          surfaces.set(surfaceId, source);
          touched.add(surfaceId);
          // The buyer always receives the whole program, so a reconnecting
          // client can render a surface from its latest snapshot alone.
          projected = {
            type: "ACTIVITY_SNAPSHOT",
            messageId: `openui-${surfaceId}`,
            activityType: "openui-surface",
            content: { source, invocationId: invocation.id, surfaceId },
            replace: true,
          };
        }
        pending.set(streamSequence, digest);
        rows.push({
          invocationId: invocation.id,
          threadId: invocation.quote.threadId,
          runId,
          streamSequence,
          sourceHash: digest,
          // All stream data is display-only, independent of paid delivery state.
          event: json(
            projected.messageId
              ? { ...projected, messageId: `${runId}-${projected.messageId}` }
              : projected,
          ),
        });
        sequence = streamSequence;
      }
      if (rows.length) {
        for (const surfaceId of touched) {
          const source = surfaces.get(surfaceId)!;
          await tx.openUISurface.upsert({
            where: { runId_surfaceId: { runId, surfaceId } },
            create: { runId, surfaceId, source },
            update: { source },
          });
        }
        const updated = await tx.providerRun.updateMany({
          where: { runId, sequence: run.sequence, state: "RUNNING" },
          data: { sequence, activeMessageId: messageId },
        });
        if (!updated.count) throw new ConflictError("STREAM_WRITER_CONFLICT");
        await tx.aguiStreamEvent.createMany({ data: rows });
      }
      return sequence;
    });
    this.doorbell.ring(channels.thread(invocation.quote.threadId));
    return sequence;
  }
}

function parseLine(line: string): StreamItem | null {
  if (!line.trim()) return null;
  if (line.length > LINE_BYTES) throw new PayloadTooLargeError("EVENT_TOO_LARGE");
  let data: unknown;
  try {
    data = JSON.parse(line);
  } catch {
    throw new BadRequestError("INVALID_NDJSON");
  }
  if (!object(data) || !validSequence(data.streamSequence))
    throw new BadRequestError("INVALID_SEQUENCE");
  let event: Record<string, unknown>;
  try {
    event = validateEvent(data.event);
  } catch (error) {
    throw new BadRequestError(error instanceof Error ? error.message : "INVALID_EVENT");
  }
  return { sequence: data.streamSequence, event, digest: hash(event) };
}

const isItem = (item: StreamItem | null): item is StreamItem => item !== null;
