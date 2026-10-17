import { Result, TaggedError } from "better-result";

export class WorkspaceError extends TaggedError("WorkspaceError")<{
  code: "NOT_FOUND" | "CONFLICT" | "LIMIT_REACHED" | "INVALID_INPUT";
  message: string;
}> {}

export type WorkspaceResult<T> = Result<T, WorkspaceError>;
export function failure(code: WorkspaceError["code"], message: string) {
  return Result.err(new WorkspaceError({ code, message }));
}

export type TextPart = { id: string; type: "text"; text: string };
export type ConversationMessage = {
  id: string;
  role: "user" | "assistant";
  provenance: "user-instruction" | "development-responder";
  parts: TextPart[];
};

/** Internal events deliberately do not depend on a UI library or provider framework. */
export type ConversationEvent =
  | { kind: "run-start" }
  | { kind: "text-start"; messageId: string }
  | { kind: "text-delta"; messageId: string; text: string }
  | { kind: "text-end"; messageId: string }
  | { kind: "run-end" };

export type SubmitTurn = { runId: string; messageId: string; text: string };

export function validateTurn(input: SubmitTurn): WorkspaceResult<SubmitTurn> {
  if (
    !/^[\w-]{1,100}$/.test(input.runId) ||
    !/^[\w-]{1,100}$/.test(input.messageId) ||
    !input.text.trim() ||
    input.text.length > 4000
  )
    return failure("INVALID_INPUT", "Send between 1 and 4,000 characters of text.");
  return Result.ok(input);
}

/** No model calls, tools, purchases, or external effects. Explicitly development-only. */
export function developmentReply(): string {
  return (
    "Development responder — no AI model or provider has been called.\n\n" +
    "Your message is saved in this private workspace. Describe the outcome you need, " +
    "the inputs available, and any constraints. You can also save a brief above the conversation.\n\n" +
    "Sending a message does not hire an agent or authorize spending."
  );
}

export function turnEvents(messageId: string, text: string): ConversationEvent[] {
  // Split by Unicode code points, never halfway through a surrogate pair.
  const characters = Array.from(text);
  const deltas: ConversationEvent[] = [];
  for (let i = 0; i < characters.length; i += 32) {
    deltas.push({ kind: "text-delta", messageId, text: characters.slice(i, i + 32).join("") });
  }
  return [
    { kind: "run-start" },
    { kind: "text-start", messageId },
    ...deltas,
    { kind: "text-end", messageId },
    { kind: "run-end" },
  ];
}

export class Workspace {
  id!: string;
  ownerId!: string;
  title!: string;
  brief = "";
  revision = 0;
  createdAt = new Date();
}

export class Conversation {
  id!: string;
  workspaceId!: string;
  title!: string;
  revision = 0;
  createdAt = new Date();
}

export class ConversationTurn {
  id!: string;
  conversationId!: string;
  runId!: string;
  messageId!: string;
  input!: string;
  revision!: number;
  messages!: ConversationMessage[];
  events!: ConversationEvent[];
  createdAt = new Date();
}
