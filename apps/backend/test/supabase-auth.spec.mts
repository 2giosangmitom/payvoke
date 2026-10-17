import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SupabaseAuthService } from "../src/modules/identity/auth/supabase-auth.service.js";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), getUser: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

describe("Supabase Auth adapter", () => {
  let service: SupabaseAuthService;

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createClient.mockReturnValue({ auth: { getUser: mocks.getUser } });
    service = new SupabaseAuthService(
      new ConfigService({
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "test-key",
      }),
    );
  });

  it("uses the verified Supabase user ID as the account ID", async () => {
    const accountId = "161edc3c-8bc6-4f35-a225-e6a6b3a37839";
    mocks.getUser.mockResolvedValue({
      data: { user: { id: accountId, aud: "authenticated" } },
      error: null,
    });
    await expect(service.authenticate("token")).resolves.toMatchObject({
      status: "ok",
      value: { accountId },
    });
    expect(mocks.getUser).toHaveBeenCalledWith("token");
  });

  it("rejects tokens refused by Supabase", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error("Invalid token") });
    await expect(service.authenticate("invalid-token")).resolves.toMatchObject({
      status: "error",
      error: { code: "INVALID_SESSION" },
    });
  });
});
