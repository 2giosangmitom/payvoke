import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "#core/db";
import { conversation, conversationHash } from "../src/modules/presale/conversation";

// Every quote is for a bot offer. Tests that are about payment rather than the
// conversation create the buyer request and the offer directly, exactly as
// the presale service would store them.
export async function offerFixture(
  db: PrismaClient,
  input: {
    threadId: string;
    commandId: string;
    arguments: Record<string, unknown>;
    grossAmount: string;
    deliverySeconds?: number;
    content?: string;
  },
) {
  const thread = await db.chatThread.findUniqueOrThrow({ where: { id: input.threadId } });
  const command = await db.appCommand.findUniqueOrThrow({
    where: { id: input.commandId },
    include: { activeRevision: true },
  });
  const revision = command.activeRevision!;
  const last = await db.threadMessage.findFirst({
    where: { threadId: thread.id },
    orderBy: { seq: "desc" },
  });
  const seq = (last?.seq ?? 0) + 1;
  await db.threadMessage.create({
    data: {
      threadId: thread.id,
      seq,
      role: "BUYER",
      content: input.content ?? `/${command.name}`,
      commandId: command.id,
      arguments: input.arguments as Prisma.InputJsonValue,
      fileManifest: [],
      clientRequestId: randomUUID(),
      acknowledgedAt: new Date(),
    },
  });
  await db.offer.updateMany({
    where: { threadId: thread.id, status: "OPEN" },
    data: { status: "SUPERSEDED" },
  });
  return db.offer.create({
    data: {
      threadId: thread.id,
      appId: thread.appId,
      commandRevisionId: revision.id,
      arguments: input.arguments as Prisma.InputJsonValue,
      grossAmount: input.grossAmount,
      deliverySeconds: input.deliverySeconds ?? revision.deliverySeconds,
      summary: `Offer for /${command.name}`,
      messageSeq: seq,
      conversationHash: conversationHash(await conversation(db, thread.id, seq)),
      expiresAt: new Date(Date.now() + 3_600_000),
      clientRequestId: randomUUID(),
    },
  });
}
