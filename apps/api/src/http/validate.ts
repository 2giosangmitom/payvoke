import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { z } from "zod";
import { BadRequestError } from "../errors";

// Maps a failed field to its public code, falling back to `code`. The first
// listed field with an issue wins, so order fields by precedence.
export type FieldCodes = Record<string, string>;

// zValidator with Payvoke's error contract: a failed request answers
// `{ error: CODE }` with 400 instead of zod's issue list, so clients see the
// same stable codes the services throw.
export function validate<T extends z.ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
  code: string,
  fields: FieldCodes = {},
) {
  return zValidator(target, schema, (result) => {
    if (result.success) return;
    const paths = new Set(result.error.issues.map((issue) => String(issue.path[0] ?? "")));
    const field = Object.keys(fields).find((name) => paths.has(name));
    throw new BadRequestError(field ? fields[field] : code);
  });
}
