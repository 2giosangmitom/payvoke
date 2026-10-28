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

// Native EventSource reconnects with Last-Event-ID even when the bootstrap URL
// still carries an older ?after= cursor.
export const eventsQuery = z.object({ after: z.string().optional(), once: z.string().optional() });
