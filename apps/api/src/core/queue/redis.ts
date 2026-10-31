import { RedisClient } from "bun";

export type { RedisClient as Redis } from "bun";

type Handler = (message: string, channel: string) => void;

// Bun reconnects on its own but does not restore server-side subscriptions,
// and it keeps its own listener map across the reconnect. Every channel is
// held here with one dispatching listener and re-subscribed after each
// reconnect: unsubscribe first, so Bun does not deliver each message twice.
export class Subscriber {
  private readonly channels = new Map<string, Set<Handler>>();
  private closed = false;

  constructor(
    private readonly client: RedisClient,
    private readonly onError: (error: unknown) => void,
  ) {
    client.onconnect = () => {
      for (const channel of this.channels.keys()) {
        client
          .unsubscribe(channel)
          .then(() => (this.channels.has(channel) ? this.attach(channel) : undefined))
          .catch(onError);
      }
    };
  }

  private attach(channel: string) {
    return this.client.subscribe(channel, (message) => {
      for (const handler of this.channels.get(channel) ?? []) handler(message, channel);
    });
  }

  async subscribe(channel: string, handler: Handler) {
    const existing = this.channels.get(channel);
    if (existing) {
      existing.add(handler);
      return;
    }
    this.channels.set(channel, new Set([handler]));
    await this.attach(channel);
  }

  async unsubscribe(channel: string, handler: Handler) {
    const set = this.channels.get(channel);
    if (this.closed || !set?.delete(handler) || set.size) return;
    this.channels.delete(channel);
    try {
      await this.client.unsubscribe(channel);
    } catch (error) {
      // Closing the connection rejects what was still in flight; that is not an outage.
      if (!this.closed) throw error;
    }
  }

  close() {
    this.closed = true;
    this.channels.clear();
    this.client.close();
  }
}

// Bun gives up after `maxRetries` reconnects (2 s apart at most); the process
// keeps trying for as long as it runs.
const RETRY_FOREVER = 2 ** 31 - 1;

// One command connection and one subscriber connection per process. Commands
// fail fast while Redis is down instead of queueing in memory; subscriptions
// wait for the reconnect. Both must connect at startup.
export async function connectRedis(url: string, onError: (error: unknown) => void) {
  const command = new RedisClient(url, { maxRetries: RETRY_FOREVER, enableOfflineQueue: false });
  const listening = new RedisClient(url, { maxRetries: RETRY_FOREVER });
  try {
    await Promise.all([command.connect(), listening.connect()]);
  } catch (error) {
    command.close();
    listening.close();
    throw error;
  }
  const subscriber = new Subscriber(listening, onError);
  return {
    command,
    subscriber,
    close() {
      subscriber.close();
      command.close();
    },
  };
}
