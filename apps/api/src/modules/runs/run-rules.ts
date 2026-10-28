import type { InvocationExecutionStatus } from "#core/db";
import { BadRequestError, ConflictError } from "../../errors";
import { parseToolCall, type ToolCall } from "../tools/builtin";
import { identifier, object } from "./protocol";

export const REPORT_TYPES = ["started", "progress", "tool_call", "result", "failed"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const validSequence = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 1_000_000;

// Run states each report type may be applied in.
const allowedFrom: Record<ReportType, string[]> = {
  started: ["QUEUED"],
  progress: ["RUNNING", "WAITING_BUYER"],
  tool_call: ["RUNNING"],
  result: ["RUNNING"],
  failed: ["RUNNING", "WAITING_BUYER"],
};

export function assertReportAllowed(
  type: ReportType,
  run: { state: string; activeMessageId: string | null },
) {
  if (!allowedFrom[type].includes(run.state))
    throw new ConflictError(type === "started" ? "RUN_ALREADY_STARTED" : "RUN_NOT_RUNNING");
  // A tool call, result or failure ends the turn: no text message may be open.
  if (["tool_call", "result", "failed"].includes(type) && run.activeMessageId)
    throw new ConflictError("MESSAGE_NOT_CLOSED");
}

// Run and execution states share names for every report except progress.
const nextRunState: Record<ReportType, InvocationExecutionStatus> = {
  started: "RUNNING",
  progress: "RUNNING",
  tool_call: "WAITING_BUYER",
  result: "VERIFYING",
  failed: "FAILED",
};

export const runStateAfter = (type: ReportType) => nextRunState[type];

// Progress leaves the invocation's execution status untouched.
export const executionStatusAfter = (type: ReportType, current: InvocationExecutionStatus) =>
  type === "progress" ? current : nextRunState[type];

export type RunToolCall = ToolCall & { toolCallId: string };
export type ProgressStep = {
  stepId: string;
  label: string;
  status: "running" | "done" | "failed";
  detail?: string;
};

// AG-UI events a report appends to the buyer's thread stream. A tool call
// carries the public id the buyer answers, not the provider's own id.
export function reportEvents(
  type: ReportType,
  data: unknown,
  ids: { threadId: string; runId: string },
  extra: { step?: ProgressStep; toolCall?: RunToolCall & { id: string } },
): Record<string, unknown>[] {
  const finished = { type: "RUN_FINISHED", threadId: ids.threadId, runId: ids.runId };
  switch (type) {
    case "started":
      return [{ type: "RUN_STARTED", threadId: ids.threadId, runId: ids.runId }];
    case "progress":
      return [
        {
          type: "ACTIVITY_SNAPSHOT",
          messageId: `progress-${ids.runId}-${extra.step!.stepId}`,
          activityType: "payvoke.progress",
          content: extra.step,
          replace: true,
        },
      ];
    case "tool_call": {
      const { id, name, args } = extra.toolCall!;
      return [
        { type: "CUSTOM", name: "payvoke.tool_call", value: { toolCallId: id, name, args } },
        finished,
      ];
    }
    case "result":
      return [finished];
    case "failed":
      return [{ type: "RUN_ERROR", message: "Provider run failed" }];
  }
}

// One step of the run's visible plan; a later report with the same stepId
// replaces it.
export function parseProgress(value: unknown): ProgressStep {
  const fail = () => new BadRequestError("INVALID_PROGRESS");
  if (!object(value)) throw fail();
  const { stepId, label, status = "running", detail } = value;
  if (
    !identifier(stepId) ||
    typeof label !== "string" ||
    !label.trim() ||
    label.length > 120 ||
    !["running", "done", "failed"].includes(status as string) ||
    (detail !== undefined && (typeof detail !== "string" || detail.length > 500)) ||
    Object.keys(value).some((key) => !["stepId", "label", "status", "detail"].includes(key))
  )
    throw fail();
  return {
    stepId,
    label: label.trim(),
    status: status as ProgressStep["status"],
    ...(typeof detail === "string" && detail.trim() ? { detail: detail.trim() } : {}),
  };
}

// `{ toolCallId, name, args }`: a built-in tool the buyer must answer before
// the next run starts.
export function parseRunToolCall(value: unknown): RunToolCall {
  if (!object(value) || !identifier(value.toolCallId))
    throw new BadRequestError("INVALID_TOOL_CALL");
  return { toolCallId: value.toolCallId, ...parseToolCall({ name: value.name, args: value.args }) };
}

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
