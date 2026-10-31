import type { ValidationTargets } from "hono";
import { validator } from "hono-openapi";
import type { z } from "zod";
import { BadRequestError } from "../errors";

// Maps a failed field to its public code, falling back to `code`. The first
// listed field with an issue wins, so order fields by precedence.
export type FieldCodes = Record<string, string>;

// A Standard Schema path item is a key or `{ key }`.
type PathItem = PropertyKey | { readonly key: PropertyKey };
const fieldOf = (path: readonly PathItem[] | undefined) => {
  const first = path?.[0];
  if (first === undefined) return "";
  return String(typeof first === "object" ? first.key : first);
};

// A validator with Payvoke's error contract: a failed request answers
// `{ error: CODE }` with 400 instead of the issue list, so clients see the
// same stable codes the services throw. The schema also documents the
// request in the generated OpenAPI spec (see http/openapi.ts).
export function validate<T extends z.ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
  code: string,
  fields: FieldCodes = {},
) {
  return validator(target, schema, (result) => {
    if (result.success) return;
    const paths = new Set(result.error.map((issue) => fieldOf(issue.path)));
    const field = Object.keys(fields).find((name) => paths.has(name));
    throw new BadRequestError(field ? fields[field] : code);
  });
}
