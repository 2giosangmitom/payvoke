import type { Cradle } from "../../container";
import { ConflictError, NotFoundError } from "../../errors";
import { serializeOwnedApp, serializeOwnedCommand } from "../apps/serializers";
import type { AppPatch, NewApp } from "./provider.validation";

const appSelect = {
  id: true,
  name: true,
  description: true,
  visibility: true,
  status: true,
  payoutAddress: true,
  defaultCommandId: true,
  lastHeartbeatAt: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

// Owner-side app lifecycle. Callers resolve ownership through `owned()` first.
export class ProviderAppService {
  private readonly db: Cradle["db"];

  constructor({ db }: Cradle) {
    this.db = db;
  }

  async owned(ownerId: string, appId: string) {
    const app = await this.db.app.findFirst({ where: { id: appId, ownerId, archivedAt: null } });
    if (!app) throw new NotFoundError("APP_NOT_FOUND");
    return app;
  }

  // Idempotent on (owner, clientRequestId): a replay with the same fields
  // returns the original app; different fields are a conflict.
  async create(ownerId: string, { clientRequestId, fields }: NewApp) {
    const where = { ownerId_clientRequestId: { ownerId, clientRequestId } };
    const prior = await this.db.app.findUnique({ where, select: appSelect });
    if (prior) {
      if (
        prior.name !== fields.name ||
        prior.description !== fields.description ||
        prior.payoutAddress !== fields.payoutAddress ||
        prior.visibility !== fields.visibility
      )
        throw new ConflictError("IDEMPOTENCY_CONFLICT");
      return { created: false, app: serializeOwnedApp(prior) };
    }
    const app = await this.db.app.upsert({
      where,
      create: { ownerId, clientRequestId, ...fields },
      update: {},
      select: appSelect,
    });
    return { created: true, app: serializeOwnedApp(app) };
  }

  async list(ownerId: string) {
    const apps = await this.db.app.findMany({
      where: { ownerId, archivedAt: null },
      select: appSelect,
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return apps.map(serializeOwnedApp);
  }

  async detail(app: Awaited<ReturnType<ProviderAppService["owned"]>>) {
    const commands = await this.db.appCommand.findMany({
      where: { appId: app.id, archivedAt: null },
      include: { activeRevision: true },
      orderBy: { createdAt: "asc" },
    });
    return { ...serializeOwnedApp(app), commands: commands.map(serializeOwnedCommand) };
  }

  async update(appId: string, data: AppPatch) {
    return serializeOwnedApp(
      await this.db.app.update({ where: { id: appId }, data, select: appSelect }),
    );
  }

  // Archiving also revokes keys so a provider worker cannot keep acting on it.
  async archive(appId: string) {
    await this.db.$transaction([
      this.db.app.update({
        where: { id: appId },
        data: { status: "ARCHIVED", archivedAt: new Date() },
      }),
      this.db.appApiKey.updateMany({
        where: { appId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { archived: true };
  }

  async suspend(appId: string) {
    await this.db.app.update({ where: { id: appId }, data: { status: "SUSPENDED" } });
    return { status: "SUSPENDED" };
  }

  async activate(appId: string) {
    await this.db.app.update({
      where: { id: appId },
      data: { status: "ACTIVE", archivedAt: null },
    });
    return { status: "ACTIVE" };
  }
}
