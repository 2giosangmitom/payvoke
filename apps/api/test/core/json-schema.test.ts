import assert from "node:assert/strict";
import { describe, it } from "bun:test";
import { inputSchema, outputValidator } from "#core/runtime";
import { toZod } from "../../src/core/runtime/json-schema";

type Case = {
  name: string;
  schema: Record<string, unknown>;
  input: unknown;
  // Result with defaults filled (input schemas) and as written (output schemas).
  input_ok: boolean;
  output_ok: boolean;
  // Parsed value when input_ok, defaults applied.
  value?: unknown;
};

const object = (properties: Record<string, unknown>, required: string[] = [], extra = false) => ({
  type: "object",
  additionalProperties: extra,
  properties,
  required,
});

// Each case was checked against the Ajv 2020 validators this replaced:
// input (strict, useDefaults, format "file") and output (strict, no defaults).
export const cases: Case[] = [
  { name: "string ok", schema: { type: "string" }, input: "a", input_ok: true, output_ok: true },
  { name: "string type", schema: { type: "string" }, input: 1, input_ok: false, output_ok: false },
  {
    name: "length counts code points",
    schema: { type: "string", maxLength: 2 },
    input: "😀😀",
    input_ok: true,
    output_ok: true,
  },
  {
    name: "length over",
    schema: { type: "string", minLength: 1, maxLength: 2 },
    input: "abc",
    input_ok: false,
    output_ok: false,
  },
  {
    name: "empty below minLength",
    schema: { type: "string", minLength: 1 },
    input: "",
    input_ok: false,
    output_ok: false,
  },
  {
    name: "file id",
    schema: { type: "string", format: "file", accept: ["image/*"], maxBytes: 10 },
    input: "file_abc-1",
    input_ok: true,
    // File fields exist only in command inputs.
    output_ok: false,
  },
  {
    name: "file id charset",
    schema: { type: "string", format: "file" },
    input: "../etc",
    input_ok: false,
    output_ok: false,
  },
  {
    name: "file id length",
    schema: { type: "string", format: "file" },
    input: "a".repeat(129),
    input_ok: false,
    output_ok: false,
  },
  {
    name: "string enum",
    schema: { type: "string", enum: ["a", "b"] },
    input: "c",
    input_ok: false,
    output_ok: false,
  },
  {
    name: "integer",
    schema: { type: "integer", minimum: 1, maximum: 3 },
    input: 3,
    input_ok: true,
    output_ok: true,
  },
  {
    name: "integer fraction",
    schema: { type: "integer" },
    input: 1.5,
    input_ok: false,
    output_ok: false,
  },
  {
    name: "integer whole float",
    schema: { type: "integer" },
    input: 2.0,
    input_ok: true,
    output_ok: true,
  },
  {
    name: "number bounds",
    schema: { type: "number", minimum: 0.5 },
    input: 0.4,
    input_ok: false,
    output_ok: false,
  },
  {
    name: "number string",
    schema: { type: "number" },
    input: "1",
    input_ok: false,
    output_ok: false,
  },
  {
    name: "number enum",
    schema: { type: "number", enum: [1, 2] },
    input: 2,
    input_ok: true,
    output_ok: true,
  },
  {
    name: "boolean",
    schema: { type: "boolean" },
    input: "true",
    input_ok: false,
    output_ok: false,
  },
  {
    name: "array bounds",
    schema: { type: "array", maxItems: 2, items: { type: "string" } },
    input: ["a", "b", "c"],
    input_ok: false,
    output_ok: false,
  },
  {
    name: "array items",
    schema: { type: "array", maxItems: 2, items: { type: "string" } },
    input: ["a", 1],
    input_ok: false,
    output_ok: false,
  },
  {
    name: "array minItems",
    schema: { type: "array", minItems: 1, maxItems: 2, items: { type: "string" } },
    input: [],
    input_ok: false,
    output_ok: false,
  },
  {
    name: "strict object rejects extra keys",
    schema: object({ a: { type: "string" } }),
    input: { a: "x", b: 1 },
    input_ok: false,
    output_ok: false,
  },
  {
    name: "loose object keeps extra keys",
    schema: { type: "object", properties: { a: { type: "string" } } },
    input: { a: "x", b: 1 },
    input_ok: true,
    output_ok: true,
    value: { a: "x", b: 1 },
  },
  {
    name: "required missing",
    schema: object({ a: { type: "string" } }, ["a"]),
    input: {},
    input_ok: false,
    output_ok: false,
  },
  {
    name: "optional missing",
    schema: object({ a: { type: "string" } }),
    input: {},
    input_ok: true,
    output_ok: true,
    value: {},
  },
  {
    name: "default fills a required field only with defaults on",
    schema: object({ a: { type: "string", default: "x" }, b: { type: "integer", default: 2 } }, [
      "a",
    ]),
    input: {},
    input_ok: true,
    output_ok: false,
    value: { a: "x", b: 2 },
  },
  {
    name: "default keeps a given value",
    schema: object({ a: { type: "string", default: "x" } }),
    input: { a: "y" },
    input_ok: true,
    output_ok: true,
    value: { a: "y" },
  },
  {
    name: "invalid default is validated",
    schema: object({ a: { type: "string", default: 1 } }),
    input: {},
    input_ok: false,
    output_ok: true,
  },
  {
    name: "nested objects in arrays",
    schema: object(
      {
        list: {
          type: "array",
          maxItems: 3,
          items: object({ n: { type: "integer", default: 1 } }),
        },
      },
      ["list"],
    ),
    input: { list: [{}, { n: 4 }] },
    input_ok: true,
    output_ok: true,
    value: { list: [{ n: 1 }, { n: 4 }] },
  },
  {
    name: "object is not an array",
    schema: object({}),
    input: [],
    input_ok: false,
    output_ok: false,
  },
  {
    name: "null is not an object",
    schema: object({}),
    input: null,
    input_ok: false,
    output_ok: false,
  },
];

describe("JSON Schema subset", () => {
  for (const c of cases)
    it(c.name, () => {
      const parsed = inputSchema(c.schema).safeParse(structuredClone(c.input));
      assert.equal(parsed.success, c.input_ok, "input");
      if (c.value !== undefined) assert.deepEqual(parsed.data, c.value);
      assert.equal(outputValidator(c.schema)(structuredClone(c.input)), c.output_ok, "output");
    });

  // Ajv accepted some of these (full JSON Schema); command schemas never
  // contain them, and an old output schema using one now fails closed.
  it("rejects schemas outside the subset", () => {
    for (const schema of [
      { type: "string", pattern: "a" },
      { type: "string", format: "email" },
      { type: ["string", "null"] },
      { type: "null" },
      { anyOf: [{ type: "string" }] },
      { type: "object", $id: "x", properties: {} },
      { type: "object", properties: {}, additionalProperties: { type: "string" } },
      { type: "string", $schema: "http://json-schema.org/draft-07/schema#" },
      { type: "integer", minimum: "1" },
      { type: "object", properties: { a: { type: "string", const: "x" } } },
    ]) {
      assert.throws(() => toZod(schema, { defaults: true, files: true }), JSON.stringify(schema));
      assert.equal(outputValidator(schema)("x"), false);
    }
  });

  it("never shares a default between parses", () => {
    const schema = object({
      tags: { type: "array", maxItems: 5, items: { type: "string" }, default: [] },
    });
    const first = inputSchema(schema).parse({}) as { tags: string[] };
    first.tags.push("mutated");
    assert.deepEqual(inputSchema(schema).parse({}), { tags: [] });
  });
});
