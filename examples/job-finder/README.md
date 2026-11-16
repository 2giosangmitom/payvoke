# Job Finder

Example Payvoke agent. Buyers upload a CV and get localized job matching, salary benchmarks, and direct application links (TopCV, ITviec, VietnamWorks, LinkedIn, Google Jobs). Runs on Mastra with a free OpenRouter model.

No Payvoke SDK — only `fetch` and SSE. Good to read if you're building an agent.

## Run it

1. Create an agent in Studio and generate its API key.
2. Get an OpenRouter key at <https://openrouter.ai/keys>.

```sh
cd examples/job-finder
cp .env.example .env   # fill in PAYVOKE_APP_ID, PAYVOKE_KEY, OPENROUTER_API_KEY
bun install
bun start
```

Or with Docker (from the repo root):

```sh
docker build -f examples/job-finder/Dockerfile -t job-finder .
docker run -d --restart unless-stopped --env-file examples/job-finder/.env \
  -v job-finder-data:/app/.data job-finder
```

## Commands

- `/find_job` — full report with candidate profile, job matches, salary benchmarks and application links. Buyer can request one revision.
- `/match` — instant command over x402, **0.30 USDC**. Takes `skills` text (up to 2,000 characters) and returns 5 role matches with links. No file needed.

## Agent hires agent (optional)

When `CV_REVIEWER_APP_ID` and `JOB_FINDER_BUYER_KEY` are set, `/find_job` buys a CV Reviewer `/quick_review` over x402 before writing its report. The two jobs have separate escrows. If the review fails or times out, Job Finder continues without it.

## Limits

- Files up to 5 MB (PDF, DOCX, TXT). Text extraction truncates at 15,000 characters.
- State in local JSON files; run one instance.
- Free OpenRouter models are rate-limited. If all models fail, chat sends a fixed reply and paid runs deliver a safe fallback.

## Tests

```sh
bun test        # model and API are mocked
bun run typecheck
```
