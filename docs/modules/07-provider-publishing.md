# M07 Provider Publishing

Owns provider identities/listings, versioned manifests, endpoint configuration, admission evidence and publication state. Providers deploy their own runtime; the marketplace admits an integration, not their private source.

## Implemented core

The backend implements provider profiles (one per Supabase account), owner-only listings, immutable manifest candidates, submitted/approved/rejected review states, publication pointers, pause and rollback to a previously approved version. Public discovery is wallet-free. The manifest subset is deliberately narrow: `provider-text-v1`, final-only text actions, declared model variants, fixed test-credit prices and bounded input/output/deadlines. It does not support paid execution, arbitrary JSON schemas, widgets, files, streaming or cancellation claims yet.

**Catalog publication is not endpoint admission.** Every discovered listing says `verification: catalog-review-only` and `executionEnabled: false`. No publishing command makes network requests to provider endpoints. HTTPS declaration validation rejects local/IP hosts and credential/query-bearing URLs but does not prove DNS, TLS, endpoint control, data policy or runtime behavior. Platform probes, encrypted credential configuration, fixtures/admission evidence, execution integration, operator UI and playground remain deferred. Never put secrets in a manifest, including free-text fields; rejected credential fields are not a secret scanner.

### Publishing workflow

Authenticated commands use the same Supabase bearer/session and suspension checks as M01. Owners cannot supply another provider ID or approve their own candidates. Profile names are immutable in this first slice; exact creation retries recover the profile. Lists are paged at 50 with `offset` (maximum 10,000).

| API                                                          | Purpose                                                           |
| ------------------------------------------------------------ | ----------------------------------------------------------------- |
| `GET /v1/provider-manifest-schema`                           | Public version-1 schema for local tooling                         |
| `GET/POST /v1/provider/profile`                              | Read/create the current provider; body `{ displayName }`          |
| `GET/POST /v1/provider/listings`                             | Read/create owned listings; create body `{ id }` (client UUID)    |
| `GET/POST /v1/provider/listings/:id/versions`                | Read/create immutable candidates; create body `{ id, manifest }`  |
| `POST /v1/provider/listings/:id/versions/:versionId/submit`  | Submit a draft for catalog review                                 |
| `POST /v1/provider/listings/:id/versions/:versionId/publish` | Point discovery at an approved version (also resumes/rolls back)  |
| `POST /v1/provider/listings/:id/pause`                       | Hide a listing from new discovery                                 |
| `GET /v1/agents`                                             | Discover published, unpaused listings from active providers       |
| `GET /v1/agents/:id`                                         | Direct public detail with the same visibility and redaction rules |
| `GET /v1/provider/listings/:id`                              | Owner-only listing summary, independent of pagination             |

Creation IDs bind immutable content. Changed content under an existing version UUID conflicts; a new endpoint, model, price, destination or terms requires a new version UUID. Versions have a deterministic SHA-256 digest over recursively key-sorted JSON (array order is preserved), binding operator review to the exact manifest. Publication changes a listing pointer; it never mutates a prior version or any future order's pinned configuration. Draft candidates remain private while the previous published version stays visible. Catalog reads use a repeatable-read database snapshot. Public projections omit integration endpoints, account IDs and internal review notes. Digests are integrity identifiers, not confidential commitments.

Review is a trusted, database-privileged operator command—not an HTTP role exposed to provider tokens:

```sh
pnpm --filter backend publishing:review <listing-uuid> <version-uuid> <digest> approved <operator-name> "Catalog content and disclosures reviewed; endpoint not admitted"
```

Use `rejected` instead of `approved` to reject a candidate. The command records operator, note and timestamp and checks the expected digest. An exact review retry is harmless; a terminal decision cannot be overwritten. Rejection requires a new candidate. It does not pretend that a manually reviewed declaration has passed runtime tests. There is no dedicated cryptographic attestation or tamper-proof audit store in this slice.

Apply registered migrations with `pnpm --filter backend db:migration:up`. Integration tests use only the disposable `TEST_DATABASE_URL`; they cover ownership, admission gates, immutability/retries, digest-bound reviews, rollout/rollback, suspension, schema parity and migration rollback/reapply. Provider tables enable RLS and revoke browser/public table grants, like the existing modules. Regenerate API types with `pnpm --filter backend sdk`.

### Logo Designer example

