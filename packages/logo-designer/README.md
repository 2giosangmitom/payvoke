# Logo Designer

A single-purpose provider built with one Mastra `Agent`: **a logo brief in, one SVG logo symbol out**. Its only action is `design-logo`. It does not summarize documents, build brand kits, generate mockups, or route between unrelated tasks. Mastra is an implementation detail, not the marketplace product name.

Its inbound HTTP mode runs without the marketplace backend, Supabase, wallets or financial credentials. The optional outbound Gateway mode below uses an application API key for owner-only development execution. The marketplace publishing API accepts its HTTP manifest; public catalog execution remains **disabled**.

## Run

Use Node 24 and root-pinned pnpm. From the repository root:

```sh
pnpm install
cp packages/logo-designer/.env.example packages/logo-designer/.env
# Edit .env: set a random integration token (32+ characters) and OPENAI_API_KEY.
pnpm --filter logo-designer dev
```

The server binds `127.0.0.1:8200` by default. Production requires an HTTPS reverse proxy, a private persistent disk, and an integration token separate from all buyer/platform credentials. Do not publish your `.env`, SQLite database, prompts or model key. Logs are disabled on the HTTP server; do not enable raw request/model tracing in a deployed integration.

`build`, `start`, `typecheck` and `test` are available through `pnpm --filter logo-designer …`. Tests use synthetic responses or stub the Mastra generation method; **they do not incur model expense**.

The fixed model is `openai/gpt-4.1-mini`: one step, no tools or fallback, no model retries, at most 2,048 output tokens, 8,000 input characters and a 30-second deadline. Actual OpenAI charges are the provider's responsibility, even though the demo manifest declares zero test-credit marketplace pricing. No token usage field is authoritative billing evidence.

## One job: design a logo symbol

The brief describes the brand name, audience, visual direction and preferred colors. The result's `text` contains exactly one fenced SVG code block: a 256×256 viewBox, basic vector geometry and at most three colors. No lettering or fonts are supported. A bounded XML parser rejects malformed/multiple SVGs, non-logo prose, scripts, external resources, embedded HTML, styles, entities and unsupported elements/attributes before success is reported. It does not evaluate artistic quality, originality or trademark clearance.

SVG is returned only as **inert text**, not rendered, uploaded, or treated as a verified image artifact. Do not inject it into HTML or bypass a future M05 artifact/preview pipeline. This replaces the previous generic provider example; use the new version UUID and default `data/logo-designs.sqlite` database, not an old summarizer deployment's identity/history.

## Protocol: `provider-text-v1`

All routes require `Authorization: Bearer $PROVIDER_TOKEN`. They never accept a Supabase session or payment authorization.

- `GET /v1/manifest`: version UUID and the manifest declaration.
- `POST /v1/operations`: persist an operation before calling Mastra; return `202` and a recovery handle (the operation UUID). An exact retry returns `200` without another call; changed input returns `409`.
- `GET /v1/operations/:operationId`: recover the same `running`, `succeeded`, `failed` or `uncertain` operation. A successful result contains text and provider-asserted input/output token counts, not raw framework events or reasoning.

Example start body:

```json
{
  "operationId": "00000000-0000-4000-8000-000000000001",
  "generation": 1,
  "versionId": "00000000-0000-4000-8000-000000000008",
  "action": "design-logo",
  "variant": "default",
  "input": {
    "text": "Design a minimal green leaf symbol for Sprout, a community garden. No lettering."
  }
}
```

Only the declared version, action, variant, and generation 1 are admitted. The complete input is bound to the operation ID. Status lookup is read-only. Unknown fields, extra tools, larger generations and variant substitutions are rejected. This protocol intentionally supports neither streaming, cancellation, files, nor input/resume. A future M04 adapter must validate these capabilities rather than treating this as a complete execution contract.

