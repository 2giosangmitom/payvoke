import Ajv2020 from "ajv/dist/2020.js";
import { hashSnapshot, type Json } from "@payvoke/shared/protocol";
import type { PrismaClient } from "#core/db";
import type { ObjectStorage } from "#core/storage";
import { parseManifest, storedFilesIntact } from "./files";
import { recordPaymentDelivery } from "./finance";

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

// A paid run waiting for host verification of its stored result.
const awaiting = {
  executionStatus: "VERIFYING" as const,
  settlement: { state: "HELD" as const },
  run: { state: "VERIFYING" },
};

// Oldest runs awaiting verification, for the sweep that re-enqueues jobs a
// crashed producer never added.
export async function pendingVerifications(db: PrismaClient, limit = 100) {
  const rows = await db.invocation.findMany({
    where: awaiting,
    select: { id: true, run: { select: { result: true } } },
    take: limit,
    orderBy: { createdAt: "asc" },
  });
  return rows.flatMap((row) => {
    const result = row.run?.result;
    return object(result) && Number.isSafeInteger(result.artifactVersion)
      ? [{ invocationId: row.id, artifactVersion: result.artifactVersion as number }]
      : [];
  });
}

// Trusted host-side verification for one stored result. A well-formed result
// the app key reported is SIGN (and must still match an output schema when an
// older revision declared one); a result whose every file is still the READY,
// intact artifact of this invocation in storage is REC. File results need `storage` and are
// left pending without it. Provider reports never directly create delivery
// evidence or unlock payment; the decision uses the stored immutable result
// and snapshotted schema. Returns whether evidence was recorded. Safe to
// repeat: the evidence id is derived from the invocation and artifact version.
export async function verifyStructuredDelivery(
  db: PrismaClient,
  invocationId: string,
  storage: ObjectStorage | null = null,
) {
  const invocation = await db.invocation.findFirst({
    where: { id: invocationId, ...awaiting },
    select: {
      id: true,
      quote: { select: { document: true, commandRevisionId: true } },
      run: { select: { result: true } },
    },
  });
  if (!invocation) return false;
  const result = invocation.run?.result;
  const document = invocation.quote.document;
  if (!object(result) || !object(document) || !object(document.inputSnapshot)) return false;
  if (!Number.isSafeInteger(result.artifactVersion) || (result.artifactVersion as number) < 1)
    return false;
  const files = parseManifest(result.files);
  if (!files) return false;
  if (!invocation.quote.commandRevisionId) return false;
  const command = await db.appCommandRevision.findUnique({
    where: { id: invocation.quote.commandRevisionId },
    select: { outputSchema: true },
  });
  if (!command) return false;
  const output = (result.output ?? null) as Json;
  if (output === null && !files.length) return false;
  if (command.outputSchema) {
    if (!object(command.outputSchema)) return false;
    const validate = new Ajv2020({ strict: true, useDefaults: false }).compile(
      command.outputSchema,
    );
    if (!validate(output)) return false;
  }
  if (files.length && (!storage || !(await storedFilesIntact(db, storage, invocation.id, files))))
    return false;
  await recordPaymentDelivery(db, {
    id: `${files.length ? "files" : "structured"}-${invocation.id}-${result.artifactVersion}`,
    invocationId: invocation.id,
    artifactVersion: result.artifactVersion as number,
    outputHash: hashSnapshot(output),
    verifier: files.length ? "payvoke-host-files-v1" : "payvoke-host-result-v1",
    accessInterruptionSeconds: 0,
    // SIGN: the app-key-reported output bound to invocation and artifact version.
    // REC: additionally, every listed file was received intact (M05).
    evidenceLevel: files.length ? "REC" : "SIGN",
    files: files.map(({ fileId, sha256, size }) => ({ fileId, sha256, size })),
  });
  return true;
}

// Verifies every pending run once; returns how many gained evidence.
export async function verifyStructuredDeliveries(
  db: PrismaClient,
  storage: ObjectStorage | null = null,
) {
  let verified = 0;
  for (const { invocationId } of await pendingVerifications(db, 20))
    if (await verifyStructuredDelivery(db, invocationId, storage)) verified++;
  return verified;
}
