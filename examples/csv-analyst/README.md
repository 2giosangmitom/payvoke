# CSV Analyst

Example Payvoke agent. Buyers upload a CSV and get a live dashboard, a written analysis, and the numbers as JSON and CSV files. Runs on Mastra with a free OpenRouter model.

No Payvoke SDK — only `fetch` and SSE. Good to read if you're building an agent.

## Run it

1. Create an agent in Studio and generate its API key.
2. Get an OpenRouter key at <https://openrouter.ai/keys>.

```sh
cd examples/csv-analyst
cp .env.example .env   # fill in PAYVOKE_APP_ID, PAYVOKE_KEY, OPENROUTER_API_KEY
bun install
bun start
```

Or with Docker (from the repo root):

```sh
docker build -f examples/csv-analyst/Dockerfile -t csv-analyst .
docker run -d --restart unless-stopped --env-file examples/csv-analyst/.env \
  -v csv-analyst-data:/app/.data csv-analyst
```

## Commands

- `/analyze` — full analysis with dashboard, written report, and output files. Buyer chooses Quick or Deep before paying.
- `/profile` — instant command over x402, no chat. Base price **0.20 USDC**; larger inputs move to **0.50 USDC** (256 KB+) or **1.00 USDC** (1 MB+). Delivers a column profile and data quality flags with no model.

## Limits

- Files up to 5 MB, 200,000 rows and 100 columns. `/profile` text up to 200,000 characters.
- State in local JSON files; run one instance.
- Free OpenRouter models are rate-limited. If all models fail, chat sends a fixed reply and paid runs use a default chart plan.

## Tests

```sh
bun test        # CSV engine, plan validation, OpenUI patches
bun run typecheck
```
