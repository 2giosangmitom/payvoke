import { bodyLimit } from "hono/body-limit";
import { getConnInfo } from "hono/bun";
import { createMiddleware } from "hono/factory";
import type { Redis } from "#core/queue";
import { PayloadTooLargeError } from "../errors";
import type { AppEnv } from "./context";

export const maxBody = (maxSize: number) =>
  bodyLimit({
    maxSize,
    onError: () => {
      throw new PayloadTooLargeError("PAYLOAD_TOO_LARGE");
    },
  });

// The limit for routes that set none. Hono's body limit buffers a chunked body
// whole, so NDJSON streams skip it: their route reads incrementally and stops
// at its own bound.
export const defaultBodyLimit = (maxSize: number) => {
  const limit = maxBody(maxSize);
  return createMiddleware(async (c, next) => {
    if (c.req.header("content-type")?.split(";")[0].trim() === "application/x-ndjson")
      return next();
    return limit(c, next);
  });
};

// Fixed-window counters per client address and route. The store is Redis when
// the server has one, so limits hold across replicas; tests and tools count in
// process memory. No proxy headers are trusted.
export type RateStore = { hit(key: string, windowMs: number): Promise<number> };

export function memoryRateStore(): RateStore {
  const windows = new Map<string, { count: number; resetAt: number }>();
  return {
    async hit(key, windowMs) {
      const now = Date.now();
      const current = windows.get(key);
      if (!current || current.resetAt <= now) {
        windows.set(key, { count: 1, resetAt: now + windowMs });
        return 1;
      }
      return ++current.count;
    },
  };
}

export function redisRateStore(redis: Redis): RateStore {
  return {
    async hit(key, windowMs) {
      const name = `payvoke-rl:${key}`;
      // One command per request, atomic with the expiry of the window's first hit.
      return (await redis.eval(
        "local c = redis.call('INCR', KEYS[1]) if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end return c",
        1,
        name,
        windowMs,
      )) as number;
    },
  };
}

const address = (c: Parameters<typeof getConnInfo>[0]) => {
  try {
    return getConnInfo(c).remote.address ?? "local";
  } catch {
    // app.request() in tests has no socket.
    return "local";
  }
};

// `max` requests per minute for one route and client. A store error lets the request
// through rather than failing it; the limit is abuse control, not accounting.
export const rateLimit = (name: string, max: number) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const { rateStore } = c.var.cradle;
    // MCP tools call the API in process, without a socket: count those per
    // buyer token rather than all as one "local" client.
    const token = /^Bearer pvb_([a-f0-9]{16})\./.exec(c.req.header("authorization") ?? "")?.[1];
    let count = 0;
    try {
      count = await rateStore.hit(`${name}:${token ? `pvb_${token}` : address(c)}`, 60000);
    } catch {
      count = 0;
    }
    if (count > max) {
      c.header("Retry-After", "60");
      return c.json({ error: "RATE_LIMITED" }, 429);
    }
    await next();
  });
