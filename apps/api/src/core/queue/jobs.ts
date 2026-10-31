import type { Redis, Subscriber } from "./redis";

export const queues = {
  delivery: "payvoke:jobs:delivery",
  settlement: "payvoke:jobs:settlement",
  finance: "payvoke:jobs:finance",
} as const;
export type QueueName = keyof typeof queues;

// A job is a wake-up over Redis pub/sub, not a stored record: it costs one
// PUBLISH and nothing while idle. A job published while no worker listens is
// lost, which only delays work: every consumer keeps a database sweep.
export type Job =
  | { kind: "verify"; invocationId: string; artifactVersion: number }
  | { kind: "settle"; invocationId: string }
  | { kind: "wake" }
  // Runs `delayMs` after it is received; lost on restart, like any timer.
  | { kind: "due"; invocationId: string; dueAt: string; delayMs: number };

// Producer side of the job queues. Callers enqueue only after their Postgres
// transaction has committed, and nothing here throws.
export interface Jobs {
  verifyDelivery(invocationId: string, artifactVersion: number): Promise<void>;
  settle(invocationId: string): Promise<void>;
  wakeFinance(): Promise<void>;
  // Wakes finance just after a hold deadline; both times are chain seconds.
  financeDue(invocationId: string, dueAt: bigint, now: bigint): Promise<void>;
  close(): Promise<void>;
}

// Finality on Fuji trails wall time slightly; wake a little after the deadline.
const DUE_SLACK_MS = 5000;

export class RedisJobs implements Jobs {
  constructor(
    private readonly publisher: Redis,
    private readonly onError: (error: unknown) => void,
  ) {}

  private async publish(queue: QueueName, job: Job) {
    try {
      await this.publisher.publish(queues[queue], JSON.stringify(job));
    } catch (error) {
      this.onError(error);
    }
  }

  verifyDelivery(invocationId: string, artifactVersion: number) {
    return this.publish("delivery", { kind: "verify", invocationId, artifactVersion });
  }

  settle(invocationId: string) {
    return this.publish("settlement", { kind: "settle", invocationId });
  }

  wakeFinance() {
    return this.publish("finance", { kind: "wake" });
  }

  financeDue(invocationId: string, dueAt: bigint, now: bigint) {
    const seconds = dueAt > now ? Number(dueAt - now) : 0;
    return this.publish("finance", {
      kind: "due",
      invocationId,
      dueAt: String(dueAt),
      delayMs: seconds * 1000 + DUE_SLACK_MS,
    });
  }

  async close() {}
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

// One key per job: a job already waiting is not added twice, and one arriving
// while its key runs runs once more afterwards.
const jobKey = (job: Job) => {
  switch (job.kind) {
    case "verify":
      return `verify-${job.invocationId}-${job.artifactVersion}`;
    case "settle":
      return `settle-${job.invocationId}`;
    case "wake":
      return "finance-wake";
    case "due":
      return `due-${job.invocationId}-${job.dueAt}`;
  }
};

const parse = (message: string): Job | null => {
  try {
    const job = JSON.parse(message) as Job;
    return job && typeof job === "object" && typeof job.kind === "string" ? job : null;
  } catch {
    return null;
  }
};

export type ConsumerOptions = {
  concurrency: number;
  // Called once a job has failed every attempt.
  onFailed(error: unknown): void;
  attempts?: number;
  backoffMs?: number;
};

export type Consumer = { close(): Promise<void> };

// Consumer side: runs each queue's jobs in this process with per-key
// deduplication, delays, bounded concurrency and retries with exponential
// backoff.
export class JobBus {
  constructor(private readonly subscriber: Pick<Subscriber, "subscribe" | "unsubscribe">) {}

  async consume(
    queue: QueueName,
    handler: (job: Job) => Promise<unknown>,
    { concurrency, onFailed, attempts = 3, backoffMs = 5000 }: ConsumerOptions,
  ): Promise<Consumer> {
    // Keys waiting for a timer or a free slot, and keys running now.
    const waiting = new Set<string>();
    const running = new Map<string, { again: Job | null }>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const slots: (() => void)[] = [];
    const tasks = new Set<Promise<void>>();
    let active = 0;
    let closed = false;

    const later = (ms: number, run: () => void) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        run();
      }, ms);
      timers.add(timer);
    };

    // A released slot passes straight to the next waiter, in arrival order.
    const slot = () => {
      if (active < concurrency) {
        active++;
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => slots.push(resolve));
    };
    const release = () => {
      const next = slots.shift();
      if (next) next();
      else active--;
    };

    const run = (key: string, job: Job, attempt: number) => {
      const task = (async () => {
        await slot();
        if (closed) return release();
        waiting.delete(key);
        running.set(key, { again: null });
        let failure: unknown = null;
        try {
          await handler(job);
        } catch (error) {
          failure = error;
        }
        const { again } = running.get(key)!;
        running.delete(key);
        release();
        if (closed) return;
        if (failure !== null && attempt < attempts) {
          waiting.add(key);
          later(backoffMs * 2 ** (attempt - 1), () => run(key, job, attempt + 1));
        } else {
          if (failure !== null) onFailed(failure);
          if (again) add(again);
        }
      })();
      tasks.add(task);
      void task.finally(() => tasks.delete(task));
    };

    const add = (job: Job) => {
      if (closed) return;
      const key = jobKey(job);
      if (waiting.has(key)) return;
      const current = running.get(key);
      if (current) {
        current.again = job;
        return;
      }
      waiting.add(key);
      if (job.kind === "due") later(Math.max(0, job.delayMs), () => run(key, job, 1));
      else run(key, job, 1);
    };

    const onMessage = (message: string) => {
      const job = parse(message);
      if (job) add(job);
    };
    await this.subscriber.subscribe(queues[queue], onMessage);

    return {
      close: async () => {
        closed = true;
        await this.subscriber.unsubscribe(queues[queue], onMessage).catch(() => {});
        for (const timer of timers) clearTimeout(timer);
        timers.clear();
        for (const resolve of slots.splice(0)) resolve();
        // Settlement and finance may be mid-transaction; let them finish.
        await Promise.all(tasks);
      },
    };
  }
}
