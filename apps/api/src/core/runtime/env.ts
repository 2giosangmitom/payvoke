import { z } from "zod";

// Env values arrive as strings; tests pass plain objects with real types.
// These conversions match the env-schema/Ajv rules the config used before:
// a value that does not convert exactly is a startup error, never a guess.

// "true" and 1 are true; "false", 0 and null are false. "1", "yes" and "" fail.
export const envBoolean = () =>
  z.preprocess(
    (value) =>
      value === "true" || value === 1
        ? true
        : value === "false" || value === 0 || value === null
          ? false
          : value,
    z.boolean(),
  );

// A non-empty integral string, a boolean or null; "" and "1.5" fail.
export const envInteger = ({ min, max }: { min?: number; max?: number } = {}) => {
  let integer = z.number().int();
  if (min !== undefined) integer = integer.min(min);
  if (max !== undefined) integer = integer.max(max);
  return z.preprocess(
    (value) =>
      typeof value === "boolean" || value === null
        ? Number(value)
        : typeof value === "string" && value !== "" && Number(value) === Number(value)
          ? Number(value)
          : value,
    integer,
  );
};

// Numbers and booleans are stringified; null becomes "".
export const envString = () =>
  z.preprocess(
    (value) =>
      typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : value === null
          ? ""
          : value,
    z.string(),
  );

// Every service validates only the variables it owns; `z.object` drops
// unknown keys. Process env is read explicitly so tests can pass a plain object.
export function loadEnv<T extends z.ZodObject>(
  schema: T,
  source: Record<string, unknown> = process.env,
): Readonly<z.output<T>> {
  return schema.parse(source);
}

// RPC and service origins carry no credentials or fragments, and use TLS
// except on loopback.
export function isSafeServiceUrl(url: URL) {
  return (
    !url.username &&
    !url.password &&
    !url.hash &&
    (url.protocol === "https:" ||
      (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
  );
}

// Server-to-server calls may also use plain http to a single-label host, the
// shape of a service name on a private container network (`http://rustfs:9000`).
// Never accept this for an origin that browsers or providers fetch.
export function isPrivateServiceUrl(url: URL) {
  return (
    isSafeServiceUrl(url) ||
    (!url.username &&
      !url.password &&
      !url.hash &&
      url.protocol === "http:" &&
      /^[a-z0-9-]+$/i.test(url.hostname))
  );
}
