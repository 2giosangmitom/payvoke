import type { FetchLike } from "./session";

export type Waker = {
  // Whether the thread's event stream is open right now.
  readonly live: boolean;
  // Resolves at the next thread event, or when `fallback` does.
  wait(fallback: () => Promise<void>): Promise<void>;
  close(): void;
};

// Wakes the hire loop when the job's thread changes, from the same SSE stream
// the web chat reads (`GET /v1/threads/:id/events`). Events only say "look
// again": the loop re-reads the invocation status, which stays the source of
// truth. If the stream cannot open or drops, waits fall back to polling.
export function threadWaker(http: FetchLike, url: string, parent?: AbortSignal): Waker {
  const controller = new AbortController();
  parent?.addEventListener("abort", () => controller.abort(parent.reason), { once: true });
  let live = false;
  let rung = false;
  let wake: (() => void) | null = null;
  const ring = () => {
    if (wake) {
      const resolve = wake;
      wake = null;
      resolve();
    } else rung = true;
  };
  void (async () => {
    try {
      const response = await http(url, {
        headers: { accept: "text/event-stream" },
        signal: controller.signal,
      });
      if (!response.ok || !response.body) return;
      live = true;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replaceAll("\r\n", "\n");
        let end: number;
        while ((end = buffer.indexOf("\n\n")) >= 0) {
          buffer = buffer.slice(end + 2);
          ring();
        }
      }
    } catch {
      /* Closed, aborted or unsupported: polling carries on. */
    } finally {
      live = false;
      ring();
    }
  })();
  return {
    get live() {
      return live;
    },
    async wait(fallback) {
      if (rung) {
        rung = false;
        return;
      }
      try {
        await Promise.race([new Promise<void>((resolve) => (wake = resolve)), fallback()]);
      } finally {
        wake = null;
      }
    },
    close() {
      controller.abort();
    },
  };
}
