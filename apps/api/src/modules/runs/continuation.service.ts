import { randomUUID } from "node:crypto";
import type { Cradle } from "../../container";
import type { Prisma } from "#core/db";
import { latePolicy } from "#core/payments/timeliness";
import { channels } from "#core/queue";
import { BadRequestError, ConflictError, NotFoundError, isUniqueViolation } from "../../errors";
import { threadSlotReleased } from "../apps/schema";
import { parseToolResult, storedToolCall } from "../tools/builtin";
import { hash, identifier, object } from "./protocol";
import { revisionPolicy } from "./run-rules";

export type ToolResultBody = { toolCallId: string; result: unknown; clientRequestId: string };
export type RevisionBody = { reason: string; clientRequestId: string };

const json = (value: unknown) => value as Prisma.InputJsonValue;

// Buyer continuations of a paid invocation: the result to a tool the run
// opened, and an in-scope revision. Both are free and start a new
// provider run inside the same invocation and hold; both are idempotent on
// (invocation, clientRequestId).
export class ContinuationService {
  private readonly db: Cradle["db"];
  private readonly doorbell: Cradle["doorbell"];

  constructor({ db, doorbell }: Cradle) {
    this.db = db;
    this.doorbell = doorbell;
  }

  // A continuation is a new item on the provider feed and a change the buyer sees.
  private ring(quote: { appId: string; threadId: string }) {
    this.doorbell.ring(channels.app(quote.appId));
    this.doorbell.ring(channels.thread(quote.threadId));
  }

