import { z } from "zod";

export const newThreadBody = z.object({
  appId: z.string().max(128),
  clientRequestId: z.string().regex(/^[\w-]{1,128}$/),
  title: z.string().optional(),
});

export const threadQuery = z.object({
  q: z.string().max(100).optional(),
  cursor: z.string().max(128).optional(),
  archived: z.string().optional(),
});

export const renameBody = z.object({ title: z.string() });

// Every connection starts from a full timeline, so no resume cursor is taken.
export const eventsQuery = z.object({ once: z.string().optional() });
