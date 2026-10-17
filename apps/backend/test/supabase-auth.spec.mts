import "reflect-metadata";
import { createRequire } from "node:module";
import { ConfigService } from "@nestjs/config";
import type { User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SupabaseAuthService } from "../src/modules/identity/auth/supabase-auth.service.js";

const sdk: typeof import("@supabase/supabase-js") = createRequire(import.meta.url)(
  "@supabase/supabase-js",
);
const mocks = {
  createClient: vi.fn(),
  getClaims: vi.fn(),
  getUser: vi.fn(),
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  signInWithWeb3: vi.fn(),
};

const subject = "161edc3c-8bc6-4f35-a225-e6a6b3a37839";
const sessionId = "161edc3c-8bc6-4f35-a225-e6a6b3a37840";
const address = "0x1111111111111111111111111111111111111111";
const config = new ConfigService({
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
});
const claims = () => ({
  sub: subject,
  session_id: sessionId,
  role: "authenticated",
  aud: "authenticated",
  iss: "https://project.supabase.co/auth/v1",
  exp: Math.floor(Date.now() / 1000) + 3600,
});
const user = (): User => ({
  id: subject,
  aud: "authenticated",
  app_metadata: {},
  user_metadata: {},
  created_at: new Date().toISOString(),
  email: "buyer@example.com",
  email_confirmed_at: new Date().toISOString(),
  identities: [
    {
      id: `web3:ethereum:${address}`,
      identity_id: subject,
      user_id: subject,
      provider: "web3",
      identity_data: { address, chain: "ethereum" },
    },
  ],
});

describe("Supabase Auth adapter", () => {
  let service: SupabaseAuthService;
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(sdk, "createClient").mockImplementation(mocks.createClient);
    mocks.createClient.mockReturnValue({ auth: mocks });
    mocks.getClaims.mockResolvedValue({ data: { claims: claims() }, error: null });
    mocks.getUser.mockResolvedValue({ data: { user: user() }, error: null });
    service = new SupabaseAuthService(config);
  });

  it("checks signed claims and current Auth state using a stateless client", async () => {
    await expect(service.authenticate("bearer-token")).resolves.toMatchObject({
      status: "ok",
      value: { subjectId: subject, sessionId },
    });
    expect(mocks.getClaims).toHaveBeenCalledWith("bearer-token");
    expect(mocks.getUser).toHaveBeenCalledWith("bearer-token");
    await service.authenticate("another-token");
    expect(mocks.createClient).toHaveBeenCalledTimes(2);
    expect(mocks.createClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "test-publishable-key",
      {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      },
    );
  });

  it.each([
    { iss: "https://attacker.supabase.co/auth/v1" },
    { aud: "service_role" },
    { role: "service_role" },
    { exp: 0 },
    { session_id: null },
    { sub: null },
  ])("rejects unexpected claims %j", async (override) => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: { ...claims(), ...override } },
      error: null,
    });
    await expect(service.authenticate("invalid-token")).resolves.toMatchObject({
      status: "error",
      error: { code: "INVALID_SESSION" },
    });
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("rejects missing, deleted, or mismatched upstream users", async () => {
    for (const result of [
      { data: { user: null }, error: new Error("deleted") },
      { data: { user: { ...user(), id: "another-user" } }, error: null },
    ]) {
      mocks.getUser.mockResolvedValue(result);
      await expect(service.authenticate("old-token")).resolves.toMatchObject({
        status: "error",
        error: { code: "INVALID_SESSION" },
      });
    }
  });

  it("rejects unverified OTP email and provider failures without exposing upstream errors", async () => {
    mocks.verifyOtp.mockResolvedValue({
      data: { session: {}, user: { ...user(), email_confirmed_at: undefined } },
      error: null,
    });
    await expect(service.verifyOtp("buyer@example.com", "123456")).resolves.toMatchObject({
      status: "error",
      error: { code: "INVALID_OTP" },
    });
    mocks.signInWithOtp.mockResolvedValue({ error: new Error("private SMTP configuration") });
    await expect(service.sendOtp("buyer@example.com")).resolves.toMatchObject({
      status: "error",
      error: {
        code: "OTP_UNAVAILABLE",
        message: "Unable to send a verification code. Try again later.",
      },
    });
  });

  it("requires the immutable native Web3 identity to match the Ethereum wallet", () => {
    expect(service.assertWalletUser(user(), address).isOk()).toBe(true);
    expect(
      service.assertWalletUser(user(), "0x2222222222222222222222222222222222222222"),
    ).toMatchObject({ status: "error", error: { code: "IDENTITY_MISMATCH" } });
    const edited = user();
    edited.user_metadata.address = address;
    edited.identities = [];
    expect(service.assertWalletUser(edited, address).isErr()).toBe(true);
    const solana = user();
    solana.identities![0]!.identity_data!.chain = "solana";
    expect(service.assertWalletUser(solana, address).isErr()).toBe(true);
  });

  it("lets unexpected SDK rejection escape instead of disguising it as invalid credentials", async () => {
    const defect = new Error("Unexpected SDK defect");
    mocks.getClaims.mockRejectedValue(defect);
    await expect(service.authenticate("token")).rejects.toBe(defect);
  });
});
