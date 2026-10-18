# M01 — Identity and Access

**Status: planned specification.** Owns application users, authorization and wallet ownership bindings. Authentication never grants permission to pay.

## Features

| Feature              | Behavior                                                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in and sessions | Supabase-managed email and supported wallet sign-in; session refresh, logout and reauthentication                                 |
| Profile              | Display name/avatar, preferences and account status                                                                               |
| Roles                | Buyer/provider are normal user capabilities; catalog reviewer, support, dispute approver and finance roles are separately granted |
| Wallet binding       | Challenge binds user, address, chain, nonce, audience and expiry; verify current ownership before recording                       |
| Access enforcement   | Check owner and account status on every command, read, file grant and subscription                                                |
| Account recovery     | Recover application login through supported identity flows; no implicit wallet transfer or duplicate-account merge                |
| Security history     | Record sensitive role, wallet and session-management actions with restricted audit access                                         |

One user owns a workspace. A provider application has one provider owner initially; organization roles are deferred. A public profile is separate from legal/commercial seller verification.

## Owned records and interfaces

Owns `UserProfile`, `RoleGrant`, `WalletBinding`, `WalletChallenge` and sensitive-access audit references. Supabase owns authentication sessions; M01 does not invent a second session issuer.

Proposed commands: `getMe`, `updateProfile`, `createWalletChallenge`, `verifyWalletChallenge`, `removeWalletBinding`, `suspendAccount`, `grantRole`, `revokeRole`. HTTP adapters use `/v1/me`, `/v1/me/wallet-challenges`, `/v1/me/wallets` and protected operator routes. Signature formats and supported wallet types must be pinned and tested before release.

A quote names one payer wallet. Changing the connected wallet invalidates checkout preparation and requires re-binding the quote. Existing payment/refund history retains the original payer. Removing a wallet binding does not redirect refunds; losing wallet keys cannot be repaired by changing an application profile.

## Authorization and failure behavior

Expired sessions stop protected commands and live streams, while re-login restores the same operation. Suspension blocks new work; provide a separately authorized support/export/refund route rather than confiscating already owed funds. Browser logout does not revoke provider API keys or external client grants; each has explicit management.

Wallet challenges are single-use, bounded and replay-protected. Signing an ownership challenge is not signing a payment ticket. Address case, chain mismatch, expired challenges and contract-wallet verification require deterministic handling. Never merge two application IDs because a model or email field suggests they belong together.

## Acceptance conditions

- Cross-owner reads, writes, streams and file grants fail; operator permissions are least-privilege and audited.
- Stolen/expired challenges cannot bind another user or another chain; exact retries recover a completed binding safely.
- Switching wallet during checkout cannot pay a quote bound to another payer.
- Profile or role edits cannot modify paid order ownership, refund destination or provider payout history.

Dependencies: M02/M07 resource ownership; M06 payment bindings; M08 external grants. Authentication provider details belong in deployment documentation, not business policy.
