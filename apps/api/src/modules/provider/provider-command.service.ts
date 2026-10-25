import type { Cradle } from "@fastify/awilix";
import type { App, Prisma } from "@payvoke/db";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnprocessableEntityError,
} from "../../errors";
import { serializeOwnedCommand } from "../apps/serializers";
import { parseCommandBody, type CommandBody, type CommandDefinition } from "./provider.validation";

const commandInclude = { activeRevision: true } as const;

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
    const { terms, grossAmount } = definition.revision;
    const policy = await this.db.deploymentPolicy.findUnique({ where: { activeSlot: "active" } });
    if (
      !policy ||
      (terms.deliverySeconds as number) +
        (terms.reviewSeconds as number) +
        policy.resolutionGraceSeconds +
        policy.quoteLifetimeSeconds >
        policy.maxHoldSeconds
    )
      throw new BadRequestError("TERMS_EXCEED_POLICY");
    // Payvoke sponsors hold and release gas; the approved policy floor keeps each
    // paid call above that cost.
    if (BigInt(grossAmount) < BigInt(policy.minGrossAmount.toFixed(0)))
      throw new UnprocessableEntityError("PRICE_BELOW_FLOOR");
    const duplicate = await this.db.appCommand.findFirst({
      where: { appId, name: definition.name, NOT: commandId ? { id: commandId } : undefined },
    });
    if (duplicate) throw new ConflictError("COMMAND_NAME_TAKEN");
  }

  private revisionData(commandId: string, { revision }: CommandDefinition) {
    return {
      commandId,
      options: revision.options as unknown as Prisma.InputJsonValue,
      inputSchema: revision.inputSchema as Prisma.InputJsonValue,
      ...(revision.outputSchema !== undefined
        ? { outputSchema: revision.outputSchema as Prisma.InputJsonValue }
        : {}),
      positionalParameter: revision.positionalParameter,
      grossAmount: revision.grossAmount,
      terms: revision.terms as Prisma.InputJsonValue,
      deliverySeconds: revision.deliverySeconds,
      reviewSeconds: revision.reviewSeconds,
    };
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
