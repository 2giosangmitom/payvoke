import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, type Session, type User } from "@supabase/supabase-js";
import { Result } from "better-result";
import { failure, type IdentityResult } from "../shared/identity.errors.js";

export interface VerifiedAuth {
  subjectId: string;
  sessionId: string;
}

@Injectable()
export class SupabaseAuthService {
  private readonly url: string;
  private readonly key: string;

  constructor(config: ConfigService) {
    this.url = config.getOrThrow<string>("SUPABASE_URL").replace(/\/$/, "");
    this.key = config.getOrThrow<string>("SUPABASE_PUBLISHABLE_KEY");
  }

  private client() {
    // Never share mutable Auth state between concurrent users.
    return createClient(this.url, this.key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }

  async sendOtp(email: string): Promise<IdentityResult<void>> {
    const { error } = await this.client().auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    if (error)
      return failure("OTP_UNAVAILABLE", "Unable to send a verification code. Try again later.");
    return Result.ok(undefined);
  }

  async verifyOtp(email: string, token: string): Promise<IdentityResult<Session>> {
    const { data, error } = await this.client().auth.verifyOtp({ email, token, type: "email" });
    if (error || !data.session || !data.user?.email_confirmed_at) {
      return failure("INVALID_OTP", "The verification code is invalid or expired.");
    }
    if (data.user.email?.toLowerCase() !== email)
      return failure("IDENTITY_MISMATCH", "Identity mismatch.");
    return Result.ok(data.session);
  }

  async verifyWallet(message: string, signature: `0x${string}`): Promise<IdentityResult<Session>> {
    const { data, error } = await this.client().auth.signInWithWeb3({
      chain: "ethereum",
      message,
      signature,
    });
    if (error || !data.session)
      return failure("INVALID_WALLET_PROOF", "Wallet authentication failed.");
    return Result.ok(data.session);
  }

  async authenticate(token: string): Promise<IdentityResult<VerifiedAuth>> {
    const client = this.client();
    const { data, error } = await client.auth.getClaims(token);
    const claims = data?.claims;
    if (
      error ||
      !claims ||
      claims.iss !== `${this.url}/auth/v1` ||
      !(
        claims.aud === "authenticated" ||
        (Array.isArray(claims.aud) && claims.aud.includes("authenticated"))
      ) ||
      claims.role !== "authenticated" ||
      typeof claims.sub !== "string" ||
      typeof claims.session_id !== "string" ||
      typeof claims.exp !== "number" ||
      claims.exp <= Date.now() / 1000
    ) {
      return failure("INVALID_SESSION", "A valid user session is required.");
    }
    // Local JWT validation alone does not detect upstream logout or banned users.
    const result = await client.auth.getUser(token);
    if (result.error || result.data.user?.id !== claims.sub) {
      return failure("INVALID_SESSION", "The session is no longer valid.");
    }
    return Result.ok({ subjectId: claims.sub, sessionId: claims.session_id });
  }

  assertWalletUser(user: User, address: string): IdentityResult<void> {
    // Never associate a subject from an unexpected Auth provider with this wallet.
    const matches = user.identities?.some((identity) => {
      const data: Record<string, unknown> = identity.identity_data ?? {};
      return (
        identity.provider === "web3" &&
        data.chain === "ethereum" &&
        typeof data.address === "string" &&
        data.address.toLowerCase() === address
      );
    });
    if (!matches) return failure("IDENTITY_MISMATCH", "The wallet identity did not match.");
    return Result.ok(undefined);
  }
}
