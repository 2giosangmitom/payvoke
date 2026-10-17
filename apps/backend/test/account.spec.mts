import { describe, expect, it } from "vitest";
import { AccountService } from "../src/modules/identity/application/account.service.js";
import type { ProfileRepository } from "../src/modules/identity/application/profile.repository.js";
import { AppUser } from "../src/modules/identity/domain/app-user.js";

// A second adapter exercises the application interface without an ORM or server.
class MemoryProfiles implements ProfileRepository {
  readonly users = new Map<string, AppUser>();
  saves = 0;

  async getOrCreate(accountId: string): Promise<AppUser> {
    if (!this.users.has(accountId)) {
      const user = new AppUser();
      user.id = accountId;
      this.users.set(accountId, user);
    }
    return this.get(accountId);
  }

  async get(accountId: string): Promise<AppUser> {
    const user = this.users.get(accountId);
    if (!user) throw new Error("Profile not found.");
    return user;
  }

  async save(user: AppUser): Promise<void> {
    this.users.set(user.id, user);
    this.saves++;
  }
}

function setup() {
  const profiles = new MemoryProfiles();
  const accounts = new AccountService({ profiles });
  const principal = { accountId: "buyer" };
  return { profiles, accounts, principal };
}

describe("account use cases", () => {
  it("creates a profile once and exposes only public fields", async () => {
    const { profiles, accounts, principal } = setup();
    expect((await accounts.ensureProfile(principal)).isOk()).toBe(true);
    expect((await accounts.ensureProfile(principal)).isOk()).toBe(true);
    expect(profiles.users.size).toBe(1);
    expect(await accounts.me(principal)).toEqual({
      id: "buyer",
      displayName: null,
      avatarUrl: null,
      status: "active",
    });
  });

  it("rejects suspended profiles without changing them", async () => {
    const { profiles, accounts, principal } = setup();
    const user = await profiles.getOrCreate(principal.accountId);
    user.status = "suspended";
    expect(await accounts.ensureProfile(principal)).toMatchObject({
      status: "error",
      error: { code: "ACCOUNT_UNAVAILABLE" },
    });
    expect(user.status).toBe("suspended");
    expect(profiles.saves).toBe(0);
  });

  it("trims names, preserves omitted fields and permits clearing an avatar", async () => {
    const { profiles, accounts, principal } = setup();
    await accounts.ensureProfile(principal);
    expect(
      await accounts.updateProfile(principal, {
        displayName: " Buyer ",
        avatarUrl: "https://example.com/avatar.png",
      }),
    ).toMatchObject({ status: "ok", value: { displayName: "Buyer" } });
    expect(await accounts.updateProfile(principal, { avatarUrl: null })).toMatchObject({
      status: "ok",
      value: { displayName: "Buyer", avatarUrl: null },
    });
    expect(profiles.saves).toBe(2);
  });

  it.each([
    [{ displayName: "  " }, "INVALID_DISPLAY_NAME"],
    [{ avatarUrl: "http://example.com/avatar.png" }, "INVALID_AVATAR_URL"],
    [{ avatarUrl: "https://user:secret@example.com/avatar.png" }, "INVALID_AVATAR_URL"],
  ] as const)(
    "rejects invalid changes without mutating or saving the profile: %j",
    async (input, code) => {
      const { profiles, accounts, principal } = setup();
      await accounts.ensureProfile(principal);
      const result = await accounts.updateProfile(principal, input);
      expect(result).toMatchObject({ status: "error", error: { code } });
      expect(profiles.saves).toBe(0);
      expect(await accounts.me(principal)).toMatchObject({ displayName: null, avatarUrl: null });
    },
  );

  it("validates all changes before mutating the profile", async () => {
    const { accounts, principal } = setup();
    await accounts.ensureProfile(principal);
    await accounts.updateProfile(principal, {
      displayName: "Buyer",
      avatarUrl: "http://example.com/avatar.png",
    });
    expect(await accounts.me(principal)).toMatchObject({ displayName: null, avatarUrl: null });
  });
});
