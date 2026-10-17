import { Result } from "better-result";
import { failure, type IdentityResult } from "../shared/identity.errors.js";
import type { Principal } from "../identity.types.js";

export const FUJI_CHAIN_ID = 43113;
export const CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const SESSION_ADMISSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RECENT_AUTHENTICATION_MS = 10 * 60 * 1000;

// Check both before issuing proof and again when committing a link after external calls.
export function requireRecentAuthentication(principal?: Principal): IdentityResult<void> {
  if (principal && Date.now() - principal.authenticatedAt.getTime() > RECENT_AUTHENTICATION_MS) {
    return failure("REAUTHENTICATION_REQUIRED", "Sign in again before linking an identity.");
  }
  return Result.ok(undefined);
}
