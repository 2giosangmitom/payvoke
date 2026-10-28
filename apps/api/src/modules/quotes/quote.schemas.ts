import { z } from "zod";
import { id } from "../schemas";

const unique = (items: string[]) => new Set(items).size === items.length;

// Every price comes from the bot: a quote is always for an open offer.
export const prepareQuoteBody = z
  .object({
    threadId: id,
    offerId: id,
    clientRequestId: id,
    contextSelection: z
      .object({
        messageIds: z.array(id).max(100).refine(unique),
        briefVersionId: id.nullable(),
        fileIds: z.array(id).max(100).refine(unique),
      })
      .strict(),
  })
  .strict();
export type PrepareQuoteBody = z.infer<typeof prepareQuoteBody>;
