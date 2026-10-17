import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Environment } from "../src/config/environment.js";
import { SupabaseAuthService } from "../src/modules/identity/infrastructure/supabase-auth.service.js";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), getUser: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

const env = {
  DATABASE_URL: "postgresql://localhost:5432/agentne",
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "test-key",
  AUTH_ORIGIN: "http://localhost:3000",
  PORT: 8000,
} satisfies Environment;

describe("Supabase Auth adapter", () => {
  let service: SupabaseAuthService;

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createClient.mockReturnValue({ auth: { getUser: mocks.getUser } });
    service = new SupabaseAuthService({ env });
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
