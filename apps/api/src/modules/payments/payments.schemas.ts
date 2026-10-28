import { z } from "zod";
import { id } from "../schemas";

export const submitInvocationBody = z.object({ quoteId: id }).strict();
export const financialIntentBody = z.object({ action: z.enum(["reclaim"]) }).strict();
export const invocationListQuery = z.object({ cursor: z.string().max(128).optional() });
