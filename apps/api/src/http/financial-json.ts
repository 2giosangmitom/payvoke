import type { FastifyInstance } from "fastify";
import { parseFinancialJson } from "@payvoke/server";
import { BadRequestError } from "../errors";

// Call inside an encapsulated scope only: it replaces the JSON parser for that
// scope's routes and must not change Better Auth's native parser.
export function useFinancialJson(scope: FastifyInstance) {
  scope.removeContentTypeParser("application/json");
  scope.addContentTypeParser("application/json", { parseAs: "string" }, (_request, body, done) => {
    try {
      done(null, parseFinancialJson(body as string));
    } catch {
      done(new BadRequestError("INVALID_JSON"));
    }
  });
  scope.addHook("onRequest", async (_request, reply) => {
    reply.cacheControl("no-store");
  });
}
