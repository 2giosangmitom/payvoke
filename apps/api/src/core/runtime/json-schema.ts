import { z } from "zod";

// Converts the JSON Schema subset Payvoke accepts (see `checkJsonSchema` in
// modules/apps/schema.ts) into a Zod schema, with JSON Schema semantics:
// string lengths count code points, `required` applies after defaults are
// filled, and objects without `additionalProperties: false` keep extra keys.
// Anything outside the subset throws, so an unsupported schema never
// validates more loosely than written.

type Schema = Record<string, unknown>;
export type JsonSchemaMode = {
  // true fills a missing property from its `default` before `required` is
  // checked; false validates as written (a default never satisfies `required`).
  defaults: boolean;
  // true accepts `format: "file"` with `accept` and `maxBytes` (command inputs).
  files: boolean;
};

const DRAFT = "https://json-schema.org/draft/2020-12/schema";
// Validation ignores these.
const ANNOTATIONS = ["$schema", "title", "description", "default"];
// File fields; `accept` and `maxBytes` are enforced by the file service.
const FILE_KEYWORDS = ["format", "accept", "maxBytes"];
const KEYWORDS: Record<string, string[]> = {
  object: ["properties", "required", "additionalProperties"],
  array: ["items", "minItems", "maxItems"],
  string: ["minLength", "maxLength", "enum"],
  integer: ["minimum", "maximum", "enum"],
  number: ["minimum", "maximum", "enum"],
  boolean: ["enum"],
};
const FILE_ID = /^[\w-]{1,128}$/;

const record = (value: unknown): value is Schema =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const count = (value: unknown, name: string) => {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Invalid ${name}`);
  return value;
};

function convert(schema: unknown, mode: JsonSchemaMode): z.ZodType {
  if (!record(schema)) throw new Error("Schema must be an object");
  const type = schema.type;
  if (typeof type !== "string" || !KEYWORDS[type]) throw new Error("Unsupported type");
  for (const key of Object.keys(schema))
    if (
      key !== "type" &&
      !ANNOTATIONS.includes(key) &&
      !KEYWORDS[type].includes(key) &&
      !(mode.files && type === "string" && FILE_KEYWORDS.includes(key))
    )
      throw new Error(`Unsupported keyword: ${key}`);
  if (schema.$schema !== undefined && schema.$schema !== DRAFT)
    throw new Error("Unsupported $schema");

  let result: z.ZodType;
  switch (type) {
    case "object": {
      const properties = schema.properties ?? {};
      const required = schema.required ?? [];
      if (!record(properties)) throw new Error("Invalid properties");
      if (!Array.isArray(required) || required.some((key) => typeof key !== "string"))
        throw new Error("Invalid required");
      const extra = schema.additionalProperties;
      if (extra !== undefined && typeof extra !== "boolean")
        throw new Error("Unsupported additionalProperties");
      const shape: Record<string, z.ZodType> = {};
      for (const [name, child] of Object.entries(properties)) {
        let property = convert(child, mode);
        const fallback = record(child) ? child.default : undefined;
        // The default is filled in and then validated like any value, as Ajv does.
        if (mode.defaults && fallback !== undefined)
          property = z.preprocess(
            (value) => (value === undefined ? structuredClone(fallback) : value),
            property,
          );
        else if (!required.includes(name)) property = property.optional();
        shape[name] = property;
      }
      // A required name without a property definition still must be present.
      for (const name of required as string[])
        if (!(name in shape)) shape[name] = z.unknown().refine((value) => value !== undefined);
      result = extra === false ? z.strictObject(shape) : z.looseObject(shape);
      break;
    }
    case "array": {
      let array = z.array(schema.items === undefined ? z.unknown() : convert(schema.items, mode));
      const min = count(schema.minItems, "minItems");
      const max = count(schema.maxItems, "maxItems");
      if (min !== undefined) array = array.min(min);
      if (max !== undefined) array = array.max(max);
      result = array;
      break;
    }
    case "string": {
      const min = count(schema.minLength, "minLength");
      const max = count(schema.maxLength, "maxLength");
      if (schema.format !== undefined && schema.format !== "file")
        throw new Error("Unsupported format");
      result = z.string().refine((value) => {
        const length = [...value].length;
        return (
          (min === undefined || length >= min) &&
          (max === undefined || length <= max) &&
          (schema.format !== "file" || FILE_ID.test(value))
        );
      });
      break;
    }
    case "integer":
    case "number": {
      const min = count(schema.minimum, "minimum");
      const max = count(schema.maximum, "maximum");
      result = z
        .number()
        .refine(
          (value) =>
            (type === "number" || Number.isInteger(value)) &&
            (min === undefined || value >= min) &&
            (max === undefined || value <= max),
        );
      break;
    }
    default:
      result = z.boolean();
  }
  if (schema.enum !== undefined) {
    const values = schema.enum;
    if (!Array.isArray(values) || !values.length) throw new Error("Invalid enum");
    result = result.refine((value) => values.some((choice) => choice === value));
  }
  return result;
}

export function toZod(schema: unknown, mode: JsonSchemaMode): z.ZodType {
  return convert(schema, mode);
}
