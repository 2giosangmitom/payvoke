import envSchema from "env-schema";
import type { TSchema, Static } from "typebox";

// Every service validates only the variables it owns. Process env is read
// explicitly so tests can pass a plain object.
export function loadEnv<T extends TSchema>(
  schema: T,
  source: NodeJS.ProcessEnv = process.env,
): Readonly<Static<T>> {
  return envSchema<Readonly<Static<T>>>({ schema, data: source, env: false });
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
