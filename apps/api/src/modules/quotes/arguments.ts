import type { Json } from "@payvoke/shared/protocol";
import type { Prisma } from "@/core/db";
import { BadRequestError, ServiceUnavailableError } from "../../errors";
import { inputValidator } from "../apps/schema";

// Validates command arguments against a stored revision schema and returns
// them with schema defaults applied. Do not retain freshly loaded schema object
// identities in an unbounded process-wide Ajv cache: this is preparation, not
// the paid hot path.
export function effectiveArguments(schema: Prisma.JsonValue, args: unknown) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema) || "$async" in schema)
    throw new ServiceUnavailableError("INVALID_COMMAND_SCHEMA");
  if (!args || typeof args !== "object" || Array.isArray(args))
    throw new BadRequestError("INVALID_ARGUMENTS");
  const effective = structuredClone(args) as Record<string, Json>;
  const validate = inputValidator(schema);
  if (!validate(effective)) throw new BadRequestError("INVALID_ARGUMENTS");
  return effective;
}
