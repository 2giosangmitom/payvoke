import { setTimeout as delay } from "node:timers/promises";
import type { PrismaClient } from "#core/db";
import { errorTag } from "#core/runtime";
import type { ObjectStorage } from "#core/storage";
import { logger } from "../logging";

const log = logger("worker", "cleanup");

const SWEEP_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
// Objects younger than this may belong to a write whose row is not committed
// yet (an image is stored before the app row points at it).
const ORPHAN_GRACE_MS = DAY_MS;

export type CleanupOptions = { staleAppDays: number; unusedAccountDays: number };

// Agents offline for `staleAppDays` (or never connected since creation) leave
// the store. One that never sold a job is archived and its keys revoked; one
// with paid history is made private so its record and owner stay intact.
export async function retireStaleApps(db: PrismaClient, days: number, now = new Date()) {
  const cutoff = new Date(now.getTime() - days * DAY_MS);
  const stale = {
    status: "ACTIVE" as const,
    archivedAt: null,
    OR: [{ lastHeartbeatAt: { lt: cutoff } }, { lastHeartbeatAt: null, createdAt: { lt: cutoff } }],
  };
  const sold = { quotes: { some: { invocation: { isNot: null } } } };
  const unsold = await db.app.findMany({ where: { ...stale, NOT: sold }, select: { id: true } });
  const ids = unsold.map((app) => app.id);
  if (ids.length)
    await db.$transaction([
      db.app.updateMany({
        where: { id: { in: ids } },
        data: { status: "ARCHIVED", archivedAt: now },
      }),
      db.appApiKey.updateMany({
        where: { appId: { in: ids }, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
  const hidden = await db.app.updateMany({
    where: { ...stale, ...sold, visibility: "PUBLIC" },
    data: { visibility: "PRIVATE" },
  });
  return { archived: ids.length, hidden: hidden.count };
}

// Accounts older than `days` that never did anything: no agent, chat, quote,
// paid job, spending grant or rating. Sessions, wallets and auth accounts
// cascade with the user row.
export async function deleteUnusedAccounts(db: PrismaClient, days: number, now = new Date()) {
  const cutoff = new Date(now.getTime() - days * DAY_MS);
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      select u.id from "user" u
      where u."createdAt" < ${cutoff}
        and not exists (select 1 from apps a where a."ownerId" = u.id)
        and not exists (select 1 from chat_threads t where t."buyerId" = u.id)
        and not exists (select 1 from quotes q where q."buyerId" = u.id)
        and not exists (select 1 from invocations i where i."buyerId" = u.id)
        and not exists (select 1 from vault_grants g where g."userId" = u.id)
        and not exists (select 1 from grant_operations o where o."userId" = u.id)
        and not exists (select 1 from app_ratings r where r."userId" = u.id)
        and not exists (select 1 from file_assets f where f."ownerId" = u.id)
      limit 500
      for update of u skip locked`;
    const ids = rows.map((row) => row.id);
    if (!ids.length) return 0;
    await tx.$executeRaw`delete from app_stars where "userId" = any(${ids})`;
    await tx.$executeRaw`delete from buyer_access_tokens where "userId" = any(${ids})`;
    await tx.$executeRaw`delete from user_profiles where "userId" = any(${ids})`;
    return tx.$executeRaw`delete from "user" where id = any(${ids})`;
  });
}

// Deletes stored objects that no row references. Staging and final file keys,
// agent pictures and profile pictures are the only things the API stores.
// Staged inputs for instant purchases that no purchase bound within a day.
// Expiring the row drops its object key, so the orphan sweep deletes the bytes.
export async function expireUnboundStaged(db: PrismaClient, now = new Date()) {
  const { count } = await db.fileAsset.updateMany({
    where: {
      purpose: "BUYER_INPUT",
      status: "READY",
      threadId: null,
      readyAt: { lt: new Date(now.getTime() - DAY_MS) },
    },
    data: { status: "EXPIRED", objectKey: null },
  });
  return count;
}

export async function deleteOrphanObjects(
  db: PrismaClient,
  storage: ObjectStorage,
  now = new Date(),
) {
  const rows = await db.$queryRaw<{ key: string }[]>`
    select "objectKey" as key from file_assets where "objectKey" is not null
    union select "stagingKey" from file_assets
    union select "imageKey" from apps where "imageKey" is not null
    union select "imageKey" from user_profiles where "imageKey" is not null`;
  const referenced = new Set(rows.map((row) => row.key));
  let deleted = 0;
  for await (const object of storage.list()) {
    if (referenced.has(object.key)) continue;
    if (now.getTime() - object.lastModified.getTime() < ORPHAN_GRACE_MS) continue;
    await storage.delete(object.key);
    deleted++;
  }
  return deleted;
}

export async function startCleanupWorker(
  db: PrismaClient,
  storage: ObjectStorage | null,
  options: CleanupOptions,
) {
  let stopping = false;
  const stop = new AbortController();
  const loop = (async () => {
    while (!stopping) {
      try {
        const apps = await retireStaleApps(db, options.staleAppDays);
        const accounts = await deleteUnusedAccounts(db, options.unusedAccountDays);
        const staged = await expireUnboundStaged(db);
        const objects = storage ? await deleteOrphanObjects(db, storage) : 0;
        if (apps.archived || apps.hidden || accounts || staged || objects)
          log.info(
            "Cleanup: {archived} archived, {hidden} hidden, {accounts} accounts, {staged} staged files, {objects} objects",
            { ...apps, accounts, staged, objects },
          );
      } catch (error) {
        log.warn("Cleanup sweep failed; will retry ({error})", { error: errorTag(error) });
      }
      if (!stopping) await delay(SWEEP_MS, undefined, { signal: stop.signal }).catch(() => {});
    }
  })();
  return {
    async close() {
      stopping = true;
      stop.abort();
      await loop;
    },
  };
}
