import { Result, TaggedError } from "better-result";

export const identityErrorStatus = {
  INVALID_AVATAR_URL: 400,
  INVALID_DISPLAY_NAME: 400,
  INVALID_SESSION: 401,
  ACCOUNT_UNAVAILABLE: 403,
} as const;

export type IdentityErrorCode = keyof typeof identityErrorStatus;

export class IdentityError extends TaggedError("IdentityError")<{
  code: IdentityErrorCode;
  message: string;
}> {}

export type IdentityResult<T> = Result<T, IdentityError>;

export function failure(code: IdentityErrorCode, message: string) {
  return Result.err(new IdentityError({ code, message }));
}
