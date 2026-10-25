import type { FastifyInstance } from "fastify";
import { HttpError } from "@fastify/sensible";
import { Prisma } from "@payvoke/db";
import { AppError } from "../errors";

type PublicError = { status: number; code: string; expected: boolean };

function publicError(error: unknown): PublicError {
  if (error instanceof AppError)
    return { status: error.statusCode, code: error.code, expected: true };
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // A write lost a race with another request; report it, not a server fault.
    if (error.code === "P2002") return { status: 409, code: "CONFLICT", expected: true };
    if (error.code === "P2025") return { status: 404, code: "NOT_FOUND", expected: true };
    return { status: 500, code: "INTERNAL_ERROR", expected: false };
  }
  // Fastify, plugin (validation, rate limit, body limit) and sensible errors.
  const failure = error as { statusCode?: number; code?: string };
  const status =
    failure.statusCode && failure.statusCode >= 400 && failure.statusCode < 600
      ? failure.statusCode
      : 500;
  if (status >= 500) return { status, code: "INTERNAL_ERROR", expected: false };
  const code = failure.code ?? (error instanceof HttpError ? error.message : "BAD_REQUEST");
  return { status, code, expected: true };
}

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    const { status, code, expected } = publicError(error);
    // Prisma/adapter errors may contain SQL or credentials: log the type, never
    // the message, and never send anything but the public code.
    if (!expected)
      request.log.error({ type: (error as Error | undefined)?.name }, "Request failed");
    else if (status >= 500) request.log.warn({ code }, "Request unavailable");
    reply.code(status).send({ error: code });
  });
  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({ error: "ROUTE_NOT_FOUND" });
  });
}
