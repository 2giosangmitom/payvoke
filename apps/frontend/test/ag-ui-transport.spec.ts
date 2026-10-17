import { describe, expect, it, vi } from "vitest";
import { HttpAgent } from "@ag-ui/client";
import { createAgUiFetch } from "../src/lib/ag-ui-transport";

const command = { method: "POST", body: JSON.stringify({ runId: "run" }) };
const frame = (id: number, event: object) => `id: ${id}\ndata: ${JSON.stringify(event)}\n\n`;
const events = [
  { type: "RUN_STARTED", threadId: "thread", runId: "run" },
  { type: "TEXT_MESSAGE_START", messageId: "answer", role: "assistant" },
  { type: "TEXT_MESSAGE_CONTENT", messageId: "answer", delta: "Hello 🌏" },
  { type: "TEXT_MESSAGE_END", messageId: "answer" },
  { type: "RUN_FINISHED", threadId: "thread", runId: "run" },
];
function stream(text: string, reset = false) {
  const bytes = new TextEncoder().encode(text);
  return new Response(
    new ReadableStream({
      start(controller) {
        // Split every byte, including inside the emoji and every JSON/SSE boundary.
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
        controller.close();
      },
    }),
    { headers: { "Content-Type": "text/event-stream", "X-Stream-Reset": String(reset) } },
  );
}

describe("AG-UI durable transport", () => {
  it("handles fragmented UTF-8 and JSON with the official HttpAgent", async () => {
    const request = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? Response.json({ runId: "run" })
        : stream(events.map((event, index) => frame(index + 1, event)).join("")),
    );
    const agent = new HttpAgent({
      url: "https://api.test/runs",
      threadId: "thread",
      fetch: createAgUiFetch(request),
    });
    await agent.runAgent({ runId: "run" });
    expect(agent.messages).toMatchObject([
      { id: "answer", role: "assistant", content: "Hello 🌏" },
    ]);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("reconnects with the last complete cursor, without sending the command again", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ runId: "run" }))
      .mockResolvedValueOnce(stream(frame(1, events[0]!) + 'id: 2\ndata: {"type":'))
      .mockResolvedValueOnce(
        stream(
          events
            .slice(1)
            .map((event, index) => frame(index + 2, event))
            .join(""),
        ),
      );
    const response = await createAgUiFetch(request)("https://api.test/runs", command);
    const text = await response.text();
    expect(request.mock.calls[2]![0]).toBe("https://api.test/runs/run/events?after=1");
    expect(request.mock.calls.filter((call) => call[1]?.method === "POST")).toHaveLength(1);
    expect(text.match(/RUN_STARTED/g)).toHaveLength(1);
    expect(text).toContain("Hello 🌏");
    expect(text).not.toContain("�");
  });

  it("replaces partial state after an expired cursor instead of appending it", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ runId: "run" }))
      .mockResolvedValueOnce(stream(frame(1, events[0]!)))
      .mockResolvedValueOnce(
        stream(
          [
            frame(1, events[0]!),
            frame(2, {
              type: "MESSAGES_SNAPSHOT",
              messages: [{ id: "saved", role: "assistant", content: "canonical" }],
            }),
            frame(3, events[4]!),
          ].join(""),
          true,
        ),
      );
    expect(
      await (await createAgUiFetch(request)("https://api.test/runs", command)).text(),
    ).toContain("MESSAGES_SNAPSHOT");
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("recovers a lost command response with identical input and key", async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(Response.json({ runId: "run" }))
      .mockResolvedValueOnce(stream(frame(1, events[4]!)));
    await (await createAgUiFetch(request)("https://api.test/runs", command)).text();
    expect(request.mock.calls[0]![1].body).toBe(request.mock.calls[1]![1].body);
  });

  it("replaces partial messages through the official AG-UI client on reset", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ runId: "run" }))
      .mockResolvedValueOnce(
        stream(
          frame(1, events[0]!) +
            frame(2, events[1]!) +
            frame(3, { ...events[2], delta: "partial" }),
        ),
      )
      .mockResolvedValueOnce(
        stream(
          [
            frame(1, events[0]!),
            frame(2, {
              type: "MESSAGES_SNAPSHOT",
              messages: [{ id: "answer", role: "assistant", content: "canonical" }],
            }),
            frame(3, events[4]!),
          ].join(""),
          true,
        ),
      );
    const agent = new HttpAgent({
      url: "https://api.test/runs",
      threadId: "thread",
      fetch: createAgUiFetch(request),
    });
    await agent.runAgent({ runId: "run" });
    expect(agent.messages).toMatchObject([{ id: "answer", content: "canonical" }]);
    expect(agent.messages).toHaveLength(1);
  });

  it("sends only the new message, keeping stored history authoritative", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ runId: "run" }))
      .mockResolvedValueOnce(stream(frame(1, events[4]!)));
    await (
      await createAgUiFetch(request)("https://api.test/runs", {
        ...command,
        body: JSON.stringify({ runId: "run", messages: [{ id: "old" }, { id: "new" }] }),
      })
    ).text();
    expect(JSON.parse(request.mock.calls[0]![1].body).messages).toEqual([{ id: "new" }]);
  });

  it("does not retry revoked authorization or reconnect by POST", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ runId: "run" }))
      .mockResolvedValueOnce(Response.json({ message: "Unauthorized" }, { status: 401 }));
    await expect(
      (await createAgUiFetch(request)("https://api.test/runs", command)).text(),
    ).rejects.toThrow("session expired");
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("deduplicates replayed events at the cursor boundary", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ runId: "run" }))
      .mockResolvedValueOnce(
        stream(
          events
            .slice(0, 3)
            .map((event, index) => frame(index + 1, event))
            .join(""),
        ),
      )
      .mockResolvedValueOnce(
        stream(
          events
            .slice(2)
            .map((event, index) => frame(index + 3, event))
            .join(""),
        ),
      );
    const response = await createAgUiFetch(request)("https://api.test/runs", command);
    expect((await response.text()).match(/Hello 🌏/g)).toHaveLength(1);
    expect(request.mock.calls[2]![0]).toContain("after=3");
  });
});
