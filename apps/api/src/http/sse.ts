import type { Context } from "hono";
import { errorTag } from "#core/runtime";

export type EventStream = {
  readonly open: boolean;
  // False once the client is gone or stops reading fast enough.
  send(id: string | bigint, event: string, data: unknown): boolean;
  comment(text: string): void;
};

// Bytes queued for a client before it counts as too slow. The client then
// reconnects with Last-Event-ID instead of the server buffering without bound.
const BACKLOG_BYTES = 1 << 20;
const encoder = new TextEncoder();

// A long-lived text/event-stream. `run` loops while `stream.open`; the response
// always ends when it returns or throws. Middleware headers (CORS for a
// credentialed EventSource, security headers) apply as for any response.
export function eventStream(
  c: Context,
  cacheControl: string,
  run: (stream: EventStream) => Promise<void>,
) {
  let closed = false;
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>(
    {
      start(ready) {
        controller = ready;
      },
      cancel() {
        closed = true;
      },
    },
    { highWaterMark: BACKLOG_BYTES, size: (chunk) => chunk?.byteLength ?? 0 },
  );
  c.req.raw.signal.addEventListener("abort", () => {
    closed = true;
  });
  const write = (text: string) => {
    if (closed) return false;
    controller.enqueue(encoder.encode(text));
    if ((controller.desiredSize ?? 0) <= 0) closed = true;
    return !closed;
  };
  const stream: EventStream = {
    get open() {
      return !closed;
    },
    send(id, event, data) {
      return write(`id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    comment(text) {
      write(`: ${text}\n\n`);
    },
  };
  write(": connected\n\n");
  run(stream)
    .catch((error) => console.error(`Event stream failed (${errorTag(error)})`))
    .finally(() => {
      closed = true;
      try {
        controller.close();
      } catch {
        /* Already cancelled by the client. */
      }
    });
  return c.body(body, 200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": cacheControl,
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
}
