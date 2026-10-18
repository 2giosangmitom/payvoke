import type {
  CommandInvocation,
  CommandRevision,
  GatewayPrincipal,
  KeyScope,
  ProviderApiKey,
  ProviderApplication,
  SlashCommand,
} from "../domain/provider.js";

export interface ProviderRepository {
  createApplication(ownerId: string, id: string, name: string): Promise<ProviderApplication>;
  applications(ownerId: string): Promise<ProviderApplication[]>;
  createKey(ownerId: string, key: ProviderApiKey): Promise<void>;
  keys(ownerId: string, applicationId: string): Promise<ProviderApiKey[]>;
  revokeKey(ownerId: string, applicationId: string, keyId: string): Promise<void>;
  authenticate(hash: string, scope: KeyScope): Promise<GatewayPrincipal>;
  register(principal: GatewayPrincipal, commands: SlashCommand[]): Promise<CommandRevision>;
  commands(ownerId: string, applicationId: string): Promise<CommandRevision | null>;
  invoke(
    ownerId: string,
    applicationId: string,
    id: string,
    revisionId: string,
    command: string,
    input: Record<string, string>,
  ): Promise<CommandInvocation>;
  invocation(ownerId: string, applicationId: string, id: string): Promise<CommandInvocation>;
  invocations(ownerId: string, applicationId: string, offset: number): Promise<CommandInvocation[]>;
  conversationCommands(ownerId: string, conversationId: string): Promise<ConversationCommand[]>;
  conversationInvocations(ownerId: string, conversationId: string): Promise<CommandInvocation[]>;
  invokeConversation(
    ownerId: string,
    conversationId: string,
    id: string,
    listingId: string,
    versionId: string,
    command: string,
    input: Record<string, string>,
  ): Promise<CommandInvocation>;
  connect(principal: GatewayPrincipal, sessionId: string): Promise<void>;
  disconnect(applicationId: string, sessionId: string): Promise<void>;
  next(
    principal: GatewayPrincipal,
    sessionId: string,
    executorId: string,
  ): Promise<{ invocation: CommandInvocation; definition: SlashCommand } | null>;
  receive(
    principal: GatewayPrincipal,
    sessionId: string,
    executorId: string,
    invocationId: string,
    type: "accepted" | "progress" | "completed" | "failed" | "uncertain",
    text?: string,
  ): Promise<void>;
}
export interface ConversationCommand {
  listingId: string;
  versionId: string;
  applicationId: string;
  applicationName: string;
  revisionId: string;
  gatewayConnected: boolean;
  limits: { inputChars: number; outputTokens: number; timeoutSeconds: number };
  commands: SlashCommand[];
}