  // The result to a tool call a run opened, named by its public id. Null when
  // the id is not a run tool call of this buyer's thread. The call stored at
  // report time, never the browser, decides what a valid result is.
  async submitToolResult(buyerId: string, threadId: string, body: ToolResultBody) {
    const call = await this.db.invocationToolCall.findFirst({
      where: { id: body.toolCallId, invocation: { buyerId, quote: { threadId } } },
      include: { invocation: { include: { quote: true } } },
    });
    if (!call) return null;
    if (!identifier(body.clientRequestId)) throw new BadRequestError("INVALID_TOOL_RESULT");
    const invocation = call.invocation;
    const result = parseToolResult(
      storedToolCall({ name: call.name, args: call.args }),
      body.result,
    );
    const key = {
      invocationId_clientRequestId: {
        invocationId: invocation.id,
        clientRequestId: body.clientRequestId,
      },
    };
    const replay = await this.db.invocationToolResult.findUnique({ where: key });
    if (replay) {
      if (replay.toolCallId !== call.toolCallId || hash(replay.result) !== hash(result))
        throw new ConflictError("IDEMPOTENCY_CONFLICT");
      return {
        toolCallId: call.id,
        runId: replay.runId,
        executionStatus: invocation.executionStatus,
      };
    }
    if (call.status !== "OPEN" || invocation.executionStatus !== "WAITING_BUYER")
      throw new ConflictError("TOOL_CALL_ALREADY_ANSWERED");
    const runId = randomUUID();
    try {
      await this.db.$transaction(async (tx) => {
        const claimed = await tx.invocationToolCall.updateMany({
          where: { id: call.id, status: "OPEN" },
          data: { status: "ANSWERED", answeredAt: new Date() },
        });
        if (!claimed.count) throw new ConflictError("TOOL_CALL_ALREADY_ANSWERED");
        await tx.providerRun.create({ data: { invocationId: invocation.id, runId } });
        await tx.invocationToolResult.create({
          data: {
            invocationId: invocation.id,
            toolCallId: call.toolCallId,
            runId,
            buyerId,
            clientRequestId: body.clientRequestId,
            result: json(result),
          },
        });
        const queued = await tx.invocation.updateMany({
          where: { id: invocation.id, executionStatus: "WAITING_BUYER" },
          data: { executionStatus: "QUEUED", runId },
        });
        if (!queued.count) throw new ConflictError("TOOL_CALL_ALREADY_ANSWERED");
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError("TOOL_CALL_ALREADY_ANSWERED");
      throw error;
    }
    this.ring(invocation.quote);
    return { toolCallId: call.id, runId, executionStatus: "QUEUED" as const };
  }

  // An in-scope revision reuses the delivered invocation and hold. The snapshot
  // terms decide whether the revision is allowed at all.
  async requestRevision(buyerId: string, invocationId: string, body: RevisionBody | undefined) {
    if (
      !object(body) ||
      typeof body.reason !== "string" ||
      body.reason.trim().length < 1 ||
      body.reason.length > 2000 ||
      !identifier(body.clientRequestId)
    )
      throw new BadRequestError("INVALID_REVISION");
    const invocation = await this.db.invocation.findFirst({
      where: { id: invocationId, buyerId },
      include: { quote: true, settlement: true },
    });
    if (!invocation) throw new NotFoundError("INVOCATION_NOT_FOUND");
    const replay = await this.db.invocationRevision.findUnique({
      where: {
        invocationId_clientRequestId: {
          invocationId: invocation.id,
          clientRequestId: body.clientRequestId,
        },
      },
    });
    if (replay) {
      if (replay.reason !== body.reason) throw new ConflictError("REVISION_IDEMPOTENCY_CONFLICT");
      return {
        revisionId: replay.id,
        runId: replay.runId,
        executionStatus: invocation.executionStatus,
      };
    }
    if (invocation.executionStatus !== "DELIVERED")
      throw new ConflictError("REVISION_NOT_AVAILABLE");
    const document = invocation.quote.document as Record<string, unknown>;
    const terms = object(document.termsSnapshot) ? document.termsSnapshot.definition : undefined;
    const policy = revisionPolicy(terms);
    if (!policy || policy.maxIncluded === 0) throw new ConflictError("REVISION_NOT_ALLOWED");
    if (invocation.settlement?.state !== "HELD") throw new ConflictError("HOLD_CLOSED");
    const used = await this.db.invocationRevision.count({ where: { invocationId: invocation.id } });
    if (used >= policy.maxIncluded) throw new ConflictError("NEW_INVOCATION_REQUIRED");
    // The revision gets the command's full delivery time from now. The new
    // result's review must still end before resolveBy, or the vault could not
    // release it, so a revision that cannot fit is refused up front.
    const deliverySeconds = object(terms) ? terms.deliverySeconds : undefined;
    if (
      typeof deliverySeconds !== "number" ||
      typeof document.releaseNotBefore !== "number" ||
      typeof document.deliveryDeadline !== "number" ||
      typeof document.resolveBy !== "number"
    )
      throw new ConflictError("REVISION_NOT_ALLOWED");
    const reviewSeconds = document.releaseNotBefore - document.deliveryDeadline;
    const dueAt = new Date(Date.now() + deliverySeconds * 1000);
    // A fix may also arrive within the signed late grace and still be reviewed.
    const grace = latePolicy(terms)?.graceSeconds ?? 0;
    if (Math.ceil(dueAt.getTime() / 1000) + grace + reviewSeconds >= document.resolveBy)
      throw new ConflictError("REVISION_TOO_LATE");
    const latest = await this.db.paymentDeliveryEvidence.findFirst({
      where: { invocationId: invocation.id },
      orderBy: { artifactVersion: "desc" },
      select: { artifactVersion: true },
    });
    const runId = randomUUID();
    const threadId = invocation.quote.threadId;
    try {
      const created = await this.db.$transaction(async (tx) => {
        // Serialize with quote admission on the thread row. A revision reopens
        // this invocation, so it may only claim a slot no other invocation holds.
        const locked = await tx.chatThread.updateMany({
          where: { id: threadId },
          data: { quoteLockVersion: { increment: 1 } },
        });
        if (!locked.count) throw new NotFoundError("THREAD_NOT_FOUND");
        const thread = await tx.chatThread.findUniqueOrThrow({
          where: { id: threadId },
          select: { activeQuoteId: true },
        });
        if (thread.activeQuoteId && thread.activeQuoteId !== invocation.quoteId) {
          const active = await tx.quote.findUniqueOrThrow({
            where: { id: thread.activeQuoteId },
            include: { invocation: { include: { settlement: { include: { attempt: true } } } } },
          });
          if (!threadSlotReleased(active)) throw new ConflictError("THREAD_BUSY");
        }
        await tx.chatThread.update({
          where: { id: threadId },
          data: { activeQuoteId: invocation.quoteId },
        });
        const revision = await tx.invocationRevision.create({
          data: {
            invocationId: invocation.id,
            runId,
            buyerId,
            clientRequestId: body.clientRequestId,
            reason: body.reason.trim(),
            targetArtifactVersion: latest?.artifactVersion ?? null,
            dueAt,
          },
        });
        await tx.providerRun.create({ data: { invocationId: invocation.id, runId } });
        const queued = await tx.invocation.updateMany({
          where: { id: invocation.id, executionStatus: "DELIVERED" },
          data: { executionStatus: "QUEUED", runId },
        });
        if (!queued.count) throw new ConflictError("REVISION_NOT_AVAILABLE");
        return revision;
      });
      this.ring(invocation.quote);
      return { revisionId: created.id, runId, executionStatus: "QUEUED" };
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError("REVISION_ALREADY_REQUESTED");
      throw error;
    }
  }
}
