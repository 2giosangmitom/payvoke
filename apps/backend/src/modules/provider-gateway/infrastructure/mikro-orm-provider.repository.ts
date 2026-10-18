import { LockMode, QueryOrder, IsolationLevel } from "@mikro-orm/core";
import type { EntityManager } from "@mikro-orm/postgresql";
import { randomUUID } from "node:crypto";
import { ProviderProfile } from "../../publishing/domain/publishing.js";
import { AppUser } from "../../identity/domain/app-user.js";
import {
  CommandInvocation,
  CommandRevision,
  digest,
  ProviderApiKey,
  ProviderApplication,
  ProviderError,
  validateInput,
  type GatewayPrincipal,
  type KeyScope,
  type SlashCommand,
} from "../domain/provider.js";
import type { ProviderRepository } from "../application/provider.repository.js";
import { AgentListing, ManifestVersion } from "../../publishing/domain/publishing.js";
import { Conversation, Workspace } from "../../workspace/domain/conversation.js";

const missing = () => new ProviderError("NOT_FOUND", "Provider resource not found.");
const conflict = (message: string) => new ProviderError("CONFLICT", message);
export class MikroOrmProviderRepository implements ProviderRepository {
  constructor(private readonly em: EntityManager) {}
  private async owner(em: EntityManager, ownerId: string, applicationId: string, lock = false) {
    const application = await em.findOne(
      ProviderApplication,
      { id: applicationId, providerId: ownerId },
      lock ? { lockMode: LockMode.PESSIMISTIC_WRITE } : {},
    );
    if (!application) throw missing();
    return application;
  }
  async createApplication(ownerId: string, id: string, name: string) {
    return this.em.transactional(async (em) => {
      const profile = await em.findOne(ProviderProfile, ownerId, {
        lockMode: LockMode.PESSIMISTIC_WRITE,
      });
      if (!profile) throw missing();
      const existing = await em.findOne(ProviderApplication, id);
      if (existing) {
        if (existing.providerId !== ownerId) throw missing();
        if (existing.name !== name)
          throw conflict("Application ID already binds a different name.");
        return existing;
      }
      if ((await em.count(ProviderApplication, { providerId: ownerId })) >= 50)
        throw new ProviderError("CAPACITY", "Application limit reached.");
      const application = Object.assign(new ProviderApplication(), {
        id,
        providerId: ownerId,
        name,
      });
      await em.persist(application).flush();
      return application;
    });
  }
  applications(ownerId: string) {
    return this.em.find(
      ProviderApplication,
      { providerId: ownerId },
      { limit: 50, orderBy: { createdAt: "desc" } },
    );
  }
  async createKey(ownerId: string, key: ProviderApiKey) {
    await this.em.transactional(async (em) => {
      await this.owner(em, ownerId, key.applicationId, true);
      if (
        (await em.count(ProviderApiKey, {
          applicationId: key.applicationId,
          revokedAt: null,
          expiresAt: { $gt: new Date() },
        })) >= 10
      )
        throw new ProviderError("CAPACITY", "Revoke an existing key before creating another.");
      await em.persist(key).flush();
    });
  }
  async keys(ownerId: string, applicationId: string) {
    await this.owner(this.em, ownerId, applicationId);
    return this.em.find(
      ProviderApiKey,
      { applicationId },
      {
        limit: 100,
        orderBy: { revokedAt: QueryOrder.ASC_NULLS_FIRST, expiresAt: "desc", createdAt: "desc" },
      },
    );
  }
  async revokeKey(ownerId: string, applicationId: string, keyId: string) {
    await this.em.transactional(async (em) => {
      await this.owner(em, ownerId, applicationId, true);
      const key = await em.findOne(ProviderApiKey, { id: keyId, applicationId });
      if (!key) throw missing();
      key.revokedAt ??= new Date();
      await em.flush();
    });
  }
  private async key(em: EntityManager, principal: GatewayPrincipal, scope: KeyScope) {
    const key = await em.findOne(
      ProviderApiKey,
      {
        id: principal.keyId,
        applicationId: principal.applicationId,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      },
      { refresh: true },
    );
    if (!key) throw new ProviderError("INVALID_KEY", "API key is invalid, expired or revoked.");
    if (!key.scopes.includes(scope))
      throw new ProviderError("FORBIDDEN", "API key lacks the required scope.");
    const application = await em.findOne(ProviderApplication, principal.applicationId);
    if (
      !application ||
      !(await em.findOne(AppUser, { id: application.providerId, status: "active" }))
    )
      throw new ProviderError("FORBIDDEN", "Provider is not active.");
    return application;
  }
  async authenticate(hash: string, scope: KeyScope) {
    const key = await this.em.findOne(ProviderApiKey, { hash });
    if (!key) throw new ProviderError("INVALID_KEY", "API key is invalid, expired or revoked.");
    const principal = { keyId: key.id, applicationId: key.applicationId };
    await this.key(this.em, principal, scope);
    return principal;
  }
  async register(principal: GatewayPrincipal, commands: SlashCommand[]) {
    return this.em.transactional(async (em) => {
      await em.findOneOrFail(ProviderApplication, principal.applicationId, {
        lockMode: LockMode.PESSIMISTIC_WRITE,
      });
      const application = await this.key(em, principal, "commands:write");
      const hash = digest(commands);
      let revision = await em.findOne(CommandRevision, {
        applicationId: application.id,
        digest: hash,
      });
      if (!revision) {
        if ((await em.count(CommandRevision, { applicationId: application.id })) >= 1000)
          throw new ProviderError("CAPACITY", "Command revision limit reached.");
        revision = Object.assign(new CommandRevision(), {
          id: randomUUID(),
          applicationId: application.id,
          commands,
          digest: hash,
        });
        em.persist(revision);
      }
      application.currentRevisionId = revision.id;
      await em.flush();
      return revision;
    });
  }
  async commands(ownerId: string, applicationId: string) {
    const application = await this.owner(this.em, ownerId, applicationId);
    return application.currentRevisionId
      ? this.em.findOne(CommandRevision, { id: application.currentRevisionId, applicationId })
      : null;
  }
  async invoke(
    ownerId: string,
    applicationId: string,
    id: string,
    revisionId: string,
    command: string,
    input: Record<string, string>,
  ) {
    return this.em.transactional(async (em) => {
      const app = await this.owner(em, ownerId, applicationId, true);
      return this.enqueue(em, app, id, revisionId, command, input);
    });
  }
  private async enqueue(
    em: EntityManager,
    app: ProviderApplication,
    id: string,
    revisionId: string,
    command: string,
    input: Record<string, string>,
    context?: {
      conversationId: string;
      listingVersionId: string;
      timeoutSeconds: number;
      inputChars: number;
    },
  ) {
    const applicationId = app.id;
    const existing = await em.findOne(CommandInvocation, id);
    if (existing) {
      if (existing.applicationId !== applicationId) throw missing();
      if (
        existing.revisionId !== revisionId ||
        existing.command !== command ||
        digest(existing.input) !== digest(input) ||
        existing.conversationId !== (context?.conversationId ?? null) ||
        existing.listingVersionId !== (context?.listingVersionId ?? null)
      )
        throw conflict("Invocation ID already binds different input.");
      return existing;
    }
    if (!context && app.currentRevisionId !== revisionId)
      throw conflict("Command revision changed. Reload registered commands.");
    const revision = await em.findOne(CommandRevision, { id: revisionId, applicationId });
    const definition = revision?.commands.find((item) => item.name === command);
    if (!definition) throw missing();
    validateInput(definition, input);
    if (
      context &&
      Object.values(input).reduce((total, value) => total + value.length, 0) > context.inputChars
    )
      throw new ProviderError(
        "INVALID_INPUT",
        "Input exceeds the pinned manifest's character limit.",
      );
    if (
      (await em.count(CommandInvocation, {
        applicationId,
        state: { $in: ["queued", "running"] },
      })) >= 20
    )
      throw new ProviderError("CAPACITY", "Too many unfinished development invocations.");
    if (
      context &&
      (await em.count(CommandInvocation, { conversationId: context.conversationId })) >= 50
    )
      throw new ProviderError(
        "CAPACITY",
        "This conversation has reached its 50 command invocation limit.",
      );
    const invocation = Object.assign(new CommandInvocation(), {
      id,
      applicationId,
      revisionId,
      command,
      input,
      conversationId: context?.conversationId ?? null,
      listingVersionId: context?.listingVersionId ?? null,
      deadlineAt: new Date(Date.now() + (context?.timeoutSeconds ?? 300) * 1000),
    });
    // The invocation itself is the durable outbox: persisted before any socket send.
    await em.persist(invocation).flush();
    return invocation;
  }
  async invocations(ownerId: string, applicationId: string, offset: number) {
    await this.owner(this.em, ownerId, applicationId);
    await this.expire(this.em, { applicationId });
    return this.em.find(
      CommandInvocation,
      { applicationId },
      { limit: 50, offset, orderBy: { createdAt: "desc", id: "asc" } },
    );
  }
  private async conversation(em: EntityManager, ownerId: string, id: string, lock = false) {
    const conversation = await em.findOne(
      Conversation,
      id,
      lock ? { lockMode: LockMode.PESSIMISTIC_WRITE } : {},
    );
    if (!conversation || !(await em.findOne(Workspace, { id: conversation.workspaceId, ownerId })))
      throw missing();
    return conversation;
  }
  async conversationCommands(ownerId: string, conversationId: string) {
    return this.em.transactional(
      async (em) => {
        await this.conversation(em, ownerId, conversationId);
        const rows = await em.execute<
          {
            listing_id: string;
            version_id: string;
            application_id: string;
            name: string;
            revision_id: string;
            session_expires_at: Date | null;
            commands: SlashCommand[];
            limits: { inputChars: number; outputTokens: number; timeoutSeconds: number };
          }[]
        >(
          `select l.id as listing_id, v.id as version_id, a.id as application_id, v.manifest->>'name' as name, r.id as revision_id, a.session_expires_at, r.commands, v.manifest->'limits' as limits
        from agent_listings l join manifest_versions v on v.id = l.published_version_id and v.listing_id = l.id
        join provider_applications a on a.id::text = v.manifest->'gateway'->>'applicationId' and a.provider_id = l.provider_id
        join provider_command_revisions r on r.id::text = v.manifest->'gateway'->>'commandRevisionId' and r.application_id = a.id
        where l.provider_id = ? and not l.paused and v.state = 'approved' and v.manifest->>'schemaVersion' = '2'
        order by l.created_at desc, l.id asc limit 50`,
          [ownerId],
        );
        return rows.map((row) => ({
          listingId: row.listing_id,
          versionId: row.version_id,
          applicationId: row.application_id,
          applicationName: row.name,
          revisionId: row.revision_id,
          gatewayConnected:
            !!row.session_expires_at && new Date(row.session_expires_at) > new Date(),
          commands: row.commands,
          limits: row.limits,
        }));
      },
      { isolationLevel: IsolationLevel.REPEATABLE_READ },
    );
  }
  async conversationInvocations(ownerId: string, conversationId: string) {
    await this.conversation(this.em, ownerId, conversationId);
    await this.expire(this.em, { conversationId });
    return this.em.find(
      CommandInvocation,
      { conversationId },
      { limit: 50, orderBy: { createdAt: "asc", id: "asc" } },
    );
  }
  async invokeConversation(
    ownerId: string,
    conversationId: string,
    id: string,
    listingId: string,
    versionId: string,
    command: string,
    input: Record<string, string>,
  ) {
    return this.em.transactional(async (em) => {
      await this.conversation(em, ownerId, conversationId, true);
      const listing = await em.findOne(
        AgentListing,
        { id: listingId, providerId: ownerId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      const version = listing && (await em.findOne(ManifestVersion, { id: versionId, listingId }));
      if (!listing || !version || version.manifest.schemaVersion !== 2) throw missing();
      const binding = version.manifest.gateway;
      const app = await this.owner(em, ownerId, binding.applicationId, true);
      // Existing IDs recover their pinned operation even if publication/current commands changed.
      const existing = await em.findOne(CommandInvocation, id);
      if (
        !existing &&
        (listing.paused ||
          listing.publishedVersionId !== version.id ||
          version.state !== "approved")
      )
        throw conflict("This command version is no longer published. Reload available commands.");
      return this.enqueue(em, app, id, binding.commandRevisionId, command, input, {
        conversationId,
        listingVersionId: version.id,
        timeoutSeconds: version.manifest.limits.timeoutSeconds,
        inputChars: version.manifest.limits.inputChars,
      });
    });
  }
  async invocation(ownerId: string, applicationId: string, id: string) {
    await this.owner(this.em, ownerId, applicationId);
    await this.expire(this.em, { applicationId });
    const invocation = await this.em.findOne(CommandInvocation, { id, applicationId });
    if (!invocation) throw missing();
    return invocation;
  }
  private async expire(
    em: EntityManager,
    filter: { applicationId?: string; conversationId?: string },
  ) {
    await em.transactional(async (tx) => {
      const ids = filter.applicationId
        ? [filter.applicationId]
        : (
            await tx.execute<{ application_id: string }[]>(
              "select distinct application_id from provider_command_invocations where conversation_id = ? order by application_id",
              [filter.conversationId],
            )
          ).map((row) => row.application_id);
      // Use the same application fence as receive/dispatch; expiry cannot overwrite a
      // concurrently committed completion (or be overwritten from a stale read).
      for (const id of ids)
        await tx.findOne(ProviderApplication, id, { lockMode: LockMode.PESSIMISTIC_WRITE });
      const expired = {
        ...filter,
        deadlineAt: { $lte: new Date() },
        state: { $in: ["queued", "running"] as CommandInvocation["state"][] },
      };
      await tx.nativeUpdate(
        CommandInvocation,
        { ...expired, executorId: null },
        { state: "failed", result: "Expired before delivery." },
      );
      await tx.nativeUpdate(
        CommandInvocation,
        { ...expired, executorId: { $ne: null } },
        {
          state: "uncertain",
          result:
            "Provider deadline elapsed; execution may have occurred. Not automatically retried.",
        },
      );
    });
  }
  async connect(principal: GatewayPrincipal, sessionId: string) {
    await this.em.transactional(async (em) => {
      await em.findOneOrFail(ProviderApplication, principal.applicationId, {
        lockMode: LockMode.PESSIMISTIC_WRITE,
      });
      const application = await this.key(em, principal, "gateway:connect");
      if (
        application.sessionId &&
        application.sessionExpiresAt &&
        application.sessionExpiresAt > new Date()
      )
        throw new ProviderError(
          "GATEWAY_BUSY",
          "An application already has an active Gateway connection. Retry after its lease expires.",
        );
      application.sessionId = sessionId;
      application.sessionExpiresAt = new Date(Date.now() + 15_000);
      await em.flush();
    });
  }
  async disconnect(applicationId: string, sessionId: string) {
    await this.em.nativeUpdate(
      ProviderApplication,
      { id: applicationId, sessionId },
      { sessionId: null, sessionExpiresAt: null },
    );
  }
  private async session(em: EntityManager, principal: GatewayPrincipal, sessionId: string) {
    const application = await em.findOne(ProviderApplication, principal.applicationId, {
      lockMode: LockMode.PESSIMISTIC_WRITE,
    });
    if (!application) throw new ProviderError("INVALID_KEY", "Application no longer exists.");
    await this.key(em, principal, "gateway:connect");
    if (
      application.sessionId !== sessionId ||
      !application.sessionExpiresAt ||
      application.sessionExpiresAt <= new Date()
    )
      throw new ProviderError("SESSION_EXPIRED", "Gateway session expired or was replaced.");
    application.sessionExpiresAt = new Date(Date.now() + 15_000);
    return application;
  }
  async next(principal: GatewayPrincipal, sessionId: string, executorId: string) {
    return this.em.transactional(async (em) => {
      await this.session(em, principal, sessionId);
      const unfinished = await em.find(
        CommandInvocation,
        { applicationId: principal.applicationId, state: { $in: ["queued", "running"] } },
        { orderBy: { createdAt: "asc", id: "asc" }, limit: 20 },
      );
      for (const item of unfinished)
        if (item.deadlineAt <= new Date()) {
          item.state = item.executorId ? "uncertain" : "failed";
          item.result = item.executorId
            ? "Provider deadline elapsed; execution may have occurred. Not automatically retried."
            : "Expired before delivery.";
        }
      const invocation = unfinished.find((item) => ["queued", "running"].includes(item.state));
      if (!invocation || (invocation.executorId && invocation.executorId !== executorId)) {
        await em.flush();
        return null;
      }
      invocation.executorId = executorId;
      const revision = await em.findOneOrFail(CommandRevision, invocation.revisionId);
      const definition = revision.commands.find((item) => item.name === invocation.command)!;
      await em.flush();
      return { invocation, definition };
    });
  }
  async receive(
    principal: GatewayPrincipal,
    sessionId: string,
    executorId: string,
    invocationId: string,
    type: "accepted" | "progress" | "completed" | "failed" | "uncertain",
    text?: string,
  ) {
    await this.em.transactional(async (em) => {
      await this.session(em, principal, sessionId);
      const invocation = await em.findOne(CommandInvocation, {
        id: invocationId,
        applicationId: principal.applicationId,
      });
      if (!invocation || invocation.executorId !== executorId) throw missing();
      const hash = digest({ type, text: text ?? null });
      if (["completed", "failed", "uncertain"].includes(invocation.state)) {
        // A lost acknowledgement may replay an older nonterminal frame after completion.
        // Acknowledge it without regressing the authoritative terminal state.
        if (type === "accepted" || type === "progress") return;
        if (invocation.terminalDigest === hash) return;
        throw conflict("Invocation already has a terminal outcome.");
      }
      if (invocation.deadlineAt <= new Date())
        throw conflict("Invocation deadline elapsed; recover its status without restarting work.");
      if (type === "accepted") invocation.state = "running";
      else {
        if (invocation.state !== "running")
          throw conflict("Accept the invocation before reporting results.");
        if (type === "progress") invocation.progress = text!;
        else {
          invocation.state = type;
          invocation.result = text!;
          invocation.terminalDigest = hash;
        }
      }
      await em.flush();
    });
  }
}
