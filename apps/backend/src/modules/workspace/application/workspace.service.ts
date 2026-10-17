import type { WorkspaceRepository } from "./workspace.repository.js";
import { Result } from "better-result";
import { failure, validateTurn, type SubmitTurn } from "../domain/conversation.js";

export class WorkspaceService {
  constructor(private readonly workspaces: WorkspaceRepository) {}

  list(ownerId: string, offset = 0) {
    return this.workspaces.list(ownerId, offset);
  }
  create(ownerId: string, id: string, title: string) {
    return this.workspaces.create(ownerId, id, title.trim());
  }
  updateBrief(ownerId: string, id: string, brief: string, revision: number) {
    return this.workspaces.updateBrief(ownerId, id, brief, revision);
  }
  conversations(ownerId: string, workspaceId: string, offset = 0) {
    return this.workspaces.conversations(ownerId, workspaceId, offset);
  }
  createConversation(ownerId: string, workspaceId: string, id: string, title: string) {
    return this.workspaces.createConversation(ownerId, workspaceId, id, title.trim());
  }
  history(ownerId: string, conversationId: string) {
    return this.workspaces.history(ownerId, conversationId);
  }
  submit(ownerId: string, conversationId: string, input: SubmitTurn) {
    const result = validateTurn(input);
    if (result.isErr()) return Promise.resolve(result);
    return this.workspaces.submit(ownerId, conversationId, input);
  }
  async replay(ownerId: string, conversationId: string, runId: string, after: number) {
    const history = await this.workspaces.history(ownerId, conversationId);
    if (history.isErr()) return history;
    const turn = history.value.turns.find((entry) => entry.runId === runId);
    if (!turn) return failure("NOT_FOUND", "Conversation run not found.");
    const reset = turn.events.length === 0 || after > turn.events.length;
    return Result.ok({ ...history.value, turn, reset, after });
  }
}
