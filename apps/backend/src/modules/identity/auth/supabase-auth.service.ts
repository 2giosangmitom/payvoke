import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient } from "@supabase/supabase-js";
import { Result } from "better-result";
import { failure, type IdentityResult } from "../shared/identity.errors.js";
import type { Principal } from "../identity.types.js";

@Injectable()
export class SupabaseAuthService {
  private readonly client;

  constructor(config: ConfigService) {
    this.client = createClient(
      config.getOrThrow<string>("SUPABASE_URL"),
      config.getOrThrow<string>("SUPABASE_PUBLISHABLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    );
  }

  async authenticate(token: string): Promise<IdentityResult<Principal>> {
    const { data, error } = await this.client.auth.getUser(token);
    if (error || !data.user || data.user.aud !== "authenticated") {
      return failure("INVALID_SESSION", "A valid user session is required.");
    }
    return Result.ok({ accountId: data.user.id });
  }
}
