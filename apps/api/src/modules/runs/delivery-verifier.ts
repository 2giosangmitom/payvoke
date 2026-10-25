import Ajv2020 from "ajv/dist/2020.js";
import { hashSnapshot, type Json } from "@payvoke/protocol";
import type { Cradle } from "@fastify/awilix";
import type { PrismaClient } from "@payvoke/db";
import { recordPaymentDelivery } from "@payvoke/payments/finance";
import { object } from "./protocol";

// Trusted host-side verification for inline JSON results. File results require
// a separate artifact/access verifier and are deliberately excluded here.
// Provider reports never directly create delivery evidence or unlock payment.
export async function verifyStructuredDeliveries(db: PrismaClient) {
  const pending = await db.invocation.findMany({
    where: {
      executionStatus: "VERIFYING",
      settlement: { state: "HELD" },
      run: { state: "VERIFYING" },
    },
    select: {
      id: true,
      quote: { select: { document: true, commandRevisionId: true } },
      run: { select: { result: true } },
    },
    take: 20,
    orderBy: { createdAt: "asc" },
  });
  let verified = 0;
  for (const invocation of pending) {
    const result = invocation.run?.result;
    const document = invocation.quote.document;
    if (!object(result) || !object(document) || !object(document.inputSnapshot)) continue;
    if (
      !Number.isSafeInteger(result.artifactVersion) ||
      (result.artifactVersion as number) < 1 ||
      !Array.isArray(result.files) ||
      result.files.length > 0
    )
      continue;
    if (!invocation.quote.commandRevisionId) continue;
    const command = await db.appCommandRevision.findUnique({
      where: { id: invocation.quote.commandRevisionId },
      select: { outputSchema: true },
    });
    if (!command?.outputSchema || !object(command.outputSchema)) continue;
    const validate = new Ajv2020({ strict: true, useDefaults: false }).compile(
      command.outputSchema,
    );
    if (!validate(result.output)) continue;
    await recordPaymentDelivery(db, {
      id: `structured-${invocation.id}-${result.artifactVersion}`,
      invocationId: invocation.id,
      artifactVersion: result.artifactVersion as number,
      outputHash: hashSnapshot(result.output as Json),
      verifier: "payvoke-host-structured-v1",
      accessInterruptionSeconds: 0,
      // Schema-valid output bound to app, invocation and artifact version (M05).
      evidenceLevel: "SIGN",
    });
    verified++;
  }
  return verified;
}

// Background loop, started on app ready and stopped on close by the container
// (asyncInit/asyncDispose). It runs independently of provider report requests;
// a delivery decision uses the stored immutable result and snapshotted schema.
export class DeliveryVerifier {
  private readonly db: Cradle["db"];
  private readonly log: Cradle["log"];
  private readonly intervalMs = 3000;
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor({ db, log }: Cradle) {
    this.db = db;
    this.log = log;
  }

  start() {
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref();
  }

  stop() {
    clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await verifyStructuredDeliveries(this.db);
    } catch (error) {
      this.log.error({ type: (error as Error).name }, "structured delivery verifier failed");
    } finally {
      this.running = false;
    }
  }
}
