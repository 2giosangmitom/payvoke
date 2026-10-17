import { HttpException } from "@nestjs/common";
import { identityErrorStatus, type IdentityResult } from "./identity.errors.js";
import type { ApiError } from "../identity.types.js";

// Only HTTP adapters throw routine failures. Never throw from Result.match: it becomes Panic.
export function httpValue<T>(result: IdentityResult<T>): T {
  if (result.isErr()) {
    const { code, message } = result.error;
    throw new HttpException({ code, message } satisfies ApiError, identityErrorStatus[code]);
  }
  return result.value;
}
