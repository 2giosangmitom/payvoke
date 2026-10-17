import { type IdentityErrorCode, type IdentityResult } from "../domain/identity.errors.js";
import type { Static } from "typebox";
import type { ApiErrorSchema } from "./identity.schemas.js";

type ApiError = Static<typeof ApiErrorSchema>;

const identityErrorStatus = {
  INVALID_AVATAR_URL: 400,
  INVALID_DISPLAY_NAME: 400,
  INVALID_SESSION: 401,
  ACCOUNT_UNAVAILABLE: 403,
} satisfies Record<IdentityErrorCode, number>;

/** Routine, client-facing failure carried through Fastify's error handler. */
export class ApiHttpError extends Error {
  readonly status: number;
  readonly body: ApiError;

  constructor(body: ApiError, status: number) {
    super(body.message);
    this.name = "ApiHttpError";
    this.status = status;
    this.body = body;
  }
}

export function httpFailure(code: IdentityErrorCode, message: string): never {
  throw new ApiHttpError({ code, message } satisfies ApiError, identityErrorStatus[code]);
}

// Only the HTTP adapter throws routine failures. Never throw from Result.match: it becomes Panic.
export function httpValue<T>(result: IdentityResult<T>): T {
  if (result.isErr()) {
    const { code, message } = result.error;
    httpFailure(code, message);
  }
  return result.value;
}
