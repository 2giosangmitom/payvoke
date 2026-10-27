import type { Json } from "@payvoke/protocol";

export const id = { type: "string", minLength: 1, maxLength: 128 } as const;

// TOOL apps quote a command with arguments; AGENT apps quote an open offer.
export type PrepareQuoteBody = {
  threadId: string;
  commandId?: string;
  arguments?: Record<string, Json>;
  offerId?: string;
  contextSelection: { messageIds: string[]; briefVersionId: string | null; fileIds: string[] };
  clientRequestId: string;
};

export const prepareQuoteSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["threadId", "contextSelection", "clientRequestId"],
    oneOf: [
      { required: ["commandId", "arguments"], not: { required: ["offerId"] } },
      {
        required: ["offerId"],
        not: { anyOf: [{ required: ["commandId"] }, { required: ["arguments"] }] },
      },
    ],
    properties: {
      threadId: id,
      commandId: id,
      offerId: id,
      clientRequestId: id,
      arguments: { type: "object" },
      contextSelection: {
        type: "object",
        additionalProperties: false,
        required: ["messageIds", "briefVersionId", "fileIds"],
        properties: {
          messageIds: { type: "array", maxItems: 100, uniqueItems: true, items: id },
          briefVersionId: { anyOf: [id, { type: "null" }] },
          fileIds: { type: "array", maxItems: 100, uniqueItems: true, items: id },
        },
      },
    },
  },
};
