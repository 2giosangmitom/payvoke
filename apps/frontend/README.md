# Frontend

Run `pnpm --filter frontend dev` from the repository root, then open http://localhost:3000.

## Marketplace and provider console

The UI follows the approved marketplace + console layout: shared navigation, a light canvas, fine-bordered cards, the existing Geist font and an indigo accent. The shipped screens are:

- `/`: wallet-free agent discovery with task/provider search and filters **on the current 50-item page**, URL-persisted filters and pagination. No sample listings, ratings or usage metrics are inserted into real data.
- `/agents/:agentId`: direct public agent details with overview/input/output/terms tabs. Paused, unpublished and suspended-provider listings return unavailable. Pricing is a declaration, not a payable quote; execution remains disabled.
- Authenticated users can choose one of their workspaces on the agent detail page to prepare an immutable fixed-price quote preview and record a `pending_admission` intent. The preview shows the pinned brief, input, variant, limits and terms. It never starts payment or buyer execution.
- `/provider`: authenticated provider profile creation, listings, immutable manifest creation, review submission, publication, pause/resume and rollback by publishing an older approved version. There is no provider-side approval action. Manifest input is complete JSON validated by the backend; credentials never belong in it.
- `/provider?section=applications`: create/select applications, issue narrowly scoped 90-day API keys, view/revoke keys, inspect registered commands and Gateway connection leases, and run owner-only commands in the Playground. A newly issued secret lives only in component state, never React Query's cache, local/session storage or a URL; closing the acknowledgement step or leaving the section clears it.
- `/workspace`: the existing private chat and versioned briefs, restyled to match the shared shell. On narrow screens, **Workspaces** switches between workspace/conversation navigation and chat; the header menu opens the main app navigation.

Public catalog requests use a separate API client without Supabase bearer tokens. Provider/workspace calls still use the authenticated client. Apply backend migrations and configure `VITE_API_HOST` before using the API. An empty catalog is expected until an operator-reviewed version is published.

All REST calls use **openapi-fetch** in `src/lib/api.ts` with `paths` generated from the backend OpenAPI document (`pnpm --filter backend sdk`). React Query handles cached reads/polling. The existing AG-UI SSE transport remains specialized; browser sessions never connect to the provider Gateway or store provider keys for runtime authentication.

### Gateway workflow

1. In **Provider console → Applications**, create an application and a key. Use separate registration/connection keys where practical; the combined scope is available for development. Save the one-time secret on the provider server.
2. Register commands and connect using [`@agentne/provider-sdk`](../../packages/provider-sdk/README.md). The connection badge reflects the last live database lease, not admission/readiness for paid work.
3. Open **Playground**, select a command, enter schema-generated fields and acknowledge possible provider model expense. Read canonical progress/results in invocation history. Refreshing or switching pages never POSTs an invocation; retrying unchanged input after a lost response reuses the same UUID. A five-minute sandbox deadline and the command's input schema apply.
4. In **Listings**, create a draft. Paste the provider's HTTP v1 declaration or start a Gateway draft, select an application and click **Pin this command revision**. This produces manifest v2 without an HTTP endpoint or duplicated action schemas. Complete/review the name, model and data disclosures; save, submit, obtain operator approval and publish. Registration changes do not retarget the saved revision. A blank starter draft is not ready to submit.
5. In your private **Workspace**, type `/` or use **Commands**. Only your own published, approved, unpaused Gateway listings appear. Arrow keys/Enter select a command, then a dialog collects parameters and explicit model-expense confirmation. Manifest input/deadline bounds and command schemas are enforced by the backend. Provider results render as inert safe Markdown/source in a separately labelled command history inside the conversation viewport; normal messages retain the deterministic AG-UI responder.

Command state is stored on the server, not reconstructed from localStorage or model text. The browser polls saved snapshots while commands run, including after reload; it never resubmits work as a recovery mechanism. Pausing/replacing a listing blocks new invocations but does not hide or retarget existing IDs. `uncertain` is not a retryable failure. This owner-only development flow does not enable buyer execution, purchases, automatic spending, verified SVG rendering or payments.

The accent and font live in `src/assets/css/main.css`; shared marketplace layout and semantic state colors live in `src/assets/css/marketplace.css`. Existing dark tokens remain available, but this redesign does not add a theme switcher. Router devtools are opt-in during development with `VITE_ROUTER_DEVTOOLS=true`.

## Workspace chat (initial M02 slice)

Open `/workspace` after signing in. Create a workspace, save a task brief, and create a conversation. The UI uses assistant-ui's official AG-UI runtime; the backend streams AG-UI events over SSE. The existing Geist font and semantic theme tokens are reused with the shared marketplace shell. Mobile navigation uses the **Workspaces** button so the conversation keeps the available screen height.

Set `VITE_API_HOST` to the backend origin (default `http://localhost:8000`), and set the backend's `AUTH_ORIGIN` to the frontend origin. Apply backend migrations first. API calls and subscriptions obtain the current Supabase bearer token for every request. No token is placed in a URL.

The normal text responder is explicitly **development-only**: no model calls, real agent execution, hiring, or spending. Explicit slash commands use the separate owner-only development flow above and may call a provider-owned model. Briefs and messages persist in PostgreSQL. Sending is an idempotent command; reconnection only replays saved events. Reloading restores saved history, and the selected workspace/conversation is kept in URL search parameters. Safe Markdown rendering excludes images, raw HTML, non-HTTPS links, and provider components.

See [M02 implementation status](../../docs/modules/02-workspace-and-conversation.md#implementation-status) for API limits and deferred behavior. Arbitrary widgets, a real clarification coordinator and buyer/provider commercial execution are not implemented.

### Chat tests

```sh
pnpm --filter frontend test
pnpm --filter frontend exec playwright install chromium
pnpm --filter frontend test:e2e
```

Unit tests exercise catalog filtering/pricing, command inputs, the reconnect transport and Markdown boundary. Browser tests start an isolated Vite server on port 3100 with test-only public settings and mock Supabase sessions/API responses; they do not use your `.env` credentials or prove live email/wallet authentication. They cover wallet-free catalog/details, empty/error states, application/key creation and revocation, one-time secret handling, playground status recovery, Gateway revision binding/publication, slash autocomplete/confirmation, inert provider results, assistant-ui rendering, brief editing, streaming/reset, sign-in gating, and 375px mobile layout. Operator approval in browser tests is simulated externally, not granted to the provider UI. Database-backed API/SDK/Gateway tests live in the backend suite.

## Email sign-in

The shared navigation's sign-in dialog uses Supabase email magic links. New email addresses create an account; existing users sign in. Enter an email, then follow the link in the email to finish signing in. There is no code-entry step and no password or wallet connection is required.

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
pnpm --filter frontend typecheck
pnpm --filter frontend build
pnpm exec oxlint apps/frontend/src/components apps/frontend/src/routes/index.tsx
pnpm exec oxfmt --check apps/frontend/src/components apps/frontend/src/routes/index.tsx
```

For a live smoke test, send a link to an inbox you control, open it, reload to check persistence, then sign out. Also check opening the link in a new tab, resend, changing email, Escape dismissal, keyboard focus, and a narrow mobile viewport. Live email delivery requires a configured Supabase project and is not proven by a successful build.

For wallet sign-in, test with no wallet installed, rejected connection/signature requests, multiple installed wallets, a successful sign-in, persistence after reload, and sign-out. Confirm the wallet only requests a message signature and that Supabase rejects invalid signatures. Live verification requires the Web3 provider and allowed URLs above; mocked browser tests do not prove those settings.
