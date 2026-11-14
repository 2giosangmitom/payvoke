import type { Cradle } from "../../container";
import type { App, AppCommandRevision, Prisma } from "#core/db";
import { sameJson } from "@payvoke/shared/x402";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnprocessableEntityError,
} from "../../errors";
import { serializeOwnedCommand } from "../apps/serializers";
import { parseCommandBody, type CommandBody, type CommandDefinition } from "./provider.validation";

const commandInclude = { activeRevision: true } as const;
const MAX_COMMANDS = 25;

// Commands are versioned: every create or edit writes an immutable revision
// and points the command at it. Quotes reference the revision they priced.
export class ProviderCommandService {
  private readonly db: Cradle["db"];

  constructor({ db }: Cradle) {
    this.db = db;
  }

  // Checks a parsed definition against the active deployment policy and the
  // app's other command names.
  private async admit(appId: string, definition: CommandDefinition, commandId?: string) {
    await this.admitTerms(definition);
    const duplicate = await this.db.appCommand.findFirst({
      where: { appId, name: definition.name, NOT: commandId ? { id: commandId } : undefined },
    });
    if (duplicate) throw new ConflictError("COMMAND_NAME_TAKEN");
  }

  private async admitTerms({ revision }: CommandDefinition) {
    const policy = await this.db.deploymentPolicy.findUnique({ where: { activeSlot: "active" } });
    if (
      !policy ||
      revision.deliverySeconds +
        revision.reviewSeconds +
        policy.resolutionGraceSeconds +
        policy.quoteLifetimeSeconds >
        policy.maxHoldSeconds
    )
      throw new BadRequestError("TERMS_EXCEED_POLICY");
    // A slightly late delivery still needs its whole review before resolveBy,
    // which leaves only the resolution grace for lateness.
    const late = (revision.terms as { latePolicy?: { graceSeconds: number } }).latePolicy;
    if (late && late.graceSeconds >= policy.resolutionGraceSeconds)
      throw new BadRequestError("TERMS_EXCEED_POLICY");
    // Payvoke sponsors hold and release gas, so offers never go below the
    // approved floor; a cap under it would leave no valid price at all.
    if (
      revision.maxGrossAmount !== null &&
      BigInt(revision.maxGrossAmount) < BigInt(policy.minGrossAmount.toFixed(0))
    )
      throw new UnprocessableEntityError("PRICE_BELOW_FLOOR");
  }

  private revisionData(commandId: string, { revision }: CommandDefinition) {
    return {
      commandId,
      options: revision.options as unknown as Prisma.InputJsonValue,
      inputSchema: revision.inputSchema as Prisma.InputJsonValue,
      positionalParameter: revision.positionalParameter,
      maxGrossAmount: revision.maxGrossAmount,
      terms: revision.terms as Prisma.InputJsonValue,
      deliverySeconds: revision.deliverySeconds,
      reviewSeconds: revision.reviewSeconds,
    };
  }

  // Whether an active revision already states this definition.
  private unchanged(
    command: { description: string; activeRevision: AppCommandRevision | null },
    definition: CommandDefinition,
  ) {
    const active = command.activeRevision;
    if (!active || command.description !== definition.description) return false;
    const { revision } = definition;
    // Stored JSON drops undefined fields; compare the same shape.
    const stored = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown;
    return (
      sameJson(active.options, stored(revision.options)) &&
      sameJson(active.terms, stored(revision.terms)) &&
      active.positionalParameter === revision.positionalParameter &&
      (active.maxGrossAmount?.toFixed(0) ?? null) === revision.maxGrossAmount &&
      active.outputSchema === null
    );
  }

  async list(appId: string) {
    const commands = await this.db.appCommand.findMany({
      where: { appId, archivedAt: null },
      include: commandInclude,
      orderBy: { createdAt: "asc" },
    });
    return commands.map(serializeOwnedCommand);
  }

  async create(app: App, body: CommandBody | undefined) {
    const definition = parseCommandBody(body);
    await this.admit(app.id, definition);
    const command = await this.db.$transaction(async (tx) => {
      const created = await tx.appCommand.create({
        data: { appId: app.id, name: definition.name, description: definition.description },
      });
      const revision = await tx.appCommandRevision.create({
        data: this.revisionData(created.id, definition),
      });
      return tx.appCommand.update({
        where: { id: created.id },
        data: { activeRevisionId: revision.id },
        include: commandInclude,
      });
    });
    return serializeOwnedCommand(command);
  }

