import { randomUUID } from "node:crypto";
import {
  digest,
  newApiKey,
  ProviderApiKey,
  validateCommands,
  type KeyScope,
  type SlashCommand,
  type GatewayPrincipal,
} from "../domain/provider.js";
import type { ProviderRepository } from "./provider.repository.js";

export class ProviderService {
  constructor(private readonly repository: ProviderRepository) {}
  createApplication(owner: string, id: string, name: string) {
    return this.repository.createApplication(owner, id, name.trim());
  }
  applications(owner: string) {
    return this.repository.applications(owner);
  }
  async createKey(owner: string, applicationId: string, label: string, scopes: KeyScope[]) {
    const { secret, hash, prefix } = newApiKey();
    const key = Object.assign(new ProviderApiKey(), {
      id: randomUUID(),
      applicationId,
      label: label.trim(),
      scopes: [...new Set(scopes)],
      hash,
      prefix,
      expiresAt: new Date(Date.now() + 90 * 86400_000),
    });
    await this.repository.createKey(owner, key);
    return { key, secret };
  }
  keys(owner: string, app: string) {
    return this.repository.keys(owner, app);
  }
  revokeKey(owner: string, app: string, key: string) {
    return this.repository.revokeKey(owner, app, key);
  }
  authenticate(secret: string, scope: KeyScope) {
    return this.repository.authenticate(digest(secret), scope);
  }
  register(principal: GatewayPrincipal, commands: SlashCommand[]) {
    validateCommands(commands);
    return this.repository.register(principal, commands);
  }
  commands(owner: string, app: string) {
    return this.repository.commands(owner, app);
  }
  invoke(
    owner: string,
    app: string,
    id: string,
    revision: string,
    command: string,
    input: Record<string, string>,
  ) {
    return this.repository.invoke(owner, app, id, revision, command, input);
  }
  invocation(owner: string, app: string, id: string) {
    return this.repository.invocation(owner, app, id);
  }
  invocations(owner: string, app: string, offset: number) {
    return this.repository.invocations(owner, app, offset);
  }
  conversationCommands(owner: string, conversation: string) {
    return this.repository.conversationCommands(owner, conversation);
  }
  conversationInvocations(owner: string, conversation: string) {
    return this.repository.conversationInvocations(owner, conversation);
  }
  invokeConversation(
    owner: string,
    conversation: string,
    id: string,
    listing: string,
    version: string,
    command: string,
    input: Record<string, string>,
  ) {
    return this.repository.invokeConversation(
      owner,
      conversation,
      id,
      listing,
      version,
      command,
      input,
    );
  }
}
