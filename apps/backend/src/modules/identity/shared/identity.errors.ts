import { Result, TaggedError } from "better-result";

// Codes and their transport policies are closed together; callers cannot invent a status/code pair.
export const identityErrorStatus = {
  INVALID_ADDRESS: 400,
  INVALID_AVATAR_URL: 400,
  INVALID_DISPLAY_NAME: 400,
  INVALID_ROLE: 400,
  INVALID_CHALLENGE: 401,
  INVALID_OTP: 401,
  INVALID_SESSION: 401,
  INVALID_SIGNATURE: 401,
  INVALID_WALLET_PROOF: 401,
  IDENTITY_MISMATCH: 401,
  REAUTHENTICATION_REQUIRED: 401,
  SESSION_NOT_ADMITTED: 401,
  ACCOUNT_UNAVAILABLE: 403,
  FORBIDDEN: 403,
  ACCOUNT_NOT_FOUND: 404,
  MEMBER_NOT_FOUND: 404,
  PROJECT_NOT_FOUND: 404,
  ALREADY_MEMBER: 409,
  IDENTITY_ALREADY_LINKED: 409,
  IDENTITY_CONFLICT: 409,
  OWNER_IMMUTABLE: 409,
  PROJECT_ALREADY_INITIALIZED: 409,
  UNSUPPORTED_CHAIN: 422,
  RATE_LIMITED: 429,
  OTP_UNAVAILABLE: 503,
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
