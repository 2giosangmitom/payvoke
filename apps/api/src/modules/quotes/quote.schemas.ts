export const id = { type: "string", minLength: 1, maxLength: 128 } as const;

// Every price comes from the bot: a quote is always for an open offer.
export type PrepareQuoteBody = {
  threadId: string;
  offerId: string;
  contextSelection: { messageIds: string[]; briefVersionId: string | null; fileIds: string[] };
  clientRequestId: string;
};

export const prepareQuoteSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["threadId", "offerId", "contextSelection", "clientRequestId"],
    properties: {
      threadId: id,
      offerId: id,
      clientRequestId: id,
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
