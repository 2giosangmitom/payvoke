import { Type } from "typebox";

export const Uuid = Type.String({ format: "uuid" });
export const ApplicationParams = Type.Object({ applicationId: Uuid });
export const KeyParams = Type.Object({ applicationId: Uuid, keyId: Uuid });
export const InvocationParams = Type.Object({ applicationId: Uuid, invocationId: Uuid });
export const Scope = Type.Union([Type.Literal("commands:write"), Type.Literal("gateway:connect")]);
export const Command = Type.Object(
  {
    name: Type.String({ pattern: "^[a-z][a-z0-9-]{0,31}$" }),
    description: Type.String({ minLength: 1, maxLength: 200 }),
    inputSchema: Type.Object(
      {
        type: Type.Literal("object"),
        properties: Type.Record(
          Type.String(),
          Type.Object(
            {
              type: Type.Literal("string"),
              maxLength: Type.Integer({ minimum: 1, maximum: 8000 }),
              enum: Type.Optional(
                Type.Array(Type.String({ maxLength: 8000 }), {
                  minItems: 1,
                  maxItems: 25,
                  uniqueItems: true,
                }),
              ),
            },
            { additionalProperties: false },
          ),
          { maxProperties: 10 },
        ),
        required: Type.Array(Type.String(), { maxItems: 10, uniqueItems: true }),
        additionalProperties: Type.Literal(false),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);
export const Commands = Type.Array(Command, { maxItems: 25 });
export const ApplicationView = Type.Object({
  id: Uuid,
  name: Type.String(),
  currentRevisionId: Type.Union([Uuid, Type.Null()]),
  createdAt: Type.String(),
  gatewayConnected: Type.Boolean(),
});
export const KeyView = Type.Object({
  id: Uuid,
  label: Type.String(),
  prefix: Type.String(),
  scopes: Type.Array(Scope),
  expiresAt: Type.String(),
  revokedAt: Type.Union([Type.String(), Type.Null()]),
  createdAt: Type.String(),
});
export const RevisionView = Type.Object({
  id: Uuid,
  digest: Type.String(),
  commands: Commands,
  createdAt: Type.String(),
});
export const InvocationView = Type.Object({
  id: Uuid,
  applicationId: Uuid,
  conversationId: Type.Union([Uuid, Type.Null()]),
  listingVersionId: Type.Union([Uuid, Type.Null()]),
  revisionId: Uuid,
  command: Type.String(),
  input: Type.Record(Type.String(), Type.String()),
  state: Type.String(),
  progress: Type.Union([Type.String(), Type.Null()]),
  result: Type.Union([Type.String(), Type.Null()]),
  deadlineAt: Type.String(),
  createdAt: Type.String(),
  developmentOnly: Type.Literal(true),
});
export const ConversationCommandView = Type.Object({
  listingId: Uuid,
  versionId: Uuid,
  applicationId: Uuid,
  applicationName: Type.String(),
  revisionId: Uuid,
  gatewayConnected: Type.Boolean(),
  commands: Commands,
  limits: Type.Object({
    inputChars: Type.Integer(),
    outputTokens: Type.Integer(),
    timeoutSeconds: Type.Integer(),
  }),
});
export const GatewayFrame = Type.Union([
  Type.Object(
    {
      type: Type.Literal("identify"),
      protocol: Type.Literal("provider-gateway-v1"),
      executorId: Uuid,
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      type: Type.Union([
        Type.Literal("accepted"),
        Type.Literal("progress"),
        Type.Literal("completed"),
        Type.Literal("failed"),
        Type.Literal("uncertain"),
      ]),
      requestId: Uuid,
      invocationId: Uuid,
      text: Type.Optional(Type.String({ maxLength: 16000 })),
    },
    { additionalProperties: false },
  ),
]);
