import { Queue, type JobsOptions } from "bullmq";
import { Redis } from "ioredis";

export const queues = {
  delivery: "delivery-verify",
  settlement: "settlement",
  finance: "finance",
} as const;

export type InvocationJob = { invocationId: string };

// Producer side of the job queues. Callers enqueue only after their Postgres
// transaction has committed, and nothing here throws: every consumer keeps a
// database sweep, so a lost job only delays work it would have found anyway.
export interface Jobs {
  verifyDelivery(invocationId: string, artifactVersion: number): Promise<void>;
  settle(invocationId: string): Promise<void>;
  wakeFinance(): Promise<void>;
  // Wakes finance just after a hold deadline; both times are chain seconds.
  financeDue(invocationId: string, dueAt: bigint, now: bigint): Promise<void>;
  close(): Promise<void>;
}

// Finished and failed jobs are dropped so the sweep can re-add the same job id;
// handlers are idempotent and failures are logged by the consuming worker.
const defaults: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: true,
  removeOnFail: true,
};
// Finality on Fuji trails wall time slightly; wake a little after the deadline.
const DUE_SLACK_MS = 5000;

export class QueueJobs implements Jobs {
  private readonly delivery: Queue;
  private readonly settlement: Queue;
  private readonly finance: Queue;

  constructor(
    connection: Redis,
    private readonly onError: (error: unknown) => void,
  ) {
    const options = { connection, defaultJobOptions: defaults };
    this.delivery = new Queue(queues.delivery, options);
    this.settlement = new Queue(queues.settlement, options);
    this.finance = new Queue(queues.finance, options);
    for (const queue of [this.delivery, this.settlement, this.finance]) queue.on("error", onError);
  }

  private async add(queue: Queue, name: string, data: object, opts: JobsOptions) {
    try {
      await queue.add(name, data, opts);
    } catch (error) {
      this.onError(error);
    }
  }

  verifyDelivery(invocationId: string, artifactVersion: number) {
    return this.add(
      this.delivery,
      "verify",
      { invocationId },
      { jobId: `verify-${invocationId}-${artifactVersion}` },
    );
  }

  settle(invocationId: string) {
    return this.add(
      this.settlement,
      "settle",
      { invocationId },
      { jobId: `settle-${invocationId}` },
    );
  }

  wakeFinance() {
    return this.add(this.finance, "wake", {}, { deduplication: { id: "finance-wake", ttl: 2000 } });
  }

  financeDue(invocationId: string, dueAt: bigint, now: bigint) {
    const seconds = dueAt > now ? Number(dueAt - now) : 0;
    return this.add(
      this.finance,
      "due",
      { invocationId },
      { jobId: `due-${invocationId}-${dueAt}`, delay: seconds * 1000 + DUE_SLACK_MS },
    );
  }

  async close() {
    await Promise.all([this.delivery.close(), this.settlement.close(), this.finance.close()]);
  }
}

// Records calls instead of enqueuing; used by tests and single-process tools.
export class MemoryJobs implements Jobs {
  readonly calls: { name: string; args: unknown[] }[] = [];

  async verifyDelivery(invocationId: string, artifactVersion: number) {
    this.calls.push({ name: "verifyDelivery", args: [invocationId, artifactVersion] });
  }

  async settle(invocationId: string) {
    this.calls.push({ name: "settle", args: [invocationId] });
  }

  async wakeFinance() {
    this.calls.push({ name: "wakeFinance", args: [] });
  }

  async financeDue(invocationId: string, dueAt: bigint, now: bigint) {
    this.calls.push({ name: "financeDue", args: [invocationId, dueAt, now] });
  }

  async close() {}
}

// Producers fail fast while Redis is down instead of queueing commands in
// memory; workers and subscribers retry forever, as BullMQ requires.
// `onError` is attached before connecting, so no error is ever unhandled.
export async function connectRedis(
  url: string,
  role: "producer" | "consumer",
  onError: (error: unknown) => void,
) {
  const redis = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: role === "producer" ? 1 : null,
    enableOfflineQueue: role === "consumer",
  });
  redis.on("error", onError);
  await redis.connect();
  return redis;
}
