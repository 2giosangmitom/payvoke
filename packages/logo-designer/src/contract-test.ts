import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { manifestVersionId } from "./server.js";
import { logoSource } from "./logo-source.js";

// Explicit opt-in: this local/CI tester may call localhost and may incur ONE real model call.
if (process.env.ALLOW_MODEL_EXPENSE !== "1")
  throw new Error("Set ALLOW_MODEL_EXPENSE=1 to allow one bounded synthetic model call.");
const token = process.env.PROVIDER_TOKEN;
if (!token || token.length < 32) throw new Error("Set the provider integration token.");
const origin = new URL(process.env.PROVIDER_URL ?? "http://127.0.0.1:8200");
if (origin.username || origin.password || !["http:", "https:"].includes(origin.protocol))
  throw new Error("Invalid provider URL.");
const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
async function request(path: string, body?: unknown) {
  return fetch(new URL(path, origin), {
    method: body ? "POST" : "GET",
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
}
const input = {
  operationId: randomUUID(),
  generation: 1,
  versionId: manifestVersionId,
  action: "design-logo",
  variant: "default",
  input: {
    text: "Design one minimal leaf logo symbol for Sprout, a community garden. Use green and simple geometry. No lettering.",
  },
};
assert.equal(
  (
    await fetch(new URL("/v1/manifest", origin), {
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    })
  ).status,
  401,
);
assert.equal((await request("/v1/manifest")).status, 200);
assert.equal((await request("/v1/operations", input)).status, 202);
assert.equal(
  (await request("/v1/operations", { ...input, input: { text: "changed" } })).status,
  409,
);
assert.equal((await request("/v1/operations", input)).status, 200);
let final: { status: string; result?: { text: string } } | undefined;
for (let attempt = 0; attempt < 40; attempt++) {
  const response = await request(`/v1/operations/${input.operationId}`);
  assert.equal(response.status, 200);
  final = (await response.json()) as typeof final;
  if (final?.status !== "running") break;
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
assert.equal(final?.status, "succeeded");
assert.ok(final?.result?.text);
assert.equal(logoSource(final.result.text), final.result.text);
console.log(
  "PASS: authenticated logo design, duplicate/conflict handling, same-operation recovery and restricted SVG source. Not platform admission, image verification or billing evidence.",
);
