import { randomUUID } from "node:crypto";
import { IsolationLevel, LockMode, type EntityManager } from "@mikro-orm/postgresql";
import { Result } from "better-result";
import type { WorkspaceRepository } from "../application/workspace.repository.js";
import {
  Workspace,
  Conversation,
  ConversationTurn,
  developmentReply,
  turnEvents,
  failure,
  type SubmitTurn,
} from "../domain/conversation.js";

const notFound = () => failure("NOT_FOUND", "Workspace or conversation not found.");

export class MikroOrmWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly em: EntityManager) {}

  list(ownerId: string, offset: number) {
    return this.em.find(
      Workspace,
      { ownerId },
      { orderBy: { createdAt: "desc", id: "asc" }, limit: 50, offset },
    );
  }

  async create(ownerId: string, id: string, title: string) {
    const workspace = Object.assign(new Workspace(), { ownerId, id, title });
    await this.em
      .createQueryBuilder(Workspace)
      .insert(workspace)
      .onConflict("id")
      .ignore()
      .execute();
    const existing = await this.em.findOne(Workspace, { id, ownerId });
    if (!existing) return notFound();
    if (existing.title !== title)
      return failure("CONFLICT", "Workspace ID already used with another title.");
    return Result.ok(existing);
  }

  async updateBrief(ownerId: string, id: string, brief: string, revision: number) {
    return this.em.transactional(async (em) => {
      const workspace = await em.findOne(
        Workspace,
        { id, ownerId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!workspace) return notFound();
      // A retry of an already-applied replacement is harmless.
      if (workspace.revision === revision + 1 && workspace.brief === brief)
        return Result.ok(workspace);
      if (workspace.revision !== revision)
        return failure("CONFLICT", "The brief changed. Reload before saving.");
      workspace.brief = brief;
      workspace.revision++;
      await em.flush();
      return Result.ok(workspace);
    });
  }

  async conversations(ownerId: string, workspaceId: string, offset: number) {
    if (!(await this.em.findOne(Workspace, { id: workspaceId, ownerId }))) return notFound();
    return Result.ok(
      await this.em.find(
        Conversation,
        { workspaceId },
        {
          orderBy: { createdAt: "desc", id: "asc" },
          limit: 50,
          offset,
        },
      ),
    );
  }

  async createConversation(ownerId: string, workspaceId: string, id: string, title: string) {
    if (!(await this.em.findOne(Workspace, { id: workspaceId, ownerId }))) return notFound();
    const conversation = Object.assign(new Conversation(), { id, workspaceId, title });
    await this.em
      .createQueryBuilder(Conversation)
      .insert(conversation)
      .onConflict("id")
      .ignore()
      .execute();
    const existing = await this.em.findOne(Conversation, { id, workspaceId });
    if (!existing) return notFound();
    if (existing.title !== title)
      return failure("CONFLICT", "Conversation ID already used with another title.");
    return Result.ok(existing);
  }

  async history(ownerId: string, conversationId: string) {
    return this.em.transactional(
      async (em) => {
        const conversation = await em.findOne(Conversation, { id: conversationId });
        if (
          !conversation ||
          !(await em.findOne(Workspace, { id: conversation.workspaceId, ownerId }))
        )
          return notFound();
        // The snapshot and its exact revision must come from the same database snapshot.
        const turns = await em.find(
          ConversationTurn,
          { conversationId },
          { orderBy: { revision: "asc" }, limit: 100 },
        );
        return Result.ok({ conversation, turns });
      },
      { isolationLevel: IsolationLevel.REPEATABLE_READ },
    );
  }

  async submit(ownerId: string, conversationId: string, input: SubmitTurn) {
    return this.em.transactional(async (em) => {
      const conversation = await em.findOne(
        Conversation,
        { id: conversationId },
        {
          lockMode: LockMode.PESSIMISTIC_WRITE,
        },
      );
      if (
        !conversation ||
        !(await em.findOne(Workspace, { id: conversation.workspaceId, ownerId }))
      )
        return notFound();
      const existing = await em.findOne(ConversationTurn, {
        conversationId,
        $or: [{ runId: input.runId }, { messageId: input.messageId }],
      });
      if (existing) {
        if (
          existing.runId !== input.runId ||
          existing.messageId !== input.messageId ||
          existing.input !== input.text
        ) {
          return failure(
            "CONFLICT",
            "This operation or message ID was already used with different input.",
          );
        }
        return Result.ok(existing);
      }
      if (conversation.revision >= 100)
        return failure("LIMIT_REACHED", "Start a new conversation after 100 messages.");
      const id = randomUUID();
      const assistantId = `response-${id}`;
      const response = developmentReply();
      const turn = Object.assign(new ConversationTurn(), {
        id,
        conversationId,
        runId: input.runId,
        messageId: input.messageId,
        input: input.text,
        revision: ++conversation.revision,
        messages: [
          {
            id: input.messageId,
            role: "user",
            provenance: "user-instruction",
            parts: [{ id: `${id}-input`, type: "text", text: input.text }],
          },
          {
            id: assistantId,
            role: "assistant",
            provenance: "development-responder",
            parts: [{ id: `${id}-output`, type: "text", text: response }],
          },
        ],
        events: turnEvents(assistantId, response),
      });
      // Keep a bounded event tail (four runs); canonical message snapshots remain durable.
      await em.nativeUpdate(
        ConversationTurn,
        { conversationId, revision: { $lte: conversation.revision - 4 } },
        { events: [] },
      );
      await em.persist(turn).flush();
      return Result.ok(turn);
    });
  }
}
