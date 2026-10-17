import { Result } from "better-result";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  failure,
  IdentityError,
  type IdentityErrorCode,
  type IdentityResult,
} from "../src/modules/identity/domain/identity.errors.js";
import { ApiHttpError, httpValue } from "../src/modules/identity/http/identity-http.js";

describe("typed identity errors", () => {
  it("returns a tagged error with a closed code, not an HTTP error", () => {
    const result = failure("INVALID_SESSION", "Invalid session.");
    expect(result.status).toBe("error");
    expect(IdentityError.is(result.error)).toBe(true);
    expect(result.error._tag).toBe("IdentityError");
    expect(result.error).not.toBeInstanceOf(ApiHttpError);
    // @ts-expect-error Unknown codes have no HTTP policy and cannot be constructed.
    const invalid: IdentityErrorCode = "UNREGISTERED_ERROR";
    void invalid;
  });

  it("requires handling Err before reading success and preserves the HTTP success type", () => {
    const read = (result: IdentityResult<number>) => {
      // @ts-expect-error A Result has no success value until its branch is narrowed.
      const unhandled: number = result.value;
      void unhandled;
      return result.isOk() ? result.value : 0;
    };
    expect(read(Result.ok(42))).toBe(42);
    expectTypeOf(httpValue(Result.ok(42))).toEqualTypeOf<number>();
  });

  it.each([
    ["INVALID_SESSION", 401],
    ["ACCOUNT_UNAVAILABLE", 403],
    ["INVALID_DISPLAY_NAME", 400],
  ] satisfies [IdentityErrorCode, number][])(
    "maps %s to HTTP %s without wrapping it in Panic",
    (code, status) => {
      let caught: unknown;
      try {
        httpValue(failure(code, "Safe public message."));
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(ApiHttpError);
      if (!(caught instanceof ApiHttpError)) throw new Error("Expected the HTTP adapter to throw.");
      expect(caught.status).toBe(status);
      expect(caught.body).toEqual({ code, message: "Safe public message." });
    },
  );
});
