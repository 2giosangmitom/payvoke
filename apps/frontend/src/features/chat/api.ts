import { call, client, type Body } from "@/src/lib/api/client";

const threads = client.v1.threads;
const invocations = client.v1.invocations;

// Commands, threads and the projected timeline as the API serializes them.
export type ThreadSummary = Body<typeof threads.$get>["items"][number];
export type ThreadDetail = Body<(typeof threads)[":threadId"]["$get"]>;
export type ThreadApp = ThreadDetail["app"];
export type ThreadCommand = ThreadDetail["commands"][number];
export type CommandRevision = NonNullable<ThreadCommand["revision"]>;
export type CommandOption = CommandRevision["options"][number];
export type CommandOptionType = CommandOption["type"];
export type RevisionPolicy = CommandRevision["terms"]["revisionPolicy"];

export type Timeline = Body<(typeof threads)[":threadId"]["timeline"]["$get"]>;
export type TimelineMessage = Timeline["messages"][number];
export type TimelinePart = TimelineMessage["parts"][number];
export type TimelineToolPart = Extract<TimelinePart, { type: "tool-call" }>;
export type TimelineFilePart = Extract<TimelinePart, { type: "file" }>;
export type TimelineRun = NonNullable<TimelineMessage["run"]>;
export type RunPhase = TimelineRun["phase"];
// A text token streamed after the last timeline, addressed to one part.
export type TimelineDelta = { messageId: string; partId: string; delta: string };

// Built-in tool arguments, as the API normalizes them.
export type AskFormArgs = {
  title: string;
  description?: string;
  schema: unknown;
  submitLabel?: string;
};
export type AskChoiceArgs = {
  prompt: string;
  options: { id: string; label: string; description?: string }[];
  multiple: boolean;
  minSelections: number;
  maxSelections: number;
};
export type ConfirmArgs = {
  title: string;
  description?: string;
  details: { label: string; value: string }[];
  confirmLabel?: string;
  cancelLabel?: string;
  variant: "default" | "destructive";
};
export type OfferArgs = {
  offerId: string;
  summary: string;
  grossAmount: string;
  deliverySeconds: number;
  expiresAt: string;
  commandRevisionId: string;
  command: { id: string; name: string };
  arguments: Record<string, unknown>;
};
export type ProgressArgs = {
  stepId: string;
  label: string;
  status: "running" | "done" | "failed";
  detail?: string;
};

export const getThreads = (q?: string) =>
  call(threads.$get({ query: q?.trim() ? { q: q.trim() } : {} }));
export const newThread = (appId: string, clientRequestId = crypto.randomUUID()) =>
  call(threads.$post({ json: { appId, clientRequestId } }));
export const getThread = (threadId: string) =>
  call(threads[":threadId"].$get({ param: { threadId } }));
export const renameThread = (threadId: string, title: string) =>
  call(threads[":threadId"].$patch({ param: { threadId }, json: { title } }));
export const archiveThread = (threadId: string) =>
  call(threads[":threadId"].archive.$post({ param: { threadId } }));
export const getTimeline = (threadId: string) =>
  call(threads[":threadId"].timeline.$get({ param: { threadId } }));
// Live `timeline` and `delta` events for a native EventSource.
export const threadEventsUrl = (threadId: string) =>
  threads[":threadId"].events.$url({ param: { threadId }, query: {} }).href;

// Free interaction with the app's bot: a message or a slash command with its
// arguments, with files attached as metadata.
export const sendMessage = (
  threadId: string,
  body: {
    content: string;
    commandId?: string;
    arguments?: Record<string, unknown>;
    fileIds?: string[];
  },
  clientRequestId = crypto.randomUUID(),
) =>
  call(
    threads[":threadId"].messages.$post({
      param: { threadId },
      json: { ...body, clientRequestId },
    }),
  );

// The one result to a tool the bot opened, or `{ accepted: false }` for an offer.
export const submitToolResult = (
  threadId: string,
  toolCallId: string,
  result: Record<string, unknown>,
  clientRequestId = crypto.randomUUID(),
) =>
  call(
    threads[":threadId"]["tool-results"].$post({
      param: { threadId },
      json: { toolCallId, result, clientRequestId },
    }),
  );

export const requestRevision = (invocationId: string, reason: string, clientRequestId: string) =>
  call(
    invocations[":id"].revisions.$post(
      { param: { id: invocationId }, json: { reason, clientRequestId } },
      { headers: { "idempotency-key": clientRequestId } },
    ),
  );
