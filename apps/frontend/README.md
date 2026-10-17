# Frontend

Run `pnpm --filter frontend dev` from the repository root, then open http://localhost:3000.

## Workspace chat (initial M02 slice)

Open `/workspace` after signing in. Create a workspace, save a task brief, and create a conversation. The UI uses assistant-ui's official AG-UI runtime; the backend streams AG-UI events over SSE. The existing Geist font and monochrome theme tokens are reused, including the existing dark theme. Mobile navigation uses the **Workspaces** button so the conversation keeps the available screen height.

Set `VITE_API_HOST` to the backend origin (default `http://localhost:8000`), and set the backend's `AUTH_ORIGIN` to the frontend origin. Apply backend migrations first. API calls and subscriptions obtain the current Supabase bearer token for every request. No token is placed in a URL.

The responder is explicitly **development-only**: no model calls, real agent execution, hiring, or spending. Briefs and messages persist in PostgreSQL. Sending is an idempotent command; reconnection only replays saved events. Reloading restores saved history, and the selected workspace/conversation is kept in URL search parameters. Safe Markdown rendering excludes images, raw HTML, non-HTTPS links, and provider components.

See [M02 implementation status](../../docs/modules/02-workspace-and-conversation.md#implementation-status) for API limits and deferred behavior. The registered widget/action catalog and real coordinator/provider integration are not implemented yet.

### Chat tests

```sh
pnpm --filter frontend test
pnpm --filter frontend exec playwright install chromium
pnpm --filter frontend test:e2e
```

Unit tests exercise the reconnect transport and Markdown boundary. Browser tests start an isolated Vite server on port 3100 with test-only public settings and mock Supabase sessions/API responses; they do not use your `.env` credentials or prove live email/wallet authentication. They cover assistant-ui rendering, brief editing, streaming, saved-history reload, sign-in gating, and 375px mobile layout. Database-backed API tests live in the backend suite.

## Email sign-in

The homepage's sign-in dialog uses Supabase email magic links. New email addresses create an account; existing users sign in. Enter an email, then follow the link in the email to finish signing in. There is no code-entry step and no password or wallet connection is required.

Set these public browser settings in `apps/frontend/.env`:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Never use a Supabase service-role or secret key in a `VITE_` variable.

In Supabase, enable the Email provider and configure email delivery. Keep a link using `{{ .ConfirmationURL }}` in the **Magic Link** template and in **Confirm signup** if email confirmation is enabled. For example:

```html
<h2>Sign in to AgentNe</h2>
<p><a href="{{ .ConfirmationURL }}">Sign in</a></p>
```

Set Supabase's Site URL to your frontend URL and allow the frontend root URL in **URL Configuration → Redirect URLs** (for example, `http://localhost:3000/` for local development). The client explicitly requests a redirect to the current frontend origin's root. Supabase's `signInWithOtp` method sends the magic link; the existing browser client detects the returned session in the callback URL.

The inbox confirmation shows the recipient, offers resend after 60 seconds, and lets the user change their email. Supabase's configured expiration and rate limits remain authoritative. Sessions persist through the existing Supabase browser client and synchronize across same-origin tabs; the homepage reflects session changes and offers sign-out. Signing in does not authorize payments.

## Wallet sign-in

The dialog starts with a choice of email or wallet sign-in, using the supplied reference for layout only. Wallet sign-in opens a separate selection screen with back navigation. It offers MetaMask and Trust Wallet; **Other wallets** opens the list of other wallets discovered through EIP-6963, or a generic browser-wallet option. A small green marker means the provider is available in this browser, not that the user is authenticated. Each named option targets that wallet specifically; if it is unavailable, the UI explains that it must be installed or opened in its wallet browser. WalletConnect/QR and Solana are not included.

The dialog uses the project's existing shadcn `base-nova` components, theme tokens, radii, and Geist font. It inherits the app's light/dark theme without a separate auth palette. The footer identifies Supabase, the actual authentication provider; no Privy or Google integration is implied by the visual reference.

MetaMask and Trust Wallet use full-color `branded` icons from [`@web3icons/react`](https://www.web3icons.io/). Simple Icons supplies the Ethereum logo for generic wallets; other discovered wallets can supply their own data-URI icon. Wallet logos are not loaded from third-party servers at runtime.

Enable the **Web3 / Ethereum** provider in Supabase Authentication. Add the frontend URLs to Supabase's allowed Redirect URLs, for example `http://localhost:3000/**` during development and your exact production domain. Configure Web3 rate limits before public use. If you enable CAPTCHA, its challenge/token flow must be implemented before using this sign-in UI.

The selected wallet signs a standard Sign-In with Ethereum message bound to the current domain, URL, wallet address, chain ID, a random nonce, and a ten-minute expiry. Supabase verifies the message and signature and issues the session. Sign-in does not switch networks, send a transaction, request token approvals, or authorize spending. A wallet connection by itself is not an authenticated session.

Wallet accounts may not have an email; the UI uses the wallet address from the Supabase identity when available. Email and wallet sign-ins can create separate accounts. They are not automatically merged or linked. Use Supabase's supported identity-linking flow if account linking is added later. Signing out ends the Supabase session, not the wallet extension's connection permission.

## Verification

```sh
pnpm --filter frontend exec tsc --noEmit
pnpm --filter frontend build
pnpm exec oxlint apps/frontend/src/components apps/frontend/src/routes/index.tsx
pnpm exec oxfmt --check apps/frontend/src/components apps/frontend/src/routes/index.tsx
```

For a live smoke test, send a link to an inbox you control, open it, reload to check persistence, then sign out. Also check opening the link in a new tab, resend, changing email, Escape dismissal, keyboard focus, and a narrow mobile viewport. Live email delivery requires a configured Supabase project and is not proven by a successful build.

For wallet sign-in, test with no wallet installed, rejected connection/signature requests, multiple installed wallets, a successful sign-in, persistence after reload, and sign-out. Confirm the wallet only requests a message signature and that Supabase rejects invalid signatures. Live verification requires the Web3 provider and allowed URLs above; mocked browser tests do not prove those settings.
