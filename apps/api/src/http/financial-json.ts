import { createMiddleware } from "hono/factory";
import { parseFinancialJson } from "#core/runtime";
import { BadRequestError } from "../errors";

// Financial JSON boundaries (quotes, paid submission) reject duplicate keys and
// non-canonical values before the zod validator parses the same, cached text.
// Better Auth keeps its own native parser. Responses are never cached.
export const financialJson = createMiddleware(async (c, next) => {
  if (c.req.header("content-type")?.startsWith("application/json")) {
    try {
      parseFinancialJson(await c.req.text());
    } catch {
      throw new BadRequestError("INVALID_JSON");
    }
  }
  await next();
  c.header("Cache-Control", "no-store");
});

export const noStore = createMiddleware(async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
});
