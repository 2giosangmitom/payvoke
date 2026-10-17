import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createProvider,
  manifestVersionId,
  type TextResult,
  type Generate,
} from "../src/server.js";
import { generateLogo, logoDesigner } from "../src/agent.js";
import { logoSource } from "../src/logo-source.js";

const token = "test-integration-token-with-32-characters";
const headers = { authorization: `Bearer ${token}` };
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><circle cx="128" cy="128" r="80" fill="#15803d"/></svg>';
const result: TextResult = {
  text: logoSource(svg),
  usage: { inputTokens: 12, outputTokens: 4 },
  usageSource: "provider-asserted",
};
const input = () => ({
  operationId: randomUUID(),
  generation: 1,
  versionId: manifestVersionId,
  action: "design-logo",
  variant: "default",
  input: { text: "A green leaf symbol for Sprout, a community garden 🌏. No lettering." },
});
const resources: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const cleanup of resources.reverse()) await cleanup();
  resources.length = 0;
  vi.restoreAllMocks();
});
async function setup(generate: Generate = vi.fn(async () => result), timeoutMs?: number) {
  const directory = await mkdtemp("/tmp/opencode/logo-designer-");
  resources.push(() => rm(directory, { recursive: true, force: true }));
  const databasePath = join(directory, "operations.sqlite");
  const app = createProvider({ token, databasePath, generate, timeoutMs });
  resources.push(() => app.close());
  await app.ready();
  return { app, generate, databasePath };
}
async function settle(app: ReturnType<typeof createProvider>, operationId: string) {
  let state;
  for (let i = 0; i < 100; i++) {
    state = (
      await app.inject({ method: "GET", url: `/v1/operations/${operationId}`, headers })
    ).json();
    if (state.status !== "running") return state;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Operation did not settle.");
}

describe("single-purpose logo designer", () => {
  it("deduplicates concurrent starts, recovers results after restart and rejects changed input", async () => {
    const { app, generate, databasePath } = await setup();
    const payload = input();
    const responses = await Promise.all(
      [0, 1].map(() => app.inject({ method: "POST", url: "/v1/operations", headers, payload })),
    );
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 202]);
    const state = await settle(app, payload.operationId);
    expect(state.result).toEqual(result);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/operations",
          headers,
          payload: { ...payload, input: { text: "changed" } },
        })
      ).statusCode,
    ).toBe(409);
    await app.close();
    const restarted = createProvider({ token, databasePath, generate });
    resources.push(() => restarted.close());
    expect(
      (
        await restarted.inject({
          method: "GET",
          url: `/v1/operations/${payload.operationId}`,
          headers,
        })
      ).json(),
    ).toEqual(state);
    expect(
      (await restarted.inject({ method: "POST", url: "/v1/operations", headers, payload }))
        .statusCode,
    ).toBe(200);
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it("requires integration auth for manifest, start, and recovery; rejects broadened authority", async () => {
    const { app, generate } = await setup();
    for (const url of ["/v1/manifest", `/v1/operations/${randomUUID()}`])
      expect((await app.inject({ method: "GET", url })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: "POST", url: "/v1/operations", payload: input() })).statusCode,
    ).toBe(401);
    for (const payload of [
      { ...input(), generation: 2 },
      { ...input(), versionId: randomUUID() },
      { ...input(), variant: "expensive" },
      { ...input(), action: "summarize" },
      { ...input(), tools: [{ name: "pay" }] },
      { ...input(), input: { text: " " } },
      { ...input(), input: { text: "x".repeat(8001) } },
    ])
      expect(
        (await app.inject({ method: "POST", url: "/v1/operations", headers, payload })).statusCode,
      ).toBe(400);
    expect(generate).not.toHaveBeenCalled();
    expect(
      (await app.inject({ method: "GET", url: `/v1/operations/${randomUUID()}`, headers }))
        .statusCode,
    ).toBe(404);
  });
  it("caps concurrency and retains uncertain outcomes without rerunning", async () => {
    let release!: (value: TextResult) => void;
    const generate = vi.fn(
      () =>
        new Promise<TextResult>((resolve) => {
          release = resolve;
        }),
    );
    const { app } = await setup(generate, 20);
    const payload = input();
    expect(
      (await app.inject({ method: "POST", url: "/v1/operations", headers, payload })).statusCode,
    ).toBe(202);
    expect(
      (await app.inject({ method: "POST", url: "/v1/operations", headers, payload: input() }))
        .statusCode,
    ).toBe(429);
    expect((await settle(app, payload.operationId)).status).toBe("uncertain");
    expect(
      (await app.inject({ method: "POST", url: "/v1/operations", headers, payload })).json().status,
    ).toBe("uncertain");
    release(result);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect((await settle(app, payload.operationId)).status).toBe("uncertain");
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it("fences a second process and marks interrupted operations uncertain on restart", async () => {
    const { app, databasePath, generate } = await setup();
    expect(() => createProvider({ token, databasePath, generate })).toThrow();
    await app.close();
    const payload = input();
    const db = new DatabaseSync(databasePath);
    const canonical = JSON.stringify([
      1,
      payload.versionId,
      payload.action,
      payload.variant,
      payload.input.text,
    ]);
    db.prepare("INSERT INTO operations (id,input,status) VALUES (?,?,'running')").run(
      payload.operationId,
      canonical,
    );
    db.close();
    const restarted = createProvider({ token, databasePath, generate });
    resources.push(() => restarted.close());
    expect(
      (await restarted.inject({ method: "POST", url: "/v1/operations", headers, payload })).json(),
    ).toMatchObject({ status: "uncertain", error: "PROCESS_INTERRUPTED" });
    expect(generate).not.toHaveBeenCalled();
  });
  it("sanitizes model errors and rejects oversized output", async () => {
    const generate = vi
      .fn()
      .mockRejectedValueOnce(new Error("secret-api-key / private prompt"))
      .mockResolvedValueOnce({ ...result, text: "x".repeat(32769) });
    const { app } = await setup(generate);
    for (let i = 0; i < 2; i++) {
      const payload = input();
      await app.inject({ method: "POST", url: "/v1/operations", headers, payload });
      const state = await settle(app, payload.operationId);
      expect(state).toMatchObject({ status: "failed", error: "GENERATION_FAILED", result: null });
      expect(JSON.stringify(state)).not.toContain("secret-api-key");
    }
  });
  it("preserves uncertainty when graceful shutdown aborts an in-flight model call", async () => {
    const generate = vi.fn(
      (_text: string, signal: AbortSignal) =>
        new Promise<TextResult>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
        }),
    );
    const { app, databasePath } = await setup(generate);
    const payload = input();
    await app.inject({ method: "POST", url: "/v1/operations", headers, payload });
    await app.close();
    const restarted = createProvider({ token, databasePath, generate });
    resources.push(() => restarted.close());
    expect(
      (await restarted.inject({ method: "POST", url: "/v1/operations", headers, payload })).json(),
    ).toMatchObject({ status: "uncertain", error: "PROCESS_INTERRUPTED" });
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it("uses the actual Mastra Agent with a bounded, tool-free, non-retried call", async () => {
    const generate = vi.spyOn(logoDesigner, "generate").mockResolvedValue({
      text: svg,
      usage: { inputTokens: 12, outputTokens: 4 },
      finishReason: "stop",
    } as Awaited<ReturnType<typeof logoDesigner.generate>>);
    const signal = new AbortController().signal;
    expect(await generateLogo("Design a green logo for Sprout.", signal)).toEqual(result);
    expect(generate).toHaveBeenCalledWith(
      "Design a green logo for Sprout.",
      expect.objectContaining({
        maxSteps: 1,
        toolChoice: "none",
        abortSignal: signal,
        modelSettings: { maxOutputTokens: 2048, maxRetries: 0 },
      }),
    );
  });
  it("does not report prose from the model as a completed logo", async () => {
    vi.spyOn(logoDesigner, "generate").mockResolvedValue({
      text: "Here is a marketing plan instead.",
      usage: {},
      finishReason: "stop",
    } as Awaited<ReturnType<typeof logoDesigner.generate>>);
    await expect(
      generateLogo("Design a green logo.", new AbortController().signal),
    ).rejects.toThrow();
  });
  it("runs the local contract tester against a real HTTP listener using a synthetic responder", async () => {
    const { app, generate } = await setup();
    const origin = await app.listen({ host: "127.0.0.1", port: 0 });
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ["--import", "tsx", "src/contract-test.ts"],
      {
        env: {
          ...process.env,
          PROVIDER_URL: origin,
          PROVIDER_TOKEN: token,
          ALLOW_MODEL_EXPENSE: "1",
        },
        timeout: 15000,
      },
    );
    expect(stdout).toContain("PASS:");
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
