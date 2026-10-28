import type { Redis } from "ioredis";

// A doorbell only says "something changed, read Postgres again". It carries no
// data, so a lost ring costs latency (the listener's timeout), never correctness.
export interface Doorbell {
  ring(channel: string): void;
  // Subscribe for the lifetime of one stream. Rings that arrive between two
  // waits are latched, so a reader never sleeps through a change it raced.
  listen(channel: string): Listener;
  close(): Promise<void>;
}

export interface Listener {
  wait(ms: number): Promise<void>;
  close(): void;
}

// Publish-only ring for processes that never listen (workers).
export function ring(publisher: Redis, channel: string, onError: (error: unknown) => void) {
  publisher.publish(channel, "").catch(onError);
}

export const channels = {
  thread: (threadId: string) => `payvoke:thread:${threadId}`,
  app: (appId: string) => `payvoke:app:${appId}`,
};

class LocalListener implements Listener {
  private pending = false;
  private wake: (() => void) | undefined;

  constructor(private readonly detach: (listener: LocalListener) => void) {}

  notify() {
    if (this.wake) this.wake();
    else this.pending = true;
  }

  wait(ms: number) {
    if (this.pending) {
      this.pending = false;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => this.wake?.(), ms);
      this.wake = () => {
        clearTimeout(timer);
        this.wake = undefined;
        resolve();
      };
    });
  }

  close() {
    this.wake?.();
    this.detach(this);
  }
}

// In-process fan-out shared by both doorbells.
class Hub {
  private readonly listeners = new Map<string, Set<LocalListener>>();

  // Returns the listener and whether it is the channel's first one.
  add(channel: string, onEmpty: () => void) {
    const existing = this.listeners.get(channel);
    const set = existing ?? new Set<LocalListener>();
    if (!existing) this.listeners.set(channel, set);
    const first = !existing;
    const listener = new LocalListener((self) => {
      set.delete(self);
      if (set.size === 0 && this.listeners.get(channel) === set) {
        this.listeners.delete(channel);
        onEmpty();
      }
    });
    set.add(listener);
    return { listener, first };
  }

  deliver(channel: string) {
    for (const listener of this.listeners.get(channel) ?? []) listener.notify();
  }

  closeAll() {
    for (const set of this.listeners.values()) for (const listener of set) listener.close();
  }
}

// Single-process doorbell for tests and for deployments with one API instance.
export class MemoryDoorbell implements Doorbell {
  private readonly hub = new Hub();

  ring(channel: string) {
    this.hub.deliver(channel);
  }

  listen(channel: string) {
    return this.hub.add(channel, () => {}).listener;
  }

  async close() {
    this.hub.closeAll();
  }
}

// Cross-process doorbell over Redis pub/sub. One subscriber connection per
// process; channels are subscribed while at least one local listener exists.
export class RedisDoorbell implements Doorbell {
  private readonly hub = new Hub();

  constructor(
    private readonly publisher: Redis,
    private readonly subscriber: Redis,
    private readonly onError: (error: unknown) => void,
  ) {
    subscriber.on("message", (channel: string) => this.hub.deliver(channel));
  }

  ring(channel: string) {
    ring(this.publisher, channel, this.onError);
  }

  listen(channel: string) {
    const { listener, first } = this.hub.add(channel, () => {
      this.subscriber.unsubscribe(channel).catch(this.onError);
    });
    if (first) this.subscriber.subscribe(channel).catch(this.onError);
    return listener;
  }

  async close() {
    this.hub.closeAll();
    this.subscriber.disconnect();
  }
}
