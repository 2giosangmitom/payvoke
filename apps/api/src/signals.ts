import {
  connectRedis,
  JobBus,
  MemoryDoorbell,
  MemoryJobs,
  RedisDoorbell,
  RedisJobs,
  type Doorbell,
  type Jobs,
  type Redis,
} from "#core/queue";

// Cross-process wake-ups and job producers. Postgres stays authoritative: a
// Redis outage only delays SSE readers and workers until their next sweep.
export type Signals = {
  doorbell: Doorbell;
  jobs: Jobs;
  // Shared rate-limit store; absent means process-local limits.
  redis?: Redis;
  close(): Promise<void>;
};

// What the in-process workers need: the server's signals plus job consumers.
export type WorkerSignals = Signals & { bus: JobBus };

// Single-process signals for tests and tools; never used by the server.
export function memorySignals(): Signals {
  const doorbell = new MemoryDoorbell();
  return { doorbell, jobs: new MemoryJobs(), close: () => doorbell.close() };
}

// The process's only two Redis connections: commands (publishes and rate
// limits) and one subscriber shared by SSE listeners and the workers.
export async function connectSignals(
  url: string,
  onError: (error: unknown) => void,
): Promise<WorkerSignals> {
  const redis = await connectRedis(url, onError);
  const doorbell = new RedisDoorbell(redis.command, redis.subscriber, onError);
  return {
    doorbell,
    jobs: new RedisJobs(redis.command, onError),
    bus: new JobBus(redis.subscriber),
    redis: redis.command,
    async close() {
      await doorbell.close();
      redis.close();
    },
  };
}
