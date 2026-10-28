import { call, callAs, client, type Body } from "@/src/lib/api/client";

const threads = client.v1.threads;
const invocations = client.v1.invocations;

// Commands, threads, messages and offers as the API serializes them.
export type ThreadSummary = Body<typeof threads.$get>["items"][number];
export type ThreadDetail = Body<(typeof threads)[":threadId"]["$get"]>;
export type ThreadApp = ThreadDetail["app"];
export type ThreadCommand = ThreadDetail["commands"][number];
export type CommandRevision = NonNullable<ThreadCommand["revision"]>;
export type CommandOption = CommandRevision["options"][number];
export type CommandOptionType = CommandOption["type"];
export type RevisionPolicy = CommandRevision["terms"]["revisionPolicy"];

// AG-UI projections: the API stores and replays these as JSON events, so
// their shapes are declared here rather than inferred.
export type FileManifest = {
  fileId: string;
  name: string;
  contentType: string;
  size: number;
  sha256: string;
};
export type ConversationMessage = {
  id: string;
  seq: number;
  role: "BUYER" | "PROVIDER";
  content: string;
  commandId: string | null;
  arguments: Record<string, unknown> | null;
  files: FileManifest[];
  // A bot message may ask for a form; the buyer's answer points back to it.
  form: MessageForm | null;
  replyToId: string | null;
  createdAt: string;
};
export type MessageForm = { title: string; description?: string; schema: unknown };
export type OfferStatus = "OPEN" | "ACCEPTED" | "DECLINED" | "WITHDRAWN" | "SUPERSEDED" | "EXPIRED";
export type Offer = {
  id: string;
  threadId: string;
  commandRevisionId: string;
  arguments: Record<string, unknown>;
  grossAmount: string;
  deliverySeconds: number;
  summary: string;
  messageSeq: number;
  status: OfferStatus;
  expiresAt: string;
  quoteId: string | null;
  createdAt: string;
};
// Whole OpenUI Lang program for one surface; each snapshot replaces the last.
export type OpenUISurfaceContent = { source: string; invocationId?: string; surfaceId?: string };
export type AguiEvent = {
  type: string;
  messageId?: string;
  role?: string;
  delta?: string;
  activityType?: string;
  content?: OpenUISurfaceContent;
  message?: string;
};
export type ChatQuestion = {
  id: string;
  invocationId: string;
  questionId: string;
  prompt: string;
  inputSchema: unknown;
  chatTextParameter: string | null;
  status: string;
  createdAt: string;
  answeredAt: string | null;
};
export type ChatAnswer = {
  questionId: string;
  invocationId: string;
  arguments: Record<string, unknown>;
  createdAt: string;
};
export type ChatRevision = {
  id: string;
  invocationId: string;
  reason: string;
  status: string;
  createdAt: string;
};
export type ChatSnapshot = {
  cursor: string;
  messages: { messageId: string; invocationId: string; content: string; complete: boolean }[];
  surfaces: { messageId: string; content: OpenUISurfaceContent }[];
  invocations: {
    id: string;
    executionStatus: string;
    output: unknown | null;
    files: { fileId: string; name: string; contentType: string; size: number }[];
  }[];
  prompts: { quoteId: string; invocationId: string; text: string; paid: boolean }[];
  questions: ChatQuestion[];
  answers: ChatAnswer[];
  revisions: ChatRevision[];
  conversation: ConversationMessage[];
  offers: Offer[];
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
// The snapshot replays stored AG-UI JSON events, which the API leaves untyped.
export const getSnapshot = (threadId: string) =>
  callAs<ChatSnapshot>(threads[":threadId"]["ag-ui"].snapshot.$get({ param: { threadId } }));
// Live AG-UI events for a native EventSource, resumed from `after`.
export const threadEventsUrl = (threadId: string, after: string) =>
  threads[":threadId"]["ag-ui"].events.$url({ param: { threadId }, query: { after } }).href;

export const answerQuestion = (
  invocationId: string,
  questionId: string,
  values: Record<string, unknown>,
  clientRequestId: string,
) =>
  call(
    invocations[":id"].answers.$post(
      {
        param: { id: invocationId },
        json: { questionId, arguments: values, clientRequestId },
      },
      { headers: { "idempotency-key": clientRequestId } },
    ),
  );
export const requestRevision = (invocationId: string, reason: string, clientRequestId: string) =>
  call(
    invocations[":id"].revisions.$post(
      { param: { id: invocationId }, json: { reason, clientRequestId } },
      { headers: { "idempotency-key": clientRequestId } },
    ),
  );

// Free interaction with the app's bot: a message, a slash command with its
// arguments, or the answer to a bot form.
export const sendMessage = async (
  threadId: string,
  body: {
    content: string;
    commandId?: string;
    replyToId?: string;
    arguments?: Record<string, unknown>;
    fileIds?: string[];
  },
  clientRequestId = crypto.randomUUID(),
) =>
  (await call(
    threads[":threadId"].messages.$post({
      param: { threadId },
      json: { ...body, clientRequestId },
    }),
  )) as ConversationMessage;
export const declineOffer = async (threadId: string, offerId: string) =>
  (await call(
    threads[":threadId"].offers[":offerId"].declines.$post({ param: { threadId, offerId } }),
  )) as Offer;
