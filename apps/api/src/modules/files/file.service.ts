import { randomUUID } from "node:crypto";
import type { Cradle } from "../../container";
import type { FileAsset, Prisma } from "#core/db";
import {
  fileManifest,
  parseManifest,
  UPLOAD_COMPLETION_GRACE_MS,
  type FileManifestEntry,
} from "#core/payments/files";
import type { ObjectStorage } from "#core/storage";
import {
  BadRequestError,
  ConflictError,
  GoneError,
  NotFoundError,
  PayloadTooLargeError,
  ServiceUnavailableError,
  isUniqueViolation,
} from "../../errors";
import { fileFields } from "../apps/schema";
import { object } from "../runs/protocol";
import type { Work } from "../runs/provider-run.service";
import type { BuyerUploadBody, UploadBody } from "./file.schemas";

export const MAX_CONTEXT_FILES = 10;

// One manifest from several sources, each file once, in manifest order.
export function fileManifestUnion(...lists: FileManifestEntry[][]): FileManifestEntry[] {
  const byId = new Map(lists.flat().map((entry) => [entry.fileId, entry]));
  return [...byId.values()].sort((a, b) =>
    a.fileId < b.fileId ? -1 : a.fileId > b.fileId ? 1 : 0,
  );
}
export const MAX_RESULT_FILES = 10;
const MAX_INVOCATION_ARTIFACTS = 50;

type Owner = {
  purpose: "BUYER_INPUT" | "PROVIDER_ARTIFACT";
  uploadScope: string;
  ownerId?: string;
  threadId?: string;
  appId?: string;
  invocationId?: string;
};

const view = (file: FileAsset) => ({
  id: file.id,
  purpose: file.purpose,
  status: file.status,
  name: file.name,
  contentType: file.contentType,
  size: Number(file.size),
  sha256: file.sha256,
  durationMs: file.durationMs,
  peaks: file.peaks,
  threadId: file.threadId,
  invocationId: file.invocationId,
  rejectionCode: file.rejectionCode,
  readyAt: file.readyAt,
  createdAt: file.createdAt,
});

// The file ids a stored provider result or quote context lists.
const manifestIds = (value: unknown) => parseManifest(value)?.map((entry) => entry.fileId) ?? [];

// Buyer inputs and provider artifacts share one lifecycle: presigned PUT to a
// staging key, then a server-side completion that copies the bytes to a key no
// upload URL can reach, re-hashes that copy and only then marks it READY.
export class FileService {
  private readonly db: Cradle["db"];
  private readonly config: Cradle["config"];
  private readonly storage: Cradle["storage"];

  constructor({ db, config, storage }: Cradle) {
    this.db = db;
    this.config = config;
    this.storage = storage;
  }

  get enabled() {
    return this.storage !== null;
  }

  private store(): ObjectStorage {
    if (!this.storage) throw new ServiceUnavailableError("FILES_DISABLED");
    return this.storage;
  }

  async requestBuyerUpload(buyerId: string, body: BuyerUploadBody) {
    const storage = this.store();
    const thread = await this.db.chatThread.findFirst({
      where: { id: body.threadId, buyerId, archivedAt: null, kind: "CHAT" },
      select: { id: true },
    });
    if (!thread) throw new NotFoundError("THREAD_NOT_FOUND");
    const owner: Owner = {
      purpose: "BUYER_INPUT",
      uploadScope: `account:${buyerId}`,
      ownerId: buyerId,
      threadId: thread.id,
    };
    return this.request(storage, owner, body);
  }

  // Artifacts belong to one held invocation whose current run was acknowledged.
  async requestProviderUpload(invocation: Work, body: UploadBody) {
    const storage = this.store();
    if (!invocation.run?.acknowledgedAt) throw new ConflictError("RUN_NOT_ACKED");
    const owner: Owner = {
      purpose: "PROVIDER_ARTIFACT",
      uploadScope: `app:${invocation.quote.appId}`,
      appId: invocation.quote.appId,
      invocationId: invocation.id,
    };
    return this.request(storage, owner, body);
  }

