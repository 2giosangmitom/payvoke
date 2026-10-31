import { createContext, useContext } from "react";
import type {
  AttachmentAdapter,
  CompleteAttachment,
  PendingAttachment,
  ThreadMessageLike,
} from "@assistant-ui/react";
import type {
  ThreadDetail,
  TimelineFilePart,
  TimelineMessage,
  TimelineRun,
  TimelineToolPart,
} from "@/src/features/chat/api";
import { ACCEPTED_FILE_TYPES, uploadThreadFile, type ThreadFile } from "@/src/features/chat/files";
import type { UploadFile } from "@/src/features/chat/schema-form";

// Which projection a message came from: free chat is plain text, run output
// is markdown, offers are their own card.
export type MessageKind = "conversation" | "offer" | "run" | "pending";

const status = (message: TimelineMessage): ThreadMessageLike["status"] => {
  switch (message.status) {
    case "running":
      return { type: "running" };
    case "requires-action":
      return { type: "requires-action", reason: "tool-calls" };
    case "incomplete":
      return { type: "incomplete", reason: "other" };
    default:
      return { type: "complete", reason: "stop" };
  }
};

const isStep = (part: TimelineMessage["parts"][number]) =>
  part.type === "tool-call" && part.toolName === "progress";

// A buyer's slash command: the chip shows the command and its arguments, so
// the typed "/command ..." text under it would only repeat them.
const isCommand = (part: TimelineMessage["parts"][number]) =>
  part.type === "tool-call" && part.toolName === "command";

// Timeline message to assistant-ui's message shape. Tool calls keep their
// API status and result; the tool UIs read both from context by id.
export function toThreadMessage(message: TimelineMessage): ThreadMessageLike {
  const kind: MessageKind = message.id.startsWith("local-")
    ? "pending"
    : message.run
      ? "run"
      : message.id.startsWith("offer-")
        ? "offer"
        : "conversation";
  return {
    id: message.id,
    role: message.role,
    createdAt: new Date(message.createdAt),
    ...(message.role === "assistant" ? { status: status(message) } : {}),
    // A run's steps read as one plan above what it produced.
    content: (kind === "run"
      ? [
          ...message.parts.filter((part) => isStep(part)),
          ...message.parts.filter((part) => !isStep(part)),
        ]
      : message.role === "user" && message.parts.some(isCommand)
        ? message.parts.filter(
            (part) => !(part.type === "text" && part.text.trim().startsWith("/")),
          )
        : message.parts
    ).map((part) => {
      switch (part.type) {
        case "text":
          return { type: "text" as const, id: part.id, text: part.text };
        case "file":
          return {
            type: "file" as const,
            id: part.id,
            data: part.fileId,
            sourceType: "id" as const,
            mimeType: part.contentType,
            filename: part.name,
          };
        default:
          // assistant-ui rejects tool calls in user messages: a buyer's
          // slash command travels as a data part instead.
          if (message.role === "user")
            return {
              type: "data" as const,
              id: part.toolCallId,
              name: part.toolName,
              data: part.args ?? {},
            };
          return {
            type: "tool-call" as const,
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            args: (part.args ?? {}) as Record<string, never>,
            ...(part.result !== null ? { result: part.result } : {}),
          };
      }
    }),
    metadata: { custom: { kind } },
  };
}

// Uploads start as soon as a file is added, so sending only waits for the
// slowest one. A failed upload stays in the composer as an error tile.
export class ThreadAttachmentAdapter implements AttachmentAdapter {
  accept = ACCEPTED_FILE_TYPES.join(",");
  private readonly uploads = new Map<string, Promise<ThreadFile>>();

  constructor(private readonly threadId: string) {}

  async *add({ file }: { file: File }): AsyncGenerator<PendingAttachment, void> {
    const base = {
      id: crypto.randomUUID(),
      type: file.type.startsWith("image/") ? "image" : "file",
      name: file.name,
      contentType: file.type,
      file,
    };
    const upload = uploadThreadFile(this.threadId, file);
    this.uploads.set(base.id, upload);
    yield { ...base, status: { type: "running", reason: "uploading", progress: 0 } };
    try {
      await upload;
      yield { ...base, status: { type: "requires-action", reason: "composer-send" } };
    } catch (cause) {
      yield {
        ...base,
        status: {
          type: "incomplete",
          reason: "error",
          message: cause instanceof Error ? cause.message : "Upload failed.",
        },
      };
    }
  }

  async remove(attachment: { id: string }) {
    this.uploads.delete(attachment.id);
  }

  async send(attachment: PendingAttachment): Promise<CompleteAttachment> {
    const upload = this.uploads.get(attachment.id);
    if (!upload) throw new Error("Upload not found.");
    const file = await upload;
    return {
      ...attachment,
      status: { type: "complete" },
      content: [
        {
          type: "file",
          data: file.id,
          sourceType: "id",
          mimeType: attachment.contentType ?? file.contentType,
          filename: attachment.name,
        },
      ],
    };
  }
}

export type ThreadChatValue = {
  threadId: string;
  thread: ThreadDetail | undefined;
  appName: string;
  appImageUrl: string | null;
  tools: Map<string, TimelineToolPart>;
  files: Map<string, TimelineFilePart>;
  runs: Map<string, TimelineRun>;
  // Sends the one result to a tool call (or declines an offer).
  submitTool: (toolCallId: string, result: Record<string, unknown>) => Promise<void>;
  acceptOffer: (offerId: string) => Promise<void>;
  uploadFile: UploadFile;
  refresh: () => Promise<void>;
};

export const ThreadChatContext = createContext<ThreadChatValue | null>(null);

export function useThreadChat() {
  const value = useContext(ThreadChatContext);
  if (!value) throw new Error("useThreadChat outside ThreadChat");
  return value;
}
