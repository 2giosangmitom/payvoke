import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { WebSocketServer } from "ws";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderClient, type SlashCommand } from "../src/index.js";

const cleanups: (() => Promise<unknown> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
const apiKey = `ane_${"a".repeat(43)}`;
const command: SlashCommand = {
  name: "logo",
  description: "One logo",
  inputSchema: {
    type: "object",
    properties: { brief: { type: "string", maxLength: 8000 } },
    required: ["brief"],
    additionalProperties: false,
  },
};
async function fixture() {
  const applicationId = randomUUID();
  const revisionId = randomUUID();
  const id = randomUUID();
  const directory = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "agentne-sdk-"));
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
  const inv = {
    id,
    revisionId,
    command: "logo",
    input: { brief: "Moon" },
    deadlineAt: new Date(Date.now() + 60_000).toISOString(),
    developmentOnly: true,
  };
  let dropResultAck = false;
  let dropped = false;
  let busyOnce = false;
  const received: { type: string; text?: string }[] = [];
  const server = createServer((req, res) => {
    expect(req.headers.authorization).toBe(`Bearer ${apiKey}`);
    expect(req.method).toBe("PUT");
    expect(req.url).toBe(`/v1/provider/applications/${applicationId}/commands`);
    let body = "";
    req.on("data", (data) => {
      body += data.toString();
    });
    req.on("end", () => {
      expect(JSON.parse(body)).toEqual({ commands: [command] });
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ id: revisionId, digest: "a".repeat(64), commands: [command] }));
    });
  });
  const gateway = new WebSocketServer({ server });
  let connections = 0;
  gateway.on("connection", (socket, req) => {
    connections++;
    expect(req.headers.authorization).toBe(`Bearer ${apiKey}`);
    expect(req.url).toBe("/v1/provider/gateway");
    socket.send(JSON.stringify({ type: "hello", protocol: "provider-gateway-v1" }));
    socket.on("message", (raw) => {
      const frame = JSON.parse(raw.toString());
      received.push(frame);
      if (frame.type === "identify") {
        if (busyOnce) {
          busyOnce = false;
          socket.send(JSON.stringify({ type: "error", code: "GATEWAY_BUSY" }));
          socket.close(4429, "Old lease still active");
          return;
        }
        socket.send(JSON.stringify({ type: "ready", protocol: "provider-gateway-v1" }));
        socket.send(
          JSON.stringify({
            type: "command.invoked",
            invocation: inv,
            eventId: id,
            definition: command,
          }),
        );
      } else {
        if (frame.type === "completed" && dropResultAck && !dropped) {
          dropped = true;
          socket.terminate();
          return;
        }
        socket.send(
          JSON.stringify({
            type: "ack",
            requestId: frame.requestId,
            invocationId: frame.invocationId,
          }),
        );
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing listener.");
  cleanups.push(async () => {
    for (const client of gateway.clients) client.terminate();
    await new Promise<void>((resolve) => gateway.close(() => resolve()));
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const errors: Error[] = [];
  const options = {
    applicationId,
    baseUrl: `http://127.0.0.1:${address.port}`,
    apiKey,
    journalPath: join(directory, "journal.sqlite"),
    onError: (error: Error) => errors.push(error),
  };
  return {
    options,
    revisionId,
    received,
    errors,
    busy: () => {
      busyOnce = true;
    },
    dropAck: () => {
      dropResultAck = true;
    },
    connections: () => connections,
  };
}
describe("provider SDK", () => {
  it("registers explicitly and survives a lost completion acknowledgement without rerunning a handler", async () => {
    const fixtureValue = await fixture();
    const client = new ProviderClient(fixtureValue.options);
    cleanups.push(() => client.close());
    const revision = await client.registerCommands([command]);
    expect(revision.id).toBe(fixtureValue.revisionId);
    const handler = vi.fn(async ({ progress }) => {
      await progress("Working");
      return "Inert SVG source";
    });
    client.onCommand("logo", revision.id, handler);
    fixtureValue.dropAck();
    await client.connect();
    await vi.waitFor(
      () =>
        expect(
          fixtureValue.received.filter((frame) => frame.type === "completed").length,
        ).toBeGreaterThanOrEqual(2),
      { timeout: 5000 },
    );
    expect(handler).toHaveBeenCalledTimes(1);
    expect(fixtureValue.connections()).toBe(2);
    expect(fixtureValue.errors).toEqual([]);
  });
  it("keeps an interrupted operation uncertain across process recovery", async () => {
    const f = await fixture();
    const client = new ProviderClient(f.options);
    const handler = vi.fn(async () => {
      await new Promise<void>(() => {});
      return "Never";
    });
    client.onCommand("logo", f.revisionId, handler);
    await client.connect();
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
    await client.close();
    // Recreate a crash journal (started record, no terminal receipt).
    const db = new DatabaseSync(f.options.journalPath);
    db.exec("UPDATE invocations SET terminal=NULL");
    db.close();
    const recovered = new ProviderClient(f.options);
    cleanups.push(() => recovered.close());
    const replacement = vi.fn(async () => "Must not run");
    recovered.onCommand("logo", f.revisionId, replacement);
    await recovered.connect();
    await vi.waitFor(() =>
      expect(f.received.some((frame) => frame.type === "uncertain")).toBe(true),
    );
    expect(replacement).not.toHaveBeenCalled();
    expect(f.errors).toEqual([]);
  });
  it("rejects another process using the journal and fences mismatched command revisions", async () => {
    const f = await fixture();
    const client = new ProviderClient(f.options);
    cleanups.push(() => client.close());
    expect(() => new ProviderClient(f.options)).toThrow();
    const handler = vi.fn(async () => "Must not run");
    client.onCommand("logo", randomUUID(), handler);
    await client.connect();
    await vi.waitFor(() => expect(f.received.some((frame) => frame.type === "failed")).toBe(true));
    expect(handler).not.toHaveBeenCalled();
  });
  it("refuses insecure remote endpoints and credential-bearing URLs", () => {
    const options = {
      apiKey,
      applicationId: randomUUID(),
      journalPath: ":memory:",
      onError: () => {},
    };
    expect(() => new ProviderClient({ ...options, baseUrl: "http://example.com" })).toThrow(
      "HTTPS",
    );
    expect(() => new ProviderClient({ ...options, baseUrl: "https://key@example.com" })).toThrow(
      "credentials",
    );
  });
  it("retries a surviving Gateway lease after a backend restart", async () => {
    const f = await fixture();
    f.busy();
    const client = new ProviderClient(f.options);
    cleanups.push(() => client.close());
    const handler = vi.fn(async () => "Recovered");
    client.onCommand("logo", f.revisionId, handler);
    await client.connect();
    await vi.waitFor(() =>
      expect(f.received.some((frame) => frame.type === "completed")).toBe(true),
    );
    expect(f.connections()).toBe(2);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(f.errors).toEqual([]);
  });
  it("rejects a text result whose JSON encoding would overflow a Gateway frame", async () => {
    const f = await fixture();
    const client = new ProviderClient(f.options);
    cleanups.push(() => client.close());
    client.onCommand("logo", f.revisionId, async () => "\u0000".repeat(16000));
    await client.connect();
    await vi.waitFor(() => expect(f.received.some((frame) => frame.type === "failed")).toBe(true));
    expect(f.received.some((frame) => frame.type === "completed")).toBe(false);
    expect(f.connections()).toBe(1);
  });
});
