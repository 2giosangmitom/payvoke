import {
  connectRedis,
  MemoryDoorbell,
  MemoryJobs,
  QueueJobs,
  RedisDoorbell,
  type Doorbell,
  type Jobs,
  type Redis,
} from "@payvoke/queue";

// Cross-process wake-ups and job producers. Postgres stays authoritative: a
// Redis outage only delays SSE readers and workers until their next sweep.
export type Signals = {
  doorbell: Doorbell;
  jobs: Jobs;
  // Shared rate-limit store; absent means process-local limits.
  redis?: Redis;
  close(): Promise<void>;
};

// Single-process signals for tests and tools; never used by the server.
export function memorySignals(): Signals {
  const doorbell = new MemoryDoorbell();
  return { doorbell, jobs: new MemoryJobs(), close: () => doorbell.close() };
}

export async function connectSignals(
  url: string,
  onError: (error: unknown) => void,
): Promise<Signals> {
  const producer = await connectRedis(url, "producer", onError);
  const subscriber = await connectRedis(url, "consumer", onError);
  const doorbell = new RedisDoorbell(producer, subscriber, onError);
  const jobs = new QueueJobs(producer, onError);
  return {
    doorbell,
    jobs,
    redis: producer,
    async close() {
      await doorbell.close();
      await jobs.close();
      producer.disconnect();
    },
  };
}
