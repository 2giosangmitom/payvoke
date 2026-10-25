import Ajv2020 from "ajv/dist/2020.js";
import type { InvocationExecutionStatus } from "@payvoke/db";
import { BadRequestError, ConflictError } from "../../errors";
import { identifier, object } from "./protocol";

export const REPORT_TYPES = ["started", "progress", "question", "result", "failed"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const validSequence = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 1_000_000;

// Run states each report type may be applied in.
const allowedFrom: Record<ReportType, string[]> = {
  started: ["QUEUED"],
  progress: ["RUNNING", "WAITING_BUYER"],
  question: ["RUNNING"],
  result: ["RUNNING"],
  failed: ["RUNNING", "WAITING_BUYER"],
};

export function assertReportAllowed(
  type: ReportType,
  run: { state: string; activeMessageId: string | null },
) {
  if (!allowedFrom[type].includes(run.state))
    throw new ConflictError(type === "started" ? "RUN_ALREADY_STARTED" : "RUN_NOT_RUNNING");
  // A question, result or failure ends the turn: no text message may be open.
  if (["question", "result", "failed"].includes(type) && run.activeMessageId)
    throw new ConflictError("MESSAGE_NOT_CLOSED");
}

// Run and execution states share names for every report except progress.
const nextRunState: Record<ReportType, InvocationExecutionStatus> = {
  started: "RUNNING",
  progress: "RUNNING",
  question: "WAITING_BUYER",
  result: "VERIFYING",
  failed: "FAILED",
};

export const runStateAfter = (type: ReportType) => nextRunState[type];

// Progress leaves the invocation's execution status untouched.
export const executionStatusAfter = (type: ReportType, current: InvocationExecutionStatus) =>
  type === "progress" ? current : nextRunState[type];

// AG-UI events a report appends to the buyer's thread stream.
export function reportEvents(
  type: ReportType,
  data: unknown,
  ids: { threadId: string; runId: string },
  question: unknown,
): Record<string, unknown>[] {
  const finished = { type: "RUN_FINISHED", threadId: ids.threadId, runId: ids.runId };
  switch (type) {
    case "started":
      return [{ type: "RUN_STARTED", threadId: ids.threadId, runId: ids.runId }];
    case "progress":
      return [
        {
          type: "ACTIVITY_SNAPSHOT",
          messageId: `progress-${ids.runId}`,
          activityType: "payvoke.progress",
          content: data ?? {},
          replace: true,
        },
      ];
    case "question":
      return [{ type: "CUSTOM", name: "payvoke.question", value: question }, finished];
    case "result":
      return [finished];
    case "failed":
      return [{ type: "RUN_ERROR", message: "Provider run failed" }];
  }
}

// OpenUI ingress is a display-only projection. Question metadata is validated
// separately because it becomes the schema for a buyer answer.
export function parseQuestion(value: unknown) {
  if (!object(value)) throw new BadRequestError("INVALID_QUESTION");
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
    throw new BadRequestError("INVALID_QUESTION");
  try {
    new Ajv2020({ strict: true }).compile(inputSchema);
  } catch {
    throw new BadRequestError("INVALID_QUESTION_SCHEMA");
  }
  return {
    questionId,
    prompt,
    inputSchema,
    chatTextParameter: chatTextParameter as string | undefined,
  };
}
export type Question = ReturnType<typeof parseQuestion>;

// The signed terms decide how many in-scope revisions a delivery includes.
export function revisionPolicy(terms: unknown) {
  if (!object(terms) || !object(terms.revisionPolicy)) return null;
  const { maxIncluded, description } = terms.revisionPolicy;
  if (!Number.isSafeInteger(maxIncluded) || (maxIncluded as number) < 0) return null;
  return {
    maxIncluded: maxIncluded as number,
    description: typeof description === "string" ? description.slice(0, 1000) : "",
  };
}
