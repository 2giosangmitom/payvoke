import type { FastifyReply } from "fastify";

export type EventStream = {
  readonly open: boolean;
  // False once the client is gone or the socket applies backpressure.
  send(id: string | bigint, event: string, data: unknown): boolean;
  comment(text: string): void;
};

// Takes over the raw response for a long-lived text/event-stream. `run` loops
// while `stream.open`; the response is always ended when it returns or throws.
export async function eventStream(
  reply: FastifyReply,
  cacheControl: string,
  run: (stream: EventStream) => Promise<void>,
) {
  reply.hijack();
  const raw = reply.raw;
  raw.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": cacheControl,
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  raw.write(": connected\n\n");
  let closed = false;
  // IncomingMessage "close" can fire as soon as the GET request completes;
  // the response is the long-lived half of an SSE connection.
  raw.on("close", () => {
    closed = true;
  });
  const stream: EventStream = {
    get open() {
      return !closed && !raw.destroyed;
    },
    send(id, event, data) {
      if (!this.open) return false;
      if (!raw.write(`id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        closed = true;
      return !closed;
    },
    comment(text) {
      raw.write(`: ${text}\n\n`);
    },
  };
  try {
    await run(stream);
  } finally {
    raw.end();
  }
}
