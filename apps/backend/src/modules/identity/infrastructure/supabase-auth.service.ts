import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Result } from "better-result";
import type { Environment } from "../../../config/environment.js";
import { failure, type IdentityResult } from "../domain/identity.errors.js";
import type { Principal } from "../domain/identity.types.js";

export class SupabaseAuthService {
  readonly #auth: SupabaseClient;

  constructor({ env }: { env: Environment }) {
    this.#auth = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }

  async authenticate(token: string): Promise<IdentityResult<Principal>> {
    const { data, error } = await this.#auth.auth.getUser(token);
    if (error || !data.user || data.user.aud !== "authenticated") {
      return failure("INVALID_SESSION", "A valid user session is required.");
    }
    return Result.ok({ accountId: data.user.id });
  }
}
