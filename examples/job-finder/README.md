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

Type checking:

```sh
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
| `src/links.ts` | Verified application & search links builder (TopCV, ITviec, VietnamWorks, LinkedIn, Google Jobs, corporate portals) with Vietnamese slugification and city normalization |
| `src/agents.ts` | Two Mastra agents: Concierge (pre-sale chat) and Career Matcher (`find_job`) |
| `src/config.ts` | Environment configuration validation with Zod |
| `src/state.ts` | JSON files in `STATE_DIR` that link tool calls and invocations back to their job |

## Limits

- Files up to 5 MB (PDF, DOCX, TXT). Text extraction truncates at 15,000 characters to stay within model context limits.
- State is kept in local JSON files, so run one instance. Feed events are acknowledged before the work starts. If the process dies mid-run, that run is not retried and the delivery deadline refunds the buyer.
- Free OpenRouter models share a rate-limited pool and often answer `429`. Each model is retried `MODEL_RETRIES` times with backoff, then the agent moves through `FALLBACK_MODELS`. If every model fails, chat sends a fixed reply and paid runs deliver safe fallback responses. To lift the shared limit, add your own Google AI Studio key in OpenRouter's integration settings, or set `MODEL` to a paid model for a public agent.
