import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Queue } from "bullmq";
import {
  connectRedis,
  MemoryDoorbell,
  queues,
  QueueJobs,
  RedisDoorbell,
  serial,
  throttled,
  type Doorbell,
} from "../src/index";

// Redis-backed cases run only against a disposable Redis:
// REDIS_TEST_URL=redis://… pnpm --filter @payvoke/queue test
const redisUrl = process.env.REDIS_TEST_URL;

const elapsed = async (run: () => Promise<void>) => {
  const start = performance.now();
  await run();
  return performance.now() - start;
};

function doorbellContract(name: string, make: () => Promise<Doorbell>) {
  describe(name, () => {
    it("wakes a waiting listener on ring and times out otherwise", async () => {
      const bell = await make();
      const listener = bell.listen("thread:a");
      // Let a Redis SUBSCRIBE land before ringing.
      await new Promise((resolve) => setTimeout(resolve, 50));
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
      await new Promise((resolve) => setTimeout(resolve, 50));
      bell.ring("thread:a");
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.ok((await elapsed(() => a.wait(5000))) < 20);
      assert.ok((await elapsed(() => b.wait(100))) >= 90);
      a.close();
      b.close();
      await bell.close();
    });
  });
}

doorbellContract("MemoryDoorbell", async () => new MemoryDoorbell());

if (redisUrl) {
  doorbellContract("RedisDoorbell", async () => {
    const fail = (error: unknown) => {
      throw error;
    };
    const publisher = await connectRedis(redisUrl, "producer", fail);
    const subscriber = await connectRedis(redisUrl, "consumer", fail);
    const bell = new RedisDoorbell(publisher, subscriber, fail);
    return {
      ring: (channel) => bell.ring(channel),
      listen: (channel) => bell.listen(channel),
      close: async () => {
        await bell.close();
        publisher.disconnect();
      },
    };
  });

  describe("QueueJobs", () => {
    it("deduplicates job ids and delays finance deadlines from chain time", async () => {
      const errors: unknown[] = [];
      const connection = await connectRedis(redisUrl, "producer", (error) => errors.push(error));
      const jobs = new QueueJobs(connection, (error) => errors.push(error));
      const delivery = new Queue(queues.delivery, { connection });
      const finance = new Queue(queues.finance, { connection });
      await delivery.obliterate({ force: true });
      await finance.obliterate({ force: true });

      await jobs.verifyDelivery("inv-1", 1);
      await jobs.verifyDelivery("inv-1", 1);
      await jobs.verifyDelivery("inv-1", 2);
      assert.equal(await delivery.count(), 2);

      await jobs.financeDue("inv-1", 1_000n, 940n);
      await jobs.financeDue("inv-1", 1_000n, 940n);
      const delayed = await finance.getDelayed();
      assert.equal(delayed.length, 1);
      assert.equal(delayed[0].id, "due-inv-1-1000");
      assert.equal(delayed[0].opts.delay, 65_000);

      assert.deepEqual(errors, []);
      await delivery.obliterate({ force: true });
      await finance.obliterate({ force: true });
      await Promise.all([jobs.close(), delivery.close(), finance.close()]);
      connection.disconnect();
    });

    it("reports instead of throwing when Redis is unreachable", async () => {
      const errors: unknown[] = [];
      const connection = await connectRedis(redisUrl, "producer", (error) => errors.push(error));
      const jobs = new QueueJobs(connection, (error) => errors.push(error));
      connection.disconnect();
      await jobs.wakeFinance();
      assert.ok(errors.length >= 1);
      await jobs.close();
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