  // Optimistic concurrency: `expectedRevisionId` must name the active revision.
  async update(app: App, commandId: string, body: CommandBody | undefined) {
    const current = await this.db.appCommand.findFirst({
      where: { id: commandId, appId: app.id, archivedAt: null },
      include: commandInclude,
    });
    if (!current) throw new NotFoundError("COMMAND_NOT_FOUND");
    if (
      body?.expectedRevisionId !== undefined &&
      body.expectedRevisionId !== current.activeRevisionId
    )
      throw new ConflictError("REVISION_CONFLICT");
    const definition = parseCommandBody(body);
    await this.admit(app.id, definition, current.id);
    const updated = await this.db.$transaction(async (tx) => {
      const revision = await tx.appCommandRevision.create({
        data: this.revisionData(current.id, definition),
      });
      return tx.appCommand.update({
        where: { id: current.id },
        data: {
          name: definition.name,
          description: definition.description,
          activeRevisionId: revision.id,
        },
        include: commandInclude,
      });
    });
    return serializeOwnedCommand(updated);
  }

  // Bulk overwrite, like Discord's application command sync: the body is the
  // app's whole command list. Commands match by name; unchanged ones keep
  // their revision, changed ones get a new revision and missing ones are
  // archived. The default stays when it survives, else the first command.
  async overwrite(app: App, body: unknown) {
    if (!Array.isArray(body) || body.length > MAX_COMMANDS)
      throw new BadRequestError("INVALID_COMMANDS");
    const definitions = body.map((item) => parseCommandBody(item as CommandBody));
    if (new Set(definitions.map((item) => item.name)).size !== definitions.length)
      throw new BadRequestError("DUPLICATE_COMMAND_NAME");
    for (const definition of definitions) await this.admitTerms(definition);
    await this.db.$transaction(async (tx) => {
      const current = await tx.appCommand.findMany({
        where: { appId: app.id, archivedAt: null },
        include: commandInclude,
      });
      const byName = new Map(current.map((command) => [command.name, command]));
      const kept: string[] = [];
      for (const definition of definitions) {
        const existing = byName.get(definition.name);
        if (existing && this.unchanged(existing, definition)) {
          kept.push(existing.id);
          continue;
        }
        const command =
          existing ??
          (await tx.appCommand.create({
            data: { appId: app.id, name: definition.name, description: definition.description },
          }));
        const revision = await tx.appCommandRevision.create({
          data: this.revisionData(command.id, definition),
        });
        await tx.appCommand.update({
          where: { id: command.id },
          data: { description: definition.description, activeRevisionId: revision.id },
        });
        kept.push(command.id);
      }
      await tx.appCommand.updateMany({
        where: { appId: app.id, archivedAt: null, id: { notIn: kept } },
        data: { archivedAt: new Date() },
      });
      const defaultCommandId =
        app.defaultCommandId && kept.includes(app.defaultCommandId)
          ? app.defaultCommandId
          : (kept[0] ?? null);
      if (defaultCommandId !== app.defaultCommandId)
        await tx.app.update({ where: { id: app.id }, data: { defaultCommandId } });
    });
    return this.list(app.id);
  }

  async archive(app: App, commandId: string) {
    const archived = await this.db.$transaction(async (tx) => {
      const changed = await tx.appCommand.updateMany({
        where: { id: commandId, appId: app.id, archivedAt: null },
        data: { archivedAt: new Date() },
      });
      if (!changed.count) return false;
      if (app.defaultCommandId === commandId)
        await tx.app.update({ where: { id: app.id }, data: { defaultCommandId: null } });
      return true;
    });
    if (!archived) throw new NotFoundError("COMMAND_NOT_FOUND");
    return { archived: true };
  }

  async setDefault(app: App, commandId: string) {
    const command = await this.db.appCommand.findFirst({
      where: { id: commandId, appId: app.id, archivedAt: null, activeRevisionId: { not: null } },
      select: { id: true },
    });
    if (!command) throw new BadRequestError("COMMAND_NOT_READY");
    await this.db.app.update({ where: { id: app.id }, data: { defaultCommandId: command.id } });
    return { defaultCommandId: command.id };
  }
}
