import type {
  Workspace,
  Conversation,
  ConversationTurn,
  SubmitTurn,
  WorkspaceResult,
} from "../domain/conversation.js";

export interface WorkspaceRepository {
  list(ownerId: string, offset: number): Promise<Workspace[]>;
  create(ownerId: string, id: string, title: string): Promise<WorkspaceResult<Workspace>>;
  updateBrief(
    ownerId: string,
    id: string,
    brief: string,
    revision: number,
  ): Promise<WorkspaceResult<Workspace>>;
  conversations(
    ownerId: string,
    workspaceId: string,
    offset: number,
  ): Promise<WorkspaceResult<Conversation[]>>;
  createConversation(
    ownerId: string,
    workspaceId: string,
    id: string,
    title: string,
  ): Promise<WorkspaceResult<Conversation>>;
  history(
    ownerId: string,
    conversationId: string,
  ): Promise<WorkspaceResult<{ conversation: Conversation; turns: ConversationTurn[] }>>;
  submit(
    ownerId: string,
    conversationId: string,
    input: SubmitTurn,
  ): Promise<WorkspaceResult<ConversationTurn>>;
}