SQLite holds operation inputs and results across restarts. One process holds an exclusive database lock; a second process cannot claim the same database. Capacity is one model call at a time; a full provider rejects a new start with `429` before accepting it. Deadline/interrupted operations become **uncertain**, never automatically rerun. Capacity stays occupied while an underlying timed-out call is still settling. Reusing the ID recovers its uncertainty; a new ID may incur new expense and must not be used as an automatic retry. Graceful shutdown aborts active generation and waits for the model adapter to settle. After a crash, restart marks remaining running records uncertain before accepting traffic.

Keep the database for as long as operation recovery is promised. Deleting it destroys deduplication history; do not delete it and then replay old requests. This sample has no online retention/deletion workflow, distributed worker pool, usage collection, spending policy or production quota service.

## Local contract tester

Against your separately started provider:

```sh
ALLOW_MODEL_EXPENSE=1 pnpm --filter logo-designer contract:test
```

The tester reads `.env`, defaults to localhost, and can use `PROVIDER_URL` to target your deployment. It refuses redirects and requires explicit opt-in for **one bounded synthetic logo-design call**. It tests authentication, start, duplicate/conflict handling, status recovery and restricted SVG source. It is not platform endpoint admission, image verification, model identity verification or payment evidence. The package test suite also exercises the tester against a real HTTP listener with a synthetic generator at zero model cost.

## Register and publish

1. Replace `src/manifest.json`'s placeholder HTTPS endpoint and check its data-retention/terms disclosures against your deployment. Bind a unique version UUID in `src/server.ts` before registering it. A manifest/runtime change requires a new UUID and renewed review.
2. Create your provider profile and listing through the backend M07 API. Submit this manifest with its matching UUID; get its server-computed digest. See [the publishing workflow](../../docs/modules/07-provider-publishing.md#implemented-core).
3. Submit the candidate. An operator reviews the exact digest using the backend's trusted local review command. Providers cannot approve themselves through HTTP.
4. Publish the reviewed UUID. Discovery labels it `catalog-review-only` and `executionEnabled: false` until a future safe endpoint-admission implementation proves the runtime contract. No marketplace request calls this server yet.

Mastra API reference used: [Agent](https://mastra.ai/reference/agents/agent), [generate](https://mastra.ai/reference/agents/generate). Mastra is pinned to `1.78.0`; APIs are checked against its installed types.

## Outbound Gateway mode

The existing inbound HTTP prototype remains available. To use the new outbound integration, create an application and API key using the [Gateway workflow](../../docs/modules/04-jobs-and-provider-execution.md#implemented-development-gateway), then set `AGENTNE_APPLICATION_ID`, `AGENTNE_API_KEY`, `OPENAI_API_KEY`, and `ALLOW_MODEL_EXPENSE=true` in your private environment. The application key is **not** the legacy inbound `PROVIDER_TOKEN`.

```sh
# First deployment: register the /logo command explicitly and connect.
REGISTER_COMMANDS=true pnpm --filter logo-designer gateway

# Later starts: reuse the printed revision ID and the same persistent journal.
AGENTNE_COMMAND_REVISION=<revision-uuid> pnpm --filter logo-designer gateway
```

The command accepts `{ brief: string }`, calls the existing Mastra Logo Designer with a 30-second model deadline, and returns restricted inert SVG source. `AGENTNE_JOURNAL` defaults to `data/gateway.sqlite`; keep it on persistent private storage. Never delete it to retry uncertain work. Automatic reconnect does not register commands or call a model again. Interrupted work is uncertain, not automatically rerun. Starting this process does not by itself call a model; explicit owner development invocations do incur provider expense. No live model calls are part of automated tests.

Connecting this process does not publish the application, enable buyer/catalog execution or process payments. To test it, use the owner's Playground in Provider console. To use it through workspace slash commands, create a listing draft from this package's declaration, select the application and **Pin this command revision** to convert to Gateway manifest v2. Review the converted disclosures, save/submit the candidate, obtain operator approval and publish it. The owner can then select `/logo` in their private workspace and explicitly confirm a development invocation. See [`@agentne/provider-sdk`](../provider-sdk/README.md) for protocol and recovery limits.
