import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SupabaseAuthService } from "../src/modules/identity/auth/supabase-auth.service.js";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getClaims: vi.fn(),
  getUser: vi.fn(),
  signInWithOtp: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

describe("Supabase Auth adapter", () => {
  let service: SupabaseAuthService;

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createClient.mockReturnValue({ auth: mocks });
    service = new SupabaseAuthService(
      new ConfigService({
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "test-key",
      }),
    );
  });

  it("maps a verified Supabase session to the backend principal", async () => {
    const subjectId = "161edc3c-8bc6-4f35-a225-e6a6b3a37839";
    const sessionId = "161edc3c-8bc6-4f35-a225-e6a6b3a37840";
    mocks.getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: subjectId,
          session_id: sessionId,
          role: "authenticated",
          aud: "authenticated",
          iss: "https://project.supabase.co/auth/v1",
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
      },
      error: null,
    });
    mocks.getUser.mockResolvedValue({ data: { user: { id: subjectId } }, error: null });

    await expect(service.authenticate("token")).resolves.toMatchObject({
      status: "ok",
      value: { subjectId, sessionId },
    });
    expect(mocks.getClaims).toHaveBeenCalledWith("token");
    expect(mocks.getUser).toHaveBeenCalledWith("token");
  });

  it("rejects a session refused by Supabase", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: new Error("Invalid token") });
    await expect(service.authenticate("invalid-token")).resolves.toMatchObject({
      status: "error",
      error: { code: "INVALID_SESSION" },
    });
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("maps OTP delivery failures without exposing provider details", async () => {
    mocks.signInWithOtp.mockResolvedValue({ error: new Error("Private SMTP details") });
    await expect(service.sendOtp("buyer@example.com")).resolves.toMatchObject({
      status: "error",
      error: {
        code: "OTP_UNAVAILABLE",
        message: "Unable to send a verification code. Try again later.",
      },
    });
  });
});
