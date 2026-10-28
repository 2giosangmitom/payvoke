// Runs tasks one at a time in call order. Workers use it so a BullMQ job and
// the database sweep never drive the same signing lane concurrently.
export function serial() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task);
    tail = run.catch(() => {});
    return run;
  };
}

// Reports each distinct error tag at most once per window. ioredis retries a few
// times a second during an outage; one line per window is enough to see it.
export function throttled(
  report: (error: unknown) => void,
  tag: (error: unknown) => string,
  ms = 10000,
) {
  const last = new Map<string, number>();
  return (error: unknown) => {
    const key = tag(error);
    const now = Date.now();
    if (now - (last.get(key) ?? -Infinity) < ms) return;
    last.set(key, now);
    report(error);
  };
}
