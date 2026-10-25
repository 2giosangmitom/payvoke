import type { FastifyInstance } from "fastify";
import { HttpError } from "@fastify/sensible";

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, _request, reply) => {
    const failure = error as { statusCode?: number; code?: string };
    const status = failure.statusCode ?? 500;
    const code = failure.code ?? (error instanceof HttpError ? error.message : "BAD_REQUEST");
    // Prisma/adapter errors may contain SQL or credentials. Never expose or log them.
    if (status >= 500) app.log.error("Request failed");
    reply.code(status).send({ error: status >= 500 ? "INTERNAL_ERROR" : code });
  });
}