  // Idempotent on (uploadScope, clientRequestId); a replay re-signs the same
  // staging key without extending the original upload deadline.
  private async request(storage: ObjectStorage, owner: Owner, body: UploadBody) {
    if (body.size > this.config.FILE_MAX_BYTES) throw new PayloadTooLargeError("FILE_TOO_LARGE");
    if (body.audio && !body.contentType.startsWith("audio/"))
      throw new BadRequestError("INVALID_UPLOAD");
    const key = { uploadScope: owner.uploadScope, clientRequestId: body.clientRequestId };
    let file = await this.db.fileAsset.findUnique({ where: { uploadScope_clientRequestId: key } });
    if (!file) {
      if (owner.invocationId) {
        const count = await this.db.fileAsset.count({
          where: { invocationId: owner.invocationId },
        });
        if (count >= MAX_INVOCATION_ARTIFACTS) throw new ConflictError("FILE_LIMIT_REACHED");
      }
      const id = randomUUID();
      try {
        file = await this.db.fileAsset.create({
          data: {
            id,
            ...owner,
            clientRequestId: body.clientRequestId,
            name: body.name,
            contentType: body.contentType,
            size: BigInt(body.size),
            sha256: body.sha256,
            ...(body.audio
              ? { durationMs: body.audio.durationMs, peaks: body.audio.peaks ?? [] }
              : {}),
            stagingKey: `staging/${id}`,
            uploadExpiresAt: new Date(Date.now() + this.config.FILE_UPLOAD_TTL_SECONDS * 1000),
          },
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        file = await this.db.fileAsset.findUniqueOrThrow({
          where: { uploadScope_clientRequestId: key },
        });
      }
    }
    if (
      file.name !== body.name ||
      file.contentType !== body.contentType ||
      file.size !== BigInt(body.size) ||
      file.sha256 !== body.sha256 ||
      file.threadId !== (owner.threadId ?? null) ||
      file.invocationId !== (owner.invocationId ?? null)
    )
      throw new ConflictError("IDEMPOTENCY_CONFLICT");
    const remaining = Math.floor((file.uploadExpiresAt.getTime() - Date.now()) / 1000);
    const upload =
      file.status === "AWAITING_UPLOAD" && remaining >= 1
        ? await storage.presignPut(
            file.stagingKey,
            { contentType: file.contentType, size: Number(file.size) },
            remaining,
          )
        : null;
    return { file: view(file), upload };
  }

  async completeBuyer(buyerId: string, fileId: string) {
    return this.complete(
      await this.db.fileAsset.findFirst({
        where: { id: fileId, uploadScope: `account:${buyerId}` },
      }),
    );
  }

  async completeProvider(invocation: Work, fileId: string) {
    return this.complete(
      await this.db.fileAsset.findFirst({
        where: {
          id: fileId,
          uploadScope: `app:${invocation.quote.appId}`,
          invocationId: invocation.id,
        },
      }),
    );
  }

  private async complete(file: FileAsset | null) {
    const storage = this.store();
    if (!file) throw new NotFoundError("FILE_NOT_FOUND");
    if (file.status !== "AWAITING_UPLOAD") return view(file);
    if (file.uploadExpiresAt.getTime() + UPLOAD_COMPLETION_GRACE_MS < Date.now())
      throw new GoneError("UPLOAD_EXPIRED");
    if (!(await storage.head(file.stagingKey))) throw new ConflictError("UPLOAD_NOT_FOUND");
    // Verify a private copy: the staging key stays writable until its URL expires.
    const objectKey = `files/${file.id}/${randomUUID()}`;
    await storage.copy(file.stagingKey, objectKey);
    const copied = await storage.head(objectKey);
    const digest = await storage.sha256(objectKey);
    const rejection =
      copied?.size !== Number(file.size)
        ? "SIZE_MISMATCH"
        : digest !== file.sha256
          ? "CHECKSUM_MISMATCH"
          : null;
    const settled = await this.db.fileAsset.updateMany({
      where: { id: file.id, status: "AWAITING_UPLOAD" },
      data: rejection
        ? { status: "REJECTED", rejectionCode: rejection }
        : { status: "READY", objectKey, readyAt: new Date() },
    });
    // A concurrent completion already settled the file; this copy is unused.
    if (rejection || !settled.count) await storage.delete(objectKey);
    if (settled.count) await storage.delete(file.stagingKey).catch(() => undefined);
    return view(await this.db.fileAsset.findUniqueOrThrow({ where: { id: file.id } }));
  }

  // A buyer reads their own inputs, and artifacts of their invocations once a
  // run's accepted result lists them.
  async buyerDownload(buyerId: string, fileId: string, inline = false) {
    const storage = this.store();
    const file = await this.db.fileAsset.findUnique({ where: { id: fileId } });
    if (!file || file.status !== "READY") throw new NotFoundError("FILE_NOT_FOUND");
    let allowed = file.purpose === "BUYER_INPUT" && file.ownerId === buyerId;
    if (file.purpose === "PROVIDER_ARTIFACT" && file.invocationId) {
      const invocation = await this.db.invocation.findFirst({
        where: { id: file.invocationId, buyerId },
        select: { runs: { select: { result: true } } },
      });
      allowed = !!invocation?.runs.some(
        (run) => object(run.result) && manifestIds(run.result.files).includes(file.id),
      );
    }
    if (!allowed) throw new NotFoundError("FILE_NOT_FOUND");
    if (inline && !/^(audio|image)\//.test(file.contentType))
      throw new BadRequestError("INLINE_NOT_SUPPORTED");
    return this.sign(storage, file, inline);
  }

  // A provider reads only the inputs frozen into this invocation's quote.
  async providerDownload(invocation: Work, fileId: string) {
    const storage = this.store();
    const document = invocation.quote.document as Record<string, unknown>;
    const snapshot = object(document.inputSnapshot) ? document.inputSnapshot : {};
    const context = object(snapshot.context) ? snapshot.context : {};
    if (!manifestIds(context.files).includes(fileId)) throw new NotFoundError("FILE_NOT_FOUND");
    const file = await this.db.fileAsset.findFirst({
      where: { id: fileId, purpose: "BUYER_INPUT", status: "READY" },
    });
    if (!file) throw new NotFoundError("FILE_NOT_FOUND");
    return this.sign(storage, file);
  }

  private async sign(storage: ObjectStorage, file: FileAsset, inline = false) {
    if (!file.objectKey) throw new NotFoundError("FILE_NOT_FOUND");
    const target = await storage.presignGet(
      file.objectKey,
      { filename: file.name, contentType: file.contentType, inline },
      this.config.FILE_DOWNLOAD_TTL_SECONDS,
    );
    return { fileId: file.id, name: file.name, ...target };
  }

  // Buyer files selected for a quote: READY inputs of this buyer and thread.
  async contextFiles(
    tx: Prisma.TransactionClient,
    buyerId: string,
    threadId: string,
    fileIds: string[],
  ): Promise<FileManifestEntry[]> {
    if (!fileIds.length) return [];
    if (fileIds.length > MAX_CONTEXT_FILES) throw new BadRequestError("TOO_MANY_FILES");
    const rows = await tx.fileAsset.findMany({
      where: {
        id: { in: fileIds },
        purpose: "BUYER_INPUT",
        status: "READY",
        ownerId: buyerId,
        threadId,
      },
    });
    if (rows.length !== fileIds.length) throw new BadRequestError("INVALID_CONTEXT_FILES");
    return fileManifest(rows);
  }

  // Files named by the file fields of validated arguments: READY inputs of
  // this buyer and thread, within each field's `accept` and `maxBytes`.
  async argumentFiles(
    tx: Prisma.TransactionClient,
    buyerId: string,
    threadId: string,
    schema: unknown,
    args: Record<string, unknown>,
  ): Promise<FileManifestEntry[]> {
    const wanted = fileFields(schema).flatMap((field) => {
      const value = args[field.name];
      const ids = field.multiple ? ((value as string[] | undefined) ?? []) : value ? [value] : [];
      return (ids as string[]).map((id) => ({ id, field }));
    });
    if (!wanted.length) return [];
    if (!this.enabled) throw new BadRequestError("FILES_NOT_SUPPORTED");
    const entries = await this.contextFiles(tx, buyerId, threadId, [
      ...new Set(wanted.map((item) => item.id)),
    ]).catch(() => {
      throw new BadRequestError("INVALID_ARGUMENT_FILES");
    });
    const byId = new Map(entries.map((entry) => [entry.fileId, entry]));
    for (const { id, field } of wanted) {
      const entry = byId.get(id)!;
      const accepted =
        !field.accept ||
        field.accept.some((type) =>
          type.endsWith("/*")
            ? entry.contentType.startsWith(type.slice(0, -1))
            : entry.contentType === type,
        );
      if (!accepted || (field.maxBytes !== undefined && entry.size > field.maxBytes))
        throw new BadRequestError("INVALID_ARGUMENT_FILES");
    }
    return entries;
  }

  // Normalizes a result's `files: [{fileId}]` into the frozen manifest.
  async resultFiles(invocation: Work, files: unknown[]): Promise<FileManifestEntry[]> {
    if (!files.length) return [];
    if (!this.enabled) throw new BadRequestError("FILES_NOT_SUPPORTED");
    const ids = files.map((item) =>
      object(item) && typeof item.fileId === "string" && Object.keys(item).length === 1
        ? item.fileId
        : null,
    );
    if (
      ids.length > MAX_RESULT_FILES ||
      ids.some((id) => id === null) ||
      new Set(ids).size !== ids.length
    )
      throw new BadRequestError("INVALID_RESULT_FILES");
    const rows = await this.db.fileAsset.findMany({
      where: {
        id: { in: ids as string[] },
        purpose: "PROVIDER_ARTIFACT",
        status: "READY",
        appId: invocation.quote.appId,
        invocationId: invocation.id,
      },
    });
    if (rows.length !== ids.length) throw new BadRequestError("INVALID_RESULT_FILES");
    return fileManifest(rows);
  }
}
