import Ajv2020 from "ajv/dist/2020.js";
import { randomUUID } from "node:crypto";
import type { Cradle } from "../../container";
import type { Prisma } from "#core/db";
import { channels } from "#core/queue";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  ServiceUnavailableError,
  isUniqueViolation,
} from "../../errors";
import { threadSlotReleased } from "../apps/schema";
import { hash, identifier, object } from "./protocol";
import { revisionPolicy } from "./run-rules";

export type AnswerBody = {
  questionId: string;
  arguments: Record<string, unknown>;
  clientRequestId: string;
};
export type RevisionBody = { reason: string; clientRequestId: string };

const json = (value: unknown) => value as Prisma.InputJsonValue;

// Buyer continuations of a paid invocation. Both are free and start a new
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

  // The input schema comes from the provider's question, never the browser.
  async answer(buyerId: string, invocationId: string, body: AnswerBody | undefined) {
    if (
      !object(body) ||
      !identifier(body.questionId) ||
      !identifier(body.clientRequestId) ||
      !object(body.arguments)
    )
      throw new BadRequestError("INVALID_ANSWER");
    const invocation = await this.db.invocation.findFirst({
      where: { id: invocationId, buyerId },
      include: { quote: true, run: true },
    });
    if (!invocation) throw new NotFoundError("INVOCATION_NOT_FOUND");
    const key = {
      invocationId_clientRequestId: {
        invocationId: invocation.id,
        clientRequestId: body.clientRequestId,
      },
    };
    const replay = await this.db.invocationAnswer.findUnique({ where: key });
    if (replay) {
      if (replay.questionId !== body.questionId || hash(replay.arguments) !== hash(body.arguments))
        throw new ConflictError("ANSWER_IDEMPOTENCY_CONFLICT");
      return {
        questionId: replay.questionId,
        answerId: replay.id,
        runId: replay.runId,
        executionStatus: invocation.executionStatus,
      };
    }
    if (invocation.executionStatus !== "WAITING_BUYER")
      throw new ConflictError("QUESTION_NOT_OPEN");
    const question = await this.db.invocationQuestion.findFirst({
      where: { invocationId: invocation.id, questionId: body.questionId, status: "OPEN" },
    });
    if (!question) throw new ConflictError("QUESTION_NOT_OPEN");
    let validate: ReturnType<Ajv2020["compile"]>;
    try {
      validate = new Ajv2020({ strict: true }).compile(question.inputSchema as object);
    } catch {
      throw new ServiceUnavailableError("QUESTION_SCHEMA_UNAVAILABLE");
    }
    if (!validate(body.arguments)) throw new BadRequestError("INVALID_ANSWER_ARGUMENTS");
    const runId = randomUUID();
    try {
      await this.db.$transaction(async (tx) => {
        const claimed = await tx.invocationQuestion.updateMany({
          where: { invocationId: invocation.id, questionId: body.questionId, status: "OPEN" },
          data: { status: "ANSWERED", answeredAt: new Date() },
        });
        if (!claimed.count) throw new ConflictError("QUESTION_ALREADY_ANSWERED");
        await tx.providerRun.create({ data: { invocationId: invocation.id, runId } });
        await tx.invocationAnswer.create({
          data: {
            invocationId: invocation.id,
            questionId: body.questionId,
            runId,
            buyerId,
            clientRequestId: body.clientRequestId,
            arguments: json(body.arguments),
          },
        });
        const queued = await tx.invocation.updateMany({
          where: { id: invocation.id, executionStatus: "WAITING_BUYER" },
          data: { executionStatus: "QUEUED", runId },
        });
        if (!queued.count) throw new ConflictError("QUESTION_NOT_OPEN");
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError("QUESTION_ALREADY_ANSWERED");
      throw error;
    }
    this.ring(invocation.quote);
    const answer = await this.db.invocationAnswer.findUniqueOrThrow({ where: key });
    return {
      questionId: body.questionId,
      answerId: answer.id,
      runId,
      executionStatus: "QUEUED",
    };
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
