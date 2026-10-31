import Ajv2020, { type Options, type ValidateFunction } from "ajv/dist/2020.js";

// Compiling a schema generates code, so each distinct schema is compiled once
// and reused. Schemas come from provider revisions and are unbounded in number:
// the least recently used ones are evicted, and removed from Ajv's own cache
// too, which would otherwise keep every compiled schema for the process life.
export function schemaCompiler(options: Options, setup?: (ajv: Ajv2020) => void, max = 256) {
  const create = () => {
    const ajv = new Ajv2020(options);
    setup?.(ajv);
    return ajv;
  };
  const ajv = create();
  const cache = new Map<string, { schema: object; validate: ValidateFunction }>();
  return (schema: object): ValidateFunction => {
    const key = JSON.stringify(schema);
    // A schema `$id` registers in the shared instance, where it could collide
    // with or be `$ref`-ed by another provider's schema: compile it alone.
    if (key.includes('"$id"')) return create().compile(schema);
    const hit = cache.get(key);
    if (hit) {
      cache.delete(key);
      cache.set(key, hit);
      return hit.validate;
    }
    // Ajv keys its cache by object identity; a private copy keeps a caller's
    // later mutation from changing a cached schema.
    const own = structuredClone(schema);
    const validate = ajv.compile(own);
    cache.set(key, { schema: own, validate });
    if (cache.size > max) {
      const [oldest, entry] = cache.entries().next().value!;
      cache.delete(oldest);
      ajv.removeSchema(entry.schema);
    }
    return validate;
  };
}

// Provider output schemas: plain JSON Schema, no defaults applied to results.
export const outputValidator = schemaCompiler({ strict: true, useDefaults: false });
