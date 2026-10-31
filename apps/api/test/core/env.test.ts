import assert from "node:assert/strict";
import { describe, it } from "bun:test";
import { z } from "zod";
import { envBoolean, envInteger, envString, loadEnv } from "#core/runtime";
import { loadConfig } from "../../src/config";

const parse = (schema: z.ZodType, value: unknown) => {
  const result = z.object({ v: schema }).safeParse(value === undefined ? {} : { v: value });
  return result.success ? (result.data as { v: unknown }).v : "ERR";
};

// The conversions env-schema (Ajv coerceTypes) applied before.
describe("env conversions", () => {
  it("booleans", () => {
    const table: [unknown, unknown][] = [
      ["true", true],
      ["false", false],
      [1, true],
      [0, false],
      [null, false],
      [true, true],
      ["1", "ERR"],
      ["TRUE", "ERR"],
      ["yes", "ERR"],
      ["", "ERR"],
      [undefined, false],
    ];
    for (const [value, expected] of table)
      assert.equal(parse(envBoolean().default(false), value), expected, JSON.stringify(value));
  });

  it("integers", () => {
    const table: [unknown, unknown][] = [
      ["3", 3],
      ["-2", -2],
      ["  3 ", 3],
      ["1e3", 1000],
      [true, 1],
      [null, 0],
      [3, 3],
      ["", "ERR"],
      ["1.5", "ERR"],
      ["abc", "ERR"],
      ["Infinity", "ERR"],
      [undefined, 7],
    ];
    for (const [value, expected] of table)
      assert.equal(parse(envInteger().default(7), value), expected, JSON.stringify(value));
    const bounded = envInteger({ min: 60, max: 3600 });
    assert.equal(parse(bounded, "60"), 60);
    assert.equal(parse(bounded, "59"), "ERR");
    assert.equal(parse(bounded, "3601"), "ERR");
    assert.equal(parse(envInteger().optional(), undefined), undefined);
  });

  it("strings", () => {
    assert.equal(parse(envString(), 3), "3");
    assert.equal(parse(envString(), false), "false");
    assert.equal(parse(envString(), null), "");
    assert.equal(parse(envString(), ""), "");
    assert.equal(parse(envString(), undefined), "ERR");
    assert.equal(parse(envString().default("d"), undefined), "d");
  });

  it("drops unknown keys", () => {
    assert.deepEqual(loadEnv(z.object({ A: envString() }), { A: "x", B: "y" }), { A: "x" });
  });
});

describe("loadConfig", () => {
  const required = {
    DATABASE_URL: "postgresql://localhost/payvoke",
    REDIS_URL: "redis://localhost:6379",
    API_ORIGIN: "http://localhost:3001",
    WEB_ORIGIN: "http://localhost:3000",
    BETTER_AUTH_SECRET: "secret",
  };

  it("applies defaults and converts env strings", () => {
    const config = loadConfig({ ...required, PORT: "4000", FILES_ENABLED: "true", OTHER: "x" });
    assert.equal(config.PORT, 4000);
    assert.equal(config.FILES_ENABLED, true);
    assert.equal(config.DATABASE_POOL_MAX, 5);
    assert.equal(config.JOB_WORKER_ENABLED, true);
    assert.equal(config.FILE_MAX_BYTES, 26214400);
    assert.equal(config.S3_FORCE_PATH_STYLE, false);
    assert.equal(config.VAULT_ADDRESS, undefined);
    assert.ok(!("OTHER" in config));
  });

  it("fails on a missing or unconvertible value", () => {
    const { DATABASE_URL: _, ...missing } = required;
    assert.throws(() => loadConfig(missing));
    assert.throws(() => loadConfig({ ...required, PORT: "" }));
    assert.throws(() => loadConfig({ ...required, PAYMENTS_ENABLED: "1" }));
    assert.throws(() => loadConfig({ ...required, DATABASE_POOL_MAX: "0" }));
  });
});
