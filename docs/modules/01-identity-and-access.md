# M01 Identity and Access

Supabase Auth owns users, email OTP, wallet authentication, sessions, token refresh and identity linking. The frontend uses the Supabase SDK directly. Configure providers, redirect URLs, email delivery and rate limits in Supabase.

The backend verifies `Authorization: Bearer <accessToken>` with Supabase `auth.getUser(token)`. It does not issue tokens or maintain its own login challenges, session admissions or identity bindings.

## Application profiles

`public.app_users` stores display name, avatar URL, account status and timestamps. Its primary key is the Supabase user ID. A verified request creates the profile if it does not exist; suspended profiles cannot access protected API routes.

- `GET /v1/me` reads the current profile.
- `PATCH /v1/me` updates its display name and HTTPS avatar URL.

RLS is enabled without browser policies. The backend uses a trusted database connection and checks the current user before reading or changing a profile. MikroORM migrations manage application tables only, never Supabase's `auth` schema.

## MVP boundary

Each workspace or conversation belongs to one user. Project collaboration and `project_memberships` are out of scope. Agents are provider listings, not projects; selecting an agent does not create a shared workspace.

Use Supabase's supported identity-linking flows. Different Supabase user IDs remain separate application accounts; there is no automatic merge or custom email/wallet linking protocol. Sign-out and access-token validity follow Supabase's session behavior; there is no separate application revocation list.

Authentication does not grant spending permission. [M06](06-smart-accounts-and-payments.md) owns payment authorization; real funds remain disabled until [verification](../verification.md) passes.

## Resources

- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Email OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Web3 authentication](https://supabase.com/docs/guides/auth/auth-web3)
- [Identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking)
- [Backend setup](../../apps/backend/README.md#authentication)