[`packages/logo-designer`](../../packages/logo-designer/README.md) is a single-purpose provider: one Mastra `Agent`, one `design-logo` action, and one SVG logo symbol per brand brief. It returns restricted SVG source as inert fenced text, not a rendered or verified artifact. It retains the final-only HTTP contract and SQLite operation recovery. The backend manifest tests validate its shipped manifest. It has a separate integration token and provider-owned OpenAI key; local/CI contract tests require explicit opt-in to real model expense. Its automatic tests use synthetic responses, not live models. No backend execution adapter calls it yet. Providers are named for their work, not their implementation framework.

### Web interface

The frontend exposes a wallet-free Store at `/`, public details at `/agents/:id`, and the authenticated publishing console at `/provider`. Owner listing summaries include the latest candidate name/ID/state without disclosing other owners' records. The console supports profile creation, complete manifest JSON drafts, submission, and approved-version publication/pause/rollback. Review authority remains operator-only through the CLI. Catalog filters currently apply to the displayed 50-item page, not a global search index. No sample listings or metrics are seeded into production data.

The rest of this document describes the target design, not completed admission/execution capabilities.

## Manifest and customization

| Declaration              | Purpose                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| Identity and endpoint    | Provider, payout identity, endpoint ownership, authentication and data destinations        |
| Actions and inputs       | Named actions, schema versions, files, forms and parameter limits                          |
| Model variants           | Declared model/configuration, capability differences and allowed fallback                  |
| Outputs and interactions | Profiles, registered widgets, buttons/selects/forms and scoped action references           |
| Pricing and terms        | Fixed/metered/hybrid profile, rates, ceiling rules, deadlines, repairs, rights and refunds |
| Runtime capabilities     | Streaming, start deduplication, status recovery, cancellation and optional input/resume    |

Variants may have different prices. [M03](03-commerce-and-pricing.md) pins the chosen configuration and terms into each quote. Updating a listing never retargets an existing order. Higher cost, broader permissions or new data destinations require a new reviewed version and appropriate user authority.

Public discovery works without a wallet. Listings show version, limitations, price rules, verification scope, hosting/data policy and labelled samples. External code/model identity and actual usage remain provider assertions unless separately verified.

## Developer workflow

```mermaid
flowchart LR
  Draft[Draft manifest and endpoint] --> Local[Local contract tests]
  Local --> Admission[Platform endpoint and recovery tests]
  Admission --> Playground[Inspect stream, output and rated usage]
  Playground --> Review[Curated review]
  Review --> Publish[Publish version]
  Publish --> Monitor[Monitor runtime outcomes]
  Monitor -->|Repeated or unsafe failures| Pause[Pause new admission]
  Pause --> Retest[Fix and revalidate]
  Retest --> Admission
```

Provide schema files, framework-neutral examples, optional wrappers and a contract tester usable locally or in CI. Developers may use LangChain or any other runtime. No SDK installation, private prompt/model-key submission or source upload is required.

The tester exercises start/status/result/stream, duplicate operations, conflicting input, lost responses, stale attempts, cancellation claims, artifact upload and usage accounting. A local tester may call localhost; platform admission must not access arbitrary private networks. Test fixtures are synthetic with no customer funds; disclose and bound any real model expense.

The playground shows request/event timelines, rendered parts, file checks, usage estimates versus rated totals and sanitized errors. Errors identify code, field/event, expected/actual behavior, correlation ID and retryability. Never expose secrets or unrelated buyer context.

## Admission and rollout

Check endpoint control, HTTPS/TLS, credentials, DNS/IP/redirect safety, schemas and every advertised capability. A health check alone is insufficient. Record fixture version, date, candidate version, sample size and coverage. Passing tests does not guarantee remote internals remain unchanged or future uptime.

Changes create candidates that must pass again. Pause/deprecate stops new work; running jobs drain under their pinned rules or enter an explicit safety/compensation path. Rollback redirects new orders to a valid older version, not in-flight work. Endpoint/credential changes require targeted revalidation; old payment/artifact history remains intact.

At runtime use bounded concurrency, timeouts and a circuit breaker. Separate authentication, contract, quota and transient failures. Preserve uncertain operations for recovery rather than retrying starts blindly. [M09](09-reputation-and-operations.md) manages incidents; no automatic expensive variant fallback.

Optional platform-hosted workflows need their own admission: bounded graphs, approved tools/dependencies, scoped secrets and no financial authority. Unrestricted uploaded code is out of scope.

## Paper used

[τ-bench, v1](https://arxiv.org/abs/2406.12045v1) informs final-state checks and repeated-trial evaluation. Metric explanation and §§4, 6 were inspected. Record consistent success separately from best-of-many attempts; simulated benchmarks do not replace real provider/buyer usability tests.
