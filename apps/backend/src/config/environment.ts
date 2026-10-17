import "dotenv/config";
import { Type } from "typebox";
import { Value } from "typebox/value";

export const EnvironmentSchema = Type.Object({
  DATABASE_URL: Type.String({ minLength: 1 }),
  SUPABASE_URL: Type.String({ minLength: 1 }),
  SUPABASE_PUBLISHABLE_KEY: Type.String({ minLength: 1 }),
  AUTH_ORIGIN: Type.String({ minLength: 1 }),
  PORT: Type.Integer({ minimum: 1, maximum: 65535 }),
});

export type Environment = {
  DATABASE_URL: string;
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  AUTH_ORIGIN: string;
  PORT: number;
};

function assertHttpUrl(name: string, value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid environment: ${name} must be an absolute URL.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Invalid environment: ${name} must use http or https.`);
  }
}

/**
 * Validates the process environment into a typed, immutable config object.
 * Shared by the application bootstrap, the MikroORM CLI and code generation.
 */
export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  const candidate = {
    DATABASE_URL: source.DATABASE_URL,
    SUPABASE_URL: source.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: source.SUPABASE_PUBLISHABLE_KEY,
    AUTH_ORIGIN: source.AUTH_ORIGIN ?? "http://localhost:3000",
    PORT: source.PORT === undefined ? 8000 : Number(source.PORT),
  };

  if (!Value.Check(EnvironmentSchema, candidate)) {
    const details = Value.Errors(EnvironmentSchema, candidate)
      .map((error) => `${error.instancePath || "/"} ${error.message}`)
      .join("; ");
    throw new Error(`Invalid environment: ${details}`);
  }

  assertHttpUrl("AUTH_ORIGIN", candidate.AUTH_ORIGIN);
  assertHttpUrl("SUPABASE_URL", candidate.SUPABASE_URL);
  return candidate;
}
