import type { Redis, Subscriber } from "./redis";

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

// Fire and forget: a lost ring only costs the listener's timeout.
export async function ring(publisher: Redis, channel: string, onError: (error: unknown) => void) {
  try {
    await publisher.publish(channel, "");
  } catch (error) {
    onError(error);
  }
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

// Cross-process doorbell over Redis pub/sub on the process's one subscriber
// connection; channels are subscribed while at least one local listener exists.
export class RedisDoorbell implements Doorbell {
  private readonly hub = new Hub();
  // One handler for every channel, so the last listener to leave unsubscribes
  // the same function the first one subscribed.
  private readonly deliver = (_message: string, channel: string) => this.hub.deliver(channel);

  constructor(
    private readonly publisher: Redis,
    private readonly subscriber: Subscriber,
    private readonly onError: (error: unknown) => void,
  ) {}

  ring(channel: string) {
    void ring(this.publisher, channel, this.onError);
  }

  listen(channel: string) {
    const { listener, first } = this.hub.add(channel, () => {
      this.subscriber.unsubscribe(channel, this.deliver).catch(this.onError);
    });
    if (first) this.subscriber.subscribe(channel, this.deliver).catch(this.onError);
    return listener;
  }

  async close() {
    this.hub.closeAll();
  }
}
