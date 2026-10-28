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
