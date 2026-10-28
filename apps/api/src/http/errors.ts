import type { Context, ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { Prisma } from "#core/db";
import { AppError } from "../errors";
import type { AppEnv, Logger } from "./context";

type PublicError = { status: ContentfulStatusCode; code: string; expected: boolean };

// Hono's own 4xx failures (malformed JSON, body limit) carry no code.
const httpCodes: Record<number, string> = {
  400: "INVALID_JSON",
  413: "PAYLOAD_TOO_LARGE",
  415: "UNSUPPORTED_MEDIA_TYPE",
};

function publicError(error: unknown): PublicError {
  if (error instanceof AppError)
    return { status: error.statusCode as ContentfulStatusCode, code: error.code, expected: true };
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // A write lost a race with another request; report it, not a server fault.
    if (error.code === "P2002") return { status: 409, code: "CONFLICT", expected: true };
    if (error.code === "P2025") return { status: 404, code: "NOT_FOUND", expected: true };
    return { status: 500, code: "INTERNAL_ERROR", expected: false };
  }
  if (error instanceof HTTPException && error.status < 500)
    return {
      status: error.status as ContentfulStatusCode,
      code: httpCodes[error.status] ?? "BAD_REQUEST",
      expected: true,
    };
  return { status: 500, code: "INTERNAL_ERROR", expected: false };
}

export function errorHandler(log: Logger): ErrorHandler<AppEnv> {
  return (error, c) => {
    const { status, code, expected } = publicError(error);
    // Prisma/adapter errors may contain SQL or credentials: log the type, never
    // the message, and never send anything but the public code.
    if (!expected) log.error({ type: (error as Error | undefined)?.name }, "Request failed");
    else if (status >= 500) log.warn({ code }, "Request unavailable");
    return c.json({ error: code }, status);
  };
}

export const notFound: NotFoundHandler<AppEnv> = (c: Context) =>
  c.json({ error: "ROUTE_NOT_FOUND" }, 404);
