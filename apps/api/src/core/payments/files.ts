import type { PrismaClient } from "@/core/db";
import type { ObjectStorage } from "@/core/storage";

// Immutable description of a READY file as frozen into a quote's context
// manifest or a stored provider result. Never carries a URL.
export type FileManifestEntry = {
  fileId: string;
  name: string;
  contentType: string;
  size: number;
  sha256: string;
};

type FileRow = { id: string; name: string; contentType: string; size: bigint; sha256: string };

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

// Sorted by file id so the manifest, and any hash over it, is order-independent.
export function fileManifest(rows: FileRow[]): FileManifestEntry[] {
  return rows
    .map((row) => ({
      fileId: row.id,
      name: row.name,
      contentType: row.contentType,
      size: Number(row.size),
      sha256: row.sha256,
    }))
    .sort((left, right) => (left.fileId < right.fileId ? -1 : left.fileId > right.fileId ? 1 : 0));
}

// Reads a manifest written by Payvoke; anything malformed is treated as absent.
export function parseManifest(value: unknown): FileManifestEntry[] | null {
  if (!Array.isArray(value)) return null;
  const entries: FileManifestEntry[] = [];
  for (const item of value) {
    if (
      !record(item) ||
      typeof item.fileId !== "string" ||
      typeof item.name !== "string" ||
      typeof item.contentType !== "string" ||
      !Number.isSafeInteger(item.size) ||
      typeof item.sha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(item.sha256)
    )
      return null;
    entries.push(item as FileManifestEntry);
  }
  return entries;
}

// REC check for a provider result: every listed file is still the READY
// artifact of this invocation with the recorded digest, and its verified
// object is present in storage at the recorded size.
export async function storedFilesIntact(
  db: PrismaClient,
  storage: ObjectStorage,
  invocationId: string,
  manifest: FileManifestEntry[],
) {
  const rows = await db.fileAsset.findMany({
    where: {
      id: { in: manifest.map((entry) => entry.fileId) },
      invocationId,
      purpose: "PROVIDER_ARTIFACT",
      status: "READY",
    },
  });
  if (rows.length !== manifest.length) return false;
  for (const entry of manifest) {
    const row = rows.find((candidate) => candidate.id === entry.fileId);
    if (!row?.objectKey || row.sha256 !== entry.sha256 || Number(row.size) !== entry.size)
      return false;
    const head = await storage.head(row.objectKey);
    if (!head || head.size !== entry.size) return false;
  }
  return true;
}

// Unfinished uploads stay completable this long after their URL expired.
export const UPLOAD_COMPLETION_GRACE_MS = 3600000;

// Expires abandoned uploads and removes their staging objects. Idempotent: a
// failed delete leaves the row EXPIRED and only an orphaned staging object.
export async function expireStaleUploads(db: PrismaClient, storage: ObjectStorage, limit = 100) {
  const stale = await db.fileAsset.findMany({
    where: {
      status: "AWAITING_UPLOAD",
      uploadExpiresAt: { lt: new Date(Date.now() - UPLOAD_COMPLETION_GRACE_MS) },
    },
    select: { id: true, stagingKey: true },
    take: limit,
    orderBy: { uploadExpiresAt: "asc" },
  });
  let expired = 0;
  for (const file of stale) {
    const updated = await db.fileAsset.updateMany({
      where: { id: file.id, status: "AWAITING_UPLOAD" },
      data: { status: "EXPIRED" },
    });
    if (!updated.count) continue;
    expired++;
    await storage.delete(file.stagingKey).catch(() => undefined);
  }
  return expired;
}
