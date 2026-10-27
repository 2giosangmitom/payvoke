import { hashSnapshot, type Json } from "@payvoke/protocol";
import type { Prisma } from "@payvoke/db";

// Messages a provider sees with each event and an accepted offer freezes.
export const CONVERSATION_LIMIT = 30;

export type ConversationEntry = {
  seq: number;
  role: "BUYER" | "PROVIDER";
  content: string;
  commandId: string | null;
  arguments: Json;
  files: Json;
  // Present only when set, so hashes of plain messages stay as they were.
  form?: Json;
  replyToId?: string;
};

type Db = Prisma.TransactionClient;

// The bounded tail of a thread's pre-sale conversation up to and including
// `uptoSeq`, oldest first. Offers hash exactly this list.
export async function conversation(db: Db, threadId: string, uptoSeq: number) {
  const rows = await db.threadMessage.findMany({
    where: { threadId, seq: { lte: uptoSeq } },
    orderBy: { seq: "desc" },
    take: CONVERSATION_LIMIT,
  });
  return rows.reverse().map((row): ConversationEntry => ({
    seq: row.seq,
    role: row.role as ConversationEntry["role"],
    content: row.content,
    commandId: row.commandId,
    arguments: (row.arguments ?? null) as Json,
    files: (row.fileManifest ?? []) as Json,
    ...(row.form ? { form: row.form as Json } : {}),
    ...(row.replyToId ? { replyToId: row.replyToId } : {}),
  }));
}

export const conversationHash = (entries: ConversationEntry[]) =>
  hashSnapshot(entries as unknown as Json);
