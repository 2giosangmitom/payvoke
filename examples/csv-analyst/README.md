# CSV Analyst

An example Payvoke agent. Buyers upload a CSV and get a live dashboard (metrics, column profile, charts, outliers), a written analysis, and the numbers as JSON and CSV files. It runs on [Mastra](https://mastra.ai) with a small free model from OpenRouter (`nvidia/nemotron-3.5-lightning:free` by default).

It is meant to be read: it uses almost every part of the builder API in about 1,600 lines with no Payvoke SDK, only `fetch` and SSE.

## Design: code does the math, the model plans and writes

Small models get arithmetic and syntax wrong, so the model never sees raw rows, never computes a number and never writes UI.

| Step                                                                                  | Done by                                                                                                       |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Parse the CSV, detect column types, compute stats, group and aggregate, find outliers | Code (`src/csv.ts`)                                                                                           |
| Choose which charts answer the buyer's goal                                           | Model, as JSON. The output is checked against the real columns, retried once, then replaced by a default plan |
| Build the OpenUI dashboard                                                            | Code (`src/ui.ts`), checked in tests against Payvoke's own validator                                          |
| Write the analysis                                                                    | Model, from the computed numbers only, streamed into the thread                                               |
| Answer free pre-sale chat                                                             | Model, with a fixed fallback reply                                                                            |

If OpenRouter is down or rate limited, the job still delivers: the plan falls back to defaults and the report says the written analysis is missing.

## What it shows

| Payvoke feature                                                                                      | Where                                                       |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Commands with FILE, STRING and `choices` options, a positional parameter, `maxAmount` and full terms | `src/commands.ts`, synced with `overwriteCommands` on start |
| Two evidence levels: `/analyze` uses `REC`, `/profile` uses `SIGN`                                   | `src/commands.ts`                                           |
| SSE event feed as the heartbeat, with dedupe and reconnect                                           | `src/payvoke.ts`, `src/index.ts`                            |
| Free chat replies in markdown, streamed token by token with message deltas                           | `src/chat.ts`, `Reply` in `src/payvoke.ts`                  |
| `ask_form` with a file field, before payment                                                         | `src/chat.ts` (shown when the buyer talks about data)       |
| `ask_choice` before payment to pick the depth                                                        | `src/chat.ts`                                               |
| Offers priced by the chosen depth, with a shorter `deliverySeconds` for Quick                        | `src/chat.ts`                                               |
| `invocation.ready`: ACK, `started`, download of the buyer's file                                     | `src/run.ts`                                                |
| Progress steps that update in place (same `stepId`)                                                  | `src/run.ts`                                                |
| Mid-run `tool_call` (pick the key metric from the real columns), resumed by `invocation.tool_result` | `src/run.ts`                                                |
| AG-UI stream: an OpenUI surface that grows section by section, plus streamed text                    | `src/run.ts`, `src/ui.ts`                                   |
| All six OpenUI components: Stack, Text, Card, Metric, Table, Chart                                   | `src/ui.ts`                                                 |
| Result with markdown output and files (presigned upload, SHA-256, completion)                        | `src/run.ts`, `src/payvoke.ts`                              |
| Revisions through `invocation.revision_requested`, with a growing `artifactVersion`                  | `src/run.ts`                                                |
| `failed` report on a bad file, which refunds the buyer automatically                                 | `src/run.ts`                                                |

## Flow

1. The buyer runs `/analyze sales.csv why did Q3 drop?`, attaches a CSV to a message, or chats and fills in the upload form.
2. The agent asks Quick or Deep, then makes an offer at that price.
3. The buyer accepts and pays. The USDC is held in PayvokeVault.
4. On `invocation.ready`, the agent downloads and profiles the file. If it has two or more numeric columns, the agent asks which one matters most and the run pauses.
5. On the answer, a new run plans the charts, streams the dashboard and the analysis, uploads `analysis.json` and `summary.csv`, and sends the result.
6. The buyer can ask for one revision ("group by product instead"). After the review window the vault pays the builder.

`/profile` skips the questions: one fixed-price offer, then a profile and `profile.json`.

## Run it

1. In Studio, create an agent and generate its API key.
2. Get an OpenRouter key at <https://openrouter.ai/keys>.
3. Configure and start:

   ```sh
   cd examples/csv-analyst
   cp .env.example .env   # fill in PAYVOKE_APP_ID, PAYVOKE_KEY, OPENROUTER_API_KEY
   bun install            # from the repo root also works
   bun start
   ```

The agent shows as available in the store while it runs. Prices are in atomic USDC (`500000` = 0.50 USDC). They must be at least the deployment's price floor; if an offer is refused, the agent tells the buyer and logs the error code.

Tests run offline:

```sh
bun test        # CSV engine, plan validation, and OpenUI patches against Payvoke's validator
bun run typecheck
```

## Files

| File              | Role                                                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/index.ts`    | Syncs commands, reads the feed, runs events one at a time per thread or invocation                                                                  |
| `src/payvoke.ts`  | Provider API client: calls with retries, SSE feed, uploads, and `Reply` for streamed chat replies, and `Run` for sequenced reports and stream lines |
| `src/commands.ts` | Command definitions and terms                                                                                                                       |
| `src/chat.ts`     | Pre-sale chat: forms, choices and offers                                                                                                            |
| `src/run.ts`      | Paid runs: profile, tool call, dashboard, analysis, files, result                                                                                   |
| `src/csv.ts`      | Parsing, profiling, aggregation and outliers. No model                                                                                              |
| `src/plan.ts`     | Chart plan schema, validation and the default plan                                                                                                  |
| `src/ui.ts`       | OpenUI Lang builders and string sanitising                                                                                                          |
| `src/agents.ts`   | The three Mastra agents                                                                                                                             |
| `src/state.ts`    | JSON files in `STATE_DIR` that link tool calls and runs back to their job                                                                           |

## Limits

- Files up to 5 MB, 200,000 rows and 100 columns.
- State is kept in local JSON files, so run one instance. Feed events are acknowledged before the work starts. If the process dies mid-run, that run is not retried and the delivery deadline refunds the buyer.
- Free OpenRouter models share a rate-limited pool and often answer `429`. Each model is retried `MODEL_RETRIES` times with backoff, then the agent moves through `FALLBACK_MODELS`. If every model fails, chat sends a fixed reply and paid runs use the default chart plan. To lift the shared limit, add your own Google AI Studio key in OpenRouter's integration settings, or set `MODEL` to a paid model for a public agent.
