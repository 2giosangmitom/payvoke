import assert from "node:assert/strict";
import { describe, it } from "bun:test";
import {
  connectRedis,
  JobBus,
  MemoryDoorbell,
  queues,
  RedisDoorbell,
  RedisJobs,
  serial,
  throttled,
  type Doorbell,
  type Job,
} from "#core/queue";

// Redis-backed cases run only against a disposable Redis:
// REDIS_TEST_URL=redis://… bun test test/core/queue.test.ts
const redisUrl = process.env.REDIS_TEST_URL;

const elapsed = async (run: () => Promise<void>) => {
  const start = performance.now();
  await run();
  return performance.now() - start;
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function doorbellContract(name: string, make: () => Promise<Doorbell>) {
  describe(name, () => {
    it("wakes a waiting listener on ring and times out otherwise", async () => {
      const bell = await make();
      const listener = bell.listen("thread:a");
      // Let a Redis SUBSCRIBE land before ringing.
      await sleep(50);
      const woken = elapsed(() => listener.wait(5000));
      bell.ring("thread:a");
      assert.ok((await woken) < 1000);
      assert.ok((await elapsed(() => listener.wait(100))) >= 90);
      listener.close();
      await bell.close();
    });

    it("latches a ring that arrives between waits and isolates channels", async () => {
      const bell = await make();
      const a = bell.listen("thread:a");
      const b = bell.listen("thread:b");
      await sleep(50);
      bell.ring("thread:a");
      await sleep(50);
      assert.ok((await elapsed(() => a.wait(5000))) < 20);
      assert.ok((await elapsed(() => b.wait(100))) >= 90);
      a.close();
      b.close();
      await bell.close();
    });

    it("keeps a channel subscribed until its last listener leaves", async () => {
      const bell = await make();
      const first = bell.listen("thread:c");
      const second = bell.listen("thread:c");
      await sleep(50);
      first.close();
      bell.ring("thread:c");
      assert.ok((await elapsed(() => second.wait(5000))) < 1000);
      second.close();
      // The message can beat the PUBLISH reply; let it land before closing.
      await sleep(20);
      await bell.close();
    });
  });
}

doorbellContract("MemoryDoorbell", async () => new MemoryDoorbell());

// An in-process stand-in for the subscriber connection.
function fakeSubscriber() {
  const handlers = new Map<string, Set<(message: string, channel: string) => void>>();
  return {
    publish(channel: string, job: Job) {
      for (const handler of handlers.get(channel) ?? []) handler(JSON.stringify(job), channel);
    },
    async subscribe(channel: string, handler: (message: string, channel: string) => void) {
      handlers.set(channel, (handlers.get(channel) ?? new Set()).add(handler));
    },
    async unsubscribe(channel: string, handler: (message: string, channel: string) => void) {
      handlers.get(channel)?.delete(handler);
    },
  };
}

describe("JobBus", () => {
  it("runs a waiting key once and reruns a key that arrives while it runs", async () => {
    const subscriber = fakeSubscriber();
    const seen: string[] = [];
    let release = () => {};
    const consumer = await new JobBus(subscriber).consume(
      "delivery",
      async (job) => {
        if (job.kind !== "verify") return;
        seen.push(`${job.invocationId}-${job.artifactVersion}`);
        if (seen.length === 1) await new Promise<void>((resolve) => (release = resolve));
      },
      { concurrency: 1, onFailed: assert.fail },
    );
    const verify = (artifactVersion: number): Job => ({
      kind: "verify",
      invocationId: "inv-1",
      artifactVersion,
    });
    subscriber.publish(queues.delivery, verify(1));
    await sleep(5);
    // inv-1-1 runs; inv-1-2 waits for the one slot, and its duplicate is dropped.
    subscriber.publish(queues.delivery, verify(2));
    subscriber.publish(queues.delivery, verify(2));
    // A repeat of the running key runs again once it finishes.
    subscriber.publish(queues.delivery, verify(1));
    release();
    await sleep(20);
    assert.deepEqual(seen, ["inv-1-1", "inv-1-2", "inv-1-1"]);
    await consumer.close();
  });

  it("delays due jobs, retries with backoff and reports the final failure", async () => {
    const subscriber = fakeSubscriber();
    const runs: number[] = [];
    const failures: unknown[] = [];
    const start = performance.now();
    const consumer = await new JobBus(subscriber).consume(
      "finance",
      async () => {
        runs.push(performance.now() - start);
        throw new Error("boom");
      },
      { concurrency: 1, onFailed: (error) => failures.push(error), backoffMs: 20 },
    );
    const due: Job = { kind: "due", invocationId: "inv-1", dueAt: "1000", delayMs: 50 };
    subscriber.publish(queues.finance, due);
    subscriber.publish(queues.finance, due);
    await sleep(200);
    // One delayed run, then retries 20 ms and 40 ms later.
    assert.equal(runs.length, 3);
    assert.ok(runs[0] >= 45);
    assert.ok(runs[2] - runs[0] >= 55);
    assert.equal(failures.length, 1);
    await consumer.close();
  });

  it("stops timers on close and ignores malformed messages", async () => {
    const subscriber = fakeSubscriber();
    let runs = 0;
    const consumer = await new JobBus(subscriber).consume("finance", async () => void runs++, {
      concurrency: 1,
      onFailed: assert.fail,
    });
    for (const handler of ["not json", "{}", "null"])
      subscriber.publish(queues.finance, handler as unknown as Job);
    subscriber.publish(queues.finance, {
      kind: "due",
      invocationId: "inv-1",
      dueAt: "1",
      delayMs: 30,
    });
    await consumer.close();
    await sleep(60);
    assert.equal(runs, 0);
  });
});

if (redisUrl) {
  const fail = (error: unknown) => {
    throw error;
  };

  doorbellContract("RedisDoorbell", async () => {
    const redis = await connectRedis(redisUrl, fail);
    const bell = new RedisDoorbell(redis.command, redis.subscriber, fail);
    return {
      ring: (channel) => bell.ring(channel),
      listen: (channel) => bell.listen(channel),
      close: async () => {
        await bell.close();
        redis.close();
      },
    };
  });

  describe("RedisJobs", () => {
    it("publishes jobs to the bus and delays finance deadlines from chain time", async () => {
      const redis = await connectRedis(redisUrl, fail);
      const jobs = new RedisJobs(redis.command, fail);
      const seen: Job[] = [];
      const consumer = await new JobBus(redis.subscriber).consume(
        "finance",
        async (job) => void seen.push(job),
        { concurrency: 1, onFailed: fail },
      );
      // Capture the published deadline without waiting for it.
      const raw: string[] = [];
      const capture = (message: string) => void raw.push(message);
      await redis.subscriber.subscribe(queues.finance, capture);
      await jobs.wakeFinance();
      await jobs.financeDue("inv-1", 1_000n, 940n);
      await sleep(100);
      assert.deepEqual(seen, [{ kind: "wake" }]);
      assert.deepEqual(JSON.parse(raw[1]), {
        kind: "due",
        invocationId: "inv-1",
        dueAt: "1000",
        delayMs: 65_000,
      });
      await consumer.close();
      redis.close();
    });

    it("reports instead of throwing when Redis is unreachable", async () => {
      const errors: unknown[] = [];
      const redis = await connectRedis(redisUrl, fail);
      const jobs = new RedisJobs(redis.command, (error) => errors.push(error));
      redis.close();
      await jobs.wakeFinance();
      assert.ok(errors.length >= 1);
    });
  });
}

describe("serial", () => {
  it("runs tasks one at a time and survives a failing task", async () => {
    const lane = serial();
    const order: string[] = [];
    const slow = lane(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      order.push("slow");
    });
    const failing = lane(async () => {
      order.push("failing");
      throw new Error("boom");
    });
    const fast = lane(async () => order.push("fast"));
    await slow;
    await assert.rejects(failing, /boom/);
    await fast;
    assert.deepEqual(order, ["slow", "failing", "fast"]);
  });
});

describe("throttled", () => {
  it("reports each error tag once per window", () => {
    const seen: unknown[] = [];
    const report = throttled(
      (error) => seen.push(error),
      (error) => String(error),
      10000,
    );
    report("a");
    report("a");
    report("b");
    assert.deepEqual(seen, ["a", "b"]);
  });
});
