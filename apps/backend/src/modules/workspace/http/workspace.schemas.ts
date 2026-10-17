import { Type } from "typebox";

const Id = Type.String({ format: "uuid" });
const Title = Type.String({ minLength: 1, maxLength: 100, pattern: "\\S" });
export const CreateSchema = Type.Object({ id: Id, title: Title }, { additionalProperties: false });
export const IdParams = Type.Object({ id: Id });
export const Pagination = Type.Object({
  offset: Type.Optional(Type.Integer({ minimum: 0, maximum: 10000 })),
});
export const WorkspaceView = Type.Object({
  id: Id,
  title: Type.String(),
  brief: Type.String(),
  revision: Type.Integer(),
  createdAt: Type.String({ format: "date-time" }),
});
export const ConversationView = Type.Object({
  id: Id,
  workspaceId: Id,
  title: Type.String(),
  revision: Type.Integer(),
  createdAt: Type.String({ format: "date-time" }),
});
export const BriefSchema = Type.Object(
  {
    brief: Type.String({ maxLength: 8000 }),
    revision: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

// The browser's prior transcript, state, tools, and context are never trusted or executed.
// Only its final plain-text user message is admitted by the HTTP adapter.
export const AgentInput = Type.Object(
  {
    threadId: Id,
    runId: Type.String({ pattern: "^[\\w-]{1,100}$" }),
    messages: Type.Array(
      Type.Object(
        {
          id: Type.String({ minLength: 1, maxLength: 100 }),
          role: Type.String(),
          content: Type.Optional(Type.Unknown()),
        },
        { additionalProperties: true },
      ),
      { minItems: 1, maxItems: 201 },
    ),
    state: Type.Optional(Type.Unknown()),
    tools: Type.Optional(Type.Array(Type.Unknown(), { maxItems: 0 })),
    context: Type.Optional(Type.Array(Type.Unknown(), { maxItems: 0 })),
    forwardedProps: Type.Optional(Type.Unknown()),
  },
  { additionalProperties: false },
);

export const MessageView = Type.Object({
  id: Type.String(),
  role: Type.Union([Type.Literal("user"), Type.Literal("assistant")]),
  content: Type.String(),
});
export const HistoryView = Type.Object({
  conversation: ConversationView,
  messages: Type.Array(MessageView),
  responder: Type.Literal("development"),
});
