import { id } from "../quotes/quote.schemas";

const invocationParams = {
  type: "object",
  required: ["id"],
  properties: { id },
} as const;

export const submitInvocationSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["quoteId"],
    properties: { quoteId: id },
  },
};

export const invocationStatusSchema = { params: invocationParams };

export const financialIntentSchema = {
  params: { ...invocationParams, additionalProperties: false },
  body: {
    type: "object",
    required: ["action"],
    additionalProperties: false,
    properties: {
      action: { enum: ["reclaim"] },
    },
  },
};
