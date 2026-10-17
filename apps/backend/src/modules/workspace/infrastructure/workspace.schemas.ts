import { EntitySchema } from "@mikro-orm/core";
import { Workspace, Conversation, ConversationTurn } from "../domain/conversation.js";

export const WorkspaceSchema = new EntitySchema({
  class: Workspace,
  tableName: "workspaces",
  rowLevelSecurity: true,
  properties: {
    id: { type: "uuid", primary: true },
    ownerId: {
      kind: "m:1",
      type: "AppUser",
      fieldName: "owner_id",
      mapToPk: true,
      index: true,
      deleteRule: "cascade",
    },
    title: { type: "string", length: 100 },
    brief: { type: "text" },
    revision: { type: "integer" },
    createdAt: { type: "datetime" },
  },
});
export const ConversationSchema = new EntitySchema({
  class: Conversation,
  tableName: "conversations",
  rowLevelSecurity: true,
  properties: {
    id: { type: "uuid", primary: true },
    workspaceId: {
      kind: "m:1",
      type: "Workspace",
      fieldName: "workspace_id",
      mapToPk: true,
      index: true,
      deleteRule: "cascade",
    },
    title: { type: "string", length: 100 },
    revision: { type: "integer" },
    createdAt: { type: "datetime" },
  },
});
export const ConversationTurnSchema = new EntitySchema({
  class: ConversationTurn,
  tableName: "conversation_turns",
  rowLevelSecurity: true,
  uniques: [
    { properties: ["conversationId", "runId"] },
    { properties: ["conversationId", "messageId"] },
    { properties: ["conversationId", "revision"] },
  ],
  properties: {
    id: { type: "uuid", primary: true },
    conversationId: {
      kind: "m:1",
      type: "Conversation",
      fieldName: "conversation_id",
      mapToPk: true,
      index: true,
      deleteRule: "cascade",
    },
    runId: { type: "string", length: 100 },
    messageId: { type: "string", length: 100 },
    input: { type: "text" },
    revision: { type: "integer" },
    messages: { type: "json" },
    events: { type: "json" },
    createdAt: { type: "datetime" },
  },
});

export const workspaceSchemas = [WorkspaceSchema, ConversationSchema, ConversationTurnSchema];
