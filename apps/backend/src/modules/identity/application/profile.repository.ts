import type { AppUser } from "../domain/app-user.js";

export interface ProfileRepository {
  getOrCreate(accountId: string): Promise<AppUser>;
  get(accountId: string): Promise<AppUser>;
  save(user: AppUser): Promise<void>;
}
