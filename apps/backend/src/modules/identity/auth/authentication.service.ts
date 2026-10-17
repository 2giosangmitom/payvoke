import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Result } from "better-result";
import type { Session } from "@supabase/supabase-js";
import { getAddress, recoverMessageAddress } from "viem";
import { createSiweMessage } from "viem/siwe";
import { AuthChallenge } from "../identity.entity.js";
import { failure, IdentityError, type IdentityResult } from "../shared/identity.errors.js";
import { AuthenticationStore } from "./authentication.store.js";
import { ChallengeStore } from "./challenge.store.js";
import { CHALLENGE_TTL_MS, FUJI_CHAIN_ID, requireRecentAuthentication } from "./auth.policy.js";
import { SupabaseAuthService } from "./supabase-auth.service.js";
import type {
  AuthTokens,
  ChallengeView,
  EmailVerification,
  Principal,
  WalletRequest,
  WalletVerification,
} from "../identity.types.js";

@Injectable()
export class AuthenticationService {
  private readonly origin: URL;

  constructor(
    private readonly challenges: ChallengeStore,
    private readonly authentication: AuthenticationStore,
    private readonly supabase: SupabaseAuthService,
    config: ConfigService,
  ) {
    this.origin = new URL(config.getOrThrow<string>("AUTH_ORIGIN"));
    if (
      (this.origin.protocol !== "https:" &&
        !(this.origin.protocol === "http:" && this.origin.hostname === "localhost")) ||
      this.origin.username ||
      this.origin.password ||
      this.origin.pathname !== "/" ||
      this.origin.search ||
      this.origin.hash
    ) {
      throw new Error(
        "AUTH_ORIGIN must be an HTTPS origin (HTTP localhost is allowed for development).",
      );
    }
  }

  private challengeView(challenge: AuthChallenge): ChallengeView {
    return {
      challengeId: challenge.id,
      expiresAt: challenge.expiresAt.toISOString(),
      message: challenge.message,
    };
  }

  async requestEmail(
    email: string,
    ip: string,
    principal?: Principal,
  ): Promise<IdentityResult<ChallengeView>> {
    return Result.gen(async function* (this: AuthenticationService) {
      yield* requireRecentAuthentication(principal);
      email = email.trim().toLowerCase();
      yield* Result.await(this.challenges.throttle("email-send-ip", ip, 10, 900));
      yield* Result.await(this.challenges.throttle("email-send-address", email, 1, 60));
      const challenge = new AuthChallenge();
      Object.assign(challenge, {
        purpose: principal ? "email-link" : "email-login",
        identifier: email,
        userId: principal?.accountId ?? null,
        sessionId: principal?.sessionId ?? null,
        expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
      });
      await this.challenges.save(challenge);
      yield* Result.await(this.supabase.sendOtp(email));
      return Result.ok(this.challengeView(challenge));
    }, this);
  }

  verifyEmail(input: EmailVerification, ip: string): Promise<IdentityResult<AuthTokens>>;
  verifyEmail(
    input: EmailVerification,
    ip: string,
    principal: Principal,
  ): Promise<IdentityResult<void>>;
  async verifyEmail(
    input: EmailVerification,
    ip: string,
    principal?: Principal,
  ): Promise<IdentityResult<AuthTokens | void>> {
    return Result.gen(async function* (this: AuthenticationService) {
      yield* requireRecentAuthentication(principal);
      yield* Result.await(this.challenges.throttle("email-verify-ip", ip, 20, 300));
      const challenge = yield* Result.await(
        this.challenges.find(
          input.challengeId,
          principal ? "email-link" : "email-login",
          principal,
        ),
      );
      // An OTP attempt consumes this local challenge, including an invalid attempt. Resend to retry.
      yield* Result.await(this.challenges.consume(challenge));
      const session = yield* Result.await(
        this.supabase.verifyOtp(challenge.identifier, input.token),
      );
      return this.finish(session, "email", challenge.identifier, principal);
    }, this);
  }

