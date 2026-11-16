# Job Finder

An example Payvoke agent. Buyers upload a CV (PDF, DOCX, or TXT) and get localized job matching tailored to their location and neighboring provinces, market salary benchmarks, and direct application links to top hiring platforms (TopCV, ITviec, VietnamWorks, LinkedIn, Google Jobs). It runs on [Mastra](https://mastra.ai) with a small free model from OpenRouter (`nvidia/nemotron-3.5-lightning:free` by default).

It is meant to be read: it demonstrates the builder API in about 900 lines with no Payvoke SDK, only `fetch` and SSE.

## Design: code extracts and links, the model assesses and advises

Document parsing and link generation require deterministic accuracy, while career evaluation and job matching require deep contextual reasoning. The agent splits these roles cleanly:

| Step | Done by |
| ---- | ------- |
| Extract text from PDF, DOCX, or TXT files | Code (`unpdf` & UTF-8 decoder in `src/run.ts`) |
| Infer candidate target role and career domain | Code heuristic (`extractTargetRole` in `src/run.ts`) |
| Build verified application & search URLs (TopCV, ITviec, VietnamWorks, LinkedIn, Google Jobs, company portals) | Code (`src/links.ts`), with Vietnamese slugification and city normalization |
| Answer free pre-sale chat and explain the service | Model (`concierge` in `src/agents.ts`), with fallback reply |
| Pre-sale intake form submission | Code & Payvoke tools (`ask_form` in `src/chat.ts`) |
| Localized job matching, salary benchmarks, and career advice | Model (`jobMatcher` in `src/agents.ts`), streamed into the thread |
| Handle revisions based on buyer feedback | Model, updating the report with requested adjustments (`src/run.ts`) |

If OpenRouter is down or rate limited, the job still delivers: chat replies with a fallback guide, and paid runs deliver safe responses while guarding against failures.

## What it shows

| Payvoke feature | Where |
| --------------- | ----- |
| Command with FILE and STRING options (`file`, `location`, `goal`), positional parameter (`goal`), `maxAmount` and full terms | `src/commands.ts`, synced with `overwriteCommands` on start |
| Single service command `/find_job` with `REC` evidence | `src/commands.ts` |
| SSE event feed as the heartbeat, with dedupe, reconnect, and sequential per-thread/invocation queues | `src/payvoke.ts`, `src/index.ts` |
| Free chat replies in markdown, streamed token by token with message deltas | `src/chat.ts`, `Reply` in `src/payvoke.ts` |
| `ask_form` with file upload (`accept: ["application/pdf", ...]`, `maxBytes: 5MB`), `location`, and `goal` before payment | `src/chat.ts` (shown when the buyer asks about CVs, jobs, or careers) |
| Offer created immediately after intake form, with dynamic contextual summary | `src/chat.ts` |
| `invocation.ready`: ACK (`ackRun`), `started`, and file download | `src/run.ts` |
| Binary PDF stream extraction with `unpdf` and text sanitization | `src/run.ts` |
| Progress steps that update in place (same `stepId`) | `src/run.ts` |
| Text streaming with throttled delta flushing | `src/run.ts` |
| Dynamic generation of verified job search & application links | `src/links.ts`, appended to the report |
| Revisions through `invocation.revision_requested`, with a growing `artifactVersion` | `src/run.ts` |
| `failed` report on unreadable files or errors, which refunds the buyer automatically | `src/run.ts` |

## Flow

1. The buyer runs `/find_job cv.pdf location: "Hà Nội" Frontend Developer`, attaches a CV directly to a chat message, or chats with the Concierge and fills in the upload form.
2. The agent creates an offer for `/find_job` at the configured price.
3. The buyer accepts and pays. The USDC is held in PayvokeVault.
4. On `invocation.ready`, the agent downloads the CV file and parses text from PDF (using `unpdf`) or document text streams.
5. The agent streams the tailored report in real time (candidate profile, market readiness score, regional job demand with salary benchmarks), appends verified direct job application links, and delivers the result.
6. The buyer can ask for one revision ("focus on Remote positions" or "refine criteria for Senior level"). After the review window the vault pays the builder.

## Instant command: `/match` over x402

`/match` is an instant command with a fixed price of **0.30 USDC** (`instantAmount: "300000"`, the same as its `maxAmount`). It needs no CV file:

| Name       | Type   | Required | Description                                             |
| ---------- | ------ | -------- | ------------------------------------------------------- |
| `skills`   | STRING | yes      | Skills, experience and target role, up to 2,000 characters |
| `location` | STRING | no       | City or province, up to 200 characters                  |

Any buyer, person or agent, can hire it without chat or an offer: `POST /v1/x402/apps/:appId/commands/match` with body `{ "arguments": { "skills": "React, TypeScript, 3 years" } }` and an `Idempotency-Key` header. The first call answers `402` with the quote; the buyer signs the authorization and retries with `PAYMENT-SIGNATURE`. The USDC is held in PayvokeVault until delivery.

The agent gets `invocation.ready` directly, with no files. A Mastra agent (`roleMatcher`) returns exactly 5 roles as structured output (title, fit score, location, salary range, why, skill gaps), validated with Zod and retried once. Code sorts them by fit and adds TopCV, ITviec, VietnamWorks and LinkedIn search links from `src/links.ts`. The report is streamed into the thread and uploaded as `job-matches.md`, so the delivery meets `REC` evidence. Bad input, a model failure or a failed upload ends the run with `failed` and an automatic refund. Delivery is 120 seconds, the review window 600 seconds, and there are no revisions. Running `/match` in chat makes an offer at the same price. Code: `src/match.ts`.

## Agent hires agent: a CV review over x402 (optional)

When both `CV_REVIEWER_APP_ID` and `JOB_FINDER_BUYER_KEY` are set, `/find_job` hires another agent before it writes its report. Job Finder buys CV Reviewer's instant `/quick_review` with the CV text, using [`@payvoke/x402-client`](../../packages/x402-client). It is off by default.

- Job Finder's wallet is an ordinary **buyer** account. The SDK signs in with Sign-In with Ethereum using `JOB_FINDER_BUYER_KEY`, gets the `402`, checks the quote (agent, command, at most `CV_REVIEWER_MAX_AMOUNT`, 0.50 USDC by default) and signs one USDC authorization. The wallet needs Fuji test USDC (<https://faucet.circle.com>) and no AVAX, because the relayer pays the gas.
- The two jobs have **two separate escrows**. The buyer's hold pays Job Finder, and Job Finder's hold pays CV Reviewer.
- While the review runs, the job's thread shows a short note: "Đang thuê CV Reviewer qua x402…", the quote, the funding transaction with a Snowtrace link, then the outcome. The review goes into the model's context and into the delivered report, in a section titled "Nhận xét CV từ CV Reviewer".
- If the review fails, can't be paid or takes longer than `CV_REVIEWER_TIMEOUT_MS` (120 s by default), Job Finder continues without it. The vault refunds the review's hold to Job Finder's wallet. `/find_job` delivers within 300 s, so keep the timeout well under that.

| Variable                 | Meaning                                                            |
| ------------------------ | ------------------------------------------------------------------ |
| `CV_REVIEWER_APP_ID`     | App id of the CV Reviewer agent (from `GET /v1/x402/catalog`)      |
| `JOB_FINDER_BUYER_KEY`   | Private key (0x…) of Job Finder's own buyer wallet                 |
| `CV_REVIEWER_MAX_AMOUNT` | Spend cap per review in atomic USDC. Default `500000`              |
| `CV_REVIEWER_TIMEOUT_MS` | Give up on the review after this long. Default `120000`            |
| `PAYVOKE_WEB_ORIGIN`     | Only if the API's SIWE web origin is not `PAYVOKE_API_URL`'s       |

Code: `src/subhire.ts`.

## Run it

1. In Studio, create an agent and generate its API key.
2. Get an OpenRouter key at <https://openrouter.ai/keys>.
3. Configure and start:

   ```sh
   cd examples/job-finder
   cp .env.example .env   # fill in PAYVOKE_APP_ID, PAYVOKE_KEY, OPENROUTER_API_KEY
   bun install            # from the repo root also works
   bun start
   ```

The agent shows as available in the store while it runs. Prices are in atomic USDC (`150000` = 0.15 USDC for `/find_job`). They must be at least the deployment's price floor; if an offer is refused, the agent tells the buyer and logs the error code.

Or run it in Docker, built from the repository root. Job state goes to the `/app/.data` volume:

```sh
docker build -f examples/job-finder/Dockerfile -t job-finder .
docker run -d --restart unless-stopped --env-file examples/job-finder/.env \
  -v job-finder-data:/app/.data job-finder
```

Tests (offline, the model and the Payvoke API are mocked) and type checking:

```sh
bun test
bun run typecheck
```

## Files

| File | Role |
| ---- | ---- |
| `src/index.ts` | Syncs commands, reads the feed, runs events one at a time per thread or invocation |
| `src/payvoke.ts` | Provider API client: calls with retries, SSE feed, downloads, `Reply` for streamed chat, and `Run` for sequenced reports and deltas |
| `src/commands.ts` | Command definition (`/find_job`), arguments, and SLA terms |
| `src/chat.ts` | Pre-sale chat: intake form and offer |
| `src/run.ts` | Paid runs: downloads CV, parses PDF/text, streams AI report, appends job links, and handles revisions |
| `src/match.ts` | The instant `/match` run: skills text in, top 5 roles with links out |
| `src/subhire.ts` | Optional agent-hires-agent step: buys a CV Reviewer `/quick_review` over x402 with the SDK |
| `src/links.ts` | Verified application & search links builder (TopCV, ITviec, VietnamWorks, LinkedIn, Google Jobs, corporate portals) with Vietnamese slugification and city normalization |
| `src/agents.ts` | Two Mastra agents: Concierge (pre-sale chat) and Career Matcher (`find_job`) |
| `src/config.ts` | Environment configuration validation with Zod |
| `src/state.ts` | JSON files in `STATE_DIR` that link tool calls and invocations back to their job |

## Limits

- Files up to 5 MB (PDF, DOCX, TXT). Text extraction truncates at 15,000 characters to stay within model context limits.
- State is kept in local JSON files, so run one instance. Feed events are acknowledged before the work starts. If the process dies mid-run, that run is not retried and the delivery deadline refunds the buyer.
- Free OpenRouter models share a rate-limited pool and often answer `429`. Each model is retried `MODEL_RETRIES` times with backoff, then the agent moves through `FALLBACK_MODELS`. If every model fails, chat sends a fixed reply and paid runs deliver safe fallback responses. To lift the shared limit, add your own Google AI Studio key in OpenRouter's integration settings, or set `MODEL` to a paid model for a public agent.
