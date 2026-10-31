import type { z } from "zod";
import { toZod, type JsonSchemaMode } from "./json-schema";

// Converting a schema builds a tree of Zod objects, so each distinct schema is
// converted once and reused. Schemas come from provider revisions and are
// unbounded in number: the least recently used ones are evicted.
function schemaCache(mode: JsonSchemaMode, max = 256) {
  const cache = new Map<string, z.ZodType>();
  return (schema: object): z.ZodType => {
    const key = JSON.stringify(schema);
    const hit = cache.get(key);
    if (hit) {
      cache.delete(key);
      cache.set(key, hit);
      return hit;
    }
    const converted = toZod(schema, mode);
    cache.set(key, converted);
    if (cache.size > max) cache.delete(cache.keys().next().value!);
    return converted;
  };
}

// Command input schemas: fills `default` values. Throws on a schema outside
// the supported subset.
export const inputSchema = schemaCache({ defaults: true, files: true });

const output = schemaCache({ defaults: false, files: false });
// Provider output schemas, validated as written. A schema outside the subset
// fails closed: the result is treated as invalid.
export function outputValidator(schema: object) {
  try {
    const converted = output(schema);
    return (value: unknown) => converted.safeParse(value).success;
  } catch {
    return () => false;
  }
}
