import { Result, TaggedError } from "better-result";

export type IdentityErrorCode =
  | "INVALID_AVATAR_URL"
  | "INVALID_DISPLAY_NAME"
  | "INVALID_SESSION"
  | "ACCOUNT_UNAVAILABLE";

export class IdentityError extends TaggedError("IdentityError")<{
  code: IdentityErrorCode;
  message: string;
}> {}

export type IdentityResult<T> = Result<T, IdentityError>;

export function failure(code: IdentityErrorCode, message: string) {
  return Result.err(new IdentityError({ code, message }));
}