  async requestWallet(
    input: WalletRequest,
    ip: string,
    principal?: Principal,
  ): Promise<IdentityResult<ChallengeView>> {
    return Result.gen(async function* (this: AuthenticationService) {
      yield* requireRecentAuthentication(principal);
      if (input.chainId !== FUJI_CHAIN_ID)
        return failure("UNSUPPORTED_CHAIN", "Only Avalanche Fuji is supported.");
      yield* Result.await(this.challenges.throttle("wallet-challenge-ip", ip, 20, 300));
      const address = yield* Result.try({
        try: () => getAddress(input.address),
        catch: () =>
          new IdentityError({ code: "INVALID_ADDRESS", message: "Invalid EVM address." }),
      });
      const challenge = new AuthChallenge();
      const now = new Date();
      challenge.purpose = principal ? "wallet-link" : "wallet-login";
      challenge.identifier = address.toLowerCase();
      challenge.userId = principal?.accountId ?? null;
      challenge.sessionId = principal?.sessionId ?? null;
      challenge.expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS);
      challenge.message = createSiweMessage({
        domain: this.origin.host,
        address,
        uri: `${this.origin.origin}/`,
        version: "1",
        chainId: input.chainId,
        nonce: randomBytes(24).toString("hex"),
        issuedAt: now,
        notBefore: now,
        expirationTime: challenge.expiresAt,
        requestId: challenge.id,
        statement: principal
          ? `Link this wallet to marketplace account ${principal.accountId}. No spending authority is granted.`
          : "Sign in to AgentNe. No transaction or spending authority is granted.",
      });
      await this.challenges.save(challenge);
      return Result.ok(this.challengeView(challenge));
    }, this);
  }

  verifyWallet(input: WalletVerification, ip: string): Promise<IdentityResult<AuthTokens>>;
  verifyWallet(
    input: WalletVerification,
    ip: string,
    principal: Principal,
  ): Promise<IdentityResult<void>>;
  async verifyWallet(
    input: WalletVerification,
    ip: string,
    principal?: Principal,
  ): Promise<IdentityResult<AuthTokens | void>> {
    return Result.gen(async function* (this: AuthenticationService) {
      yield* requireRecentAuthentication(principal);
      yield* Result.await(this.challenges.throttle("wallet-verify-ip", ip, 20, 300));
      const challenge = yield* Result.await(
        this.challenges.find(
          input.challengeId,
          principal ? "wallet-link" : "wallet-login",
          principal,
        ),
      );
      if (!challenge.message) return failure("INVALID_CHALLENGE", "Invalid wallet challenge.");
      const message = challenge.message;
      const address = yield* Result.await(
        Result.tryPromise({
          try: () =>
            recoverMessageAddress({
              message,
              signature: input.signature as `0x${string}`,
            }),
          catch: () =>
            new IdentityError({
              code: "INVALID_SIGNATURE",
              message: "Only a valid EOA wallet signature is supported.",
            }),
        }),
      );
      if (address.toLowerCase() !== challenge.identifier)
        return failure("INVALID_SIGNATURE", "The signer does not match the wallet.");
      yield* Result.await(this.challenges.consume(challenge));
      // Never hold a database transaction across this network call.
      const session = yield* Result.await(
        this.supabase.verifyWallet(message, input.signature as `0x${string}`),
      );
      yield* this.supabase.assertWalletUser(session.user, challenge.identifier);
      return this.finish(session, "wallet", challenge.identifier, principal);
    }, this);
  }

  private async finish(
    session: Session,
    method: "email" | "wallet",
    identifier: string,
    principal?: Principal,
  ): Promise<IdentityResult<AuthTokens | void>> {
    return Result.gen(async function* (this: AuthenticationService) {
      const auth = yield* Result.await(this.supabase.authenticate(session.access_token));
      if (auth.subjectId !== session.user.id)
        return failure("IDENTITY_MISMATCH", "Identity mismatch.");
      const user = yield* Result.await(
        this.authentication.completeAuthentication(auth, method, identifier, principal),
      );
      if (principal) return Result.ok(undefined);
      return Result.ok({
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresAt: session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in,
        tokenType: "bearer" as const,
        user,
      });
    }, this);
  }
}
