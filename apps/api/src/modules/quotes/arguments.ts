import type { Json } from "@payvoke/shared/protocol";
import type { Prisma } from "#core/db";
import { inputSchema } from "#core/runtime";
import { BadRequestError, ServiceUnavailableError } from "../../errors";

// Validates command arguments against a stored revision schema and returns
// them with schema defaults applied. Converted schemas live in a bounded
// cache keyed by schema content, never by the freshly loaded object.
export function effectiveArguments(schema: Prisma.JsonValue, args: unknown) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema) || "$async" in schema)
    throw new ServiceUnavailableError("INVALID_COMMAND_SCHEMA");
  if (!args || typeof args !== "object" || Array.isArray(args))
    throw new BadRequestError("INVALID_ARGUMENTS");
  let validate;
  try {
    validate = inputSchema(schema);
  } catch {
    throw new ServiceUnavailableError("INVALID_COMMAND_SCHEMA");
  }
  const parsed = validate.safeParse(args);
  if (!parsed.success) throw new BadRequestError("INVALID_ARGUMENTS");
  return parsed.data as Record<string, Json>;
}
