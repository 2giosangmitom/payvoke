# AgentNe Provider SDK

Node 24, TypeScript and an outbound WebSocket connection. No public provider endpoint or tunnel is required. The current contract is **owner-only development execution**, not marketplace admission, purchases or settlement.

## Setup

From the repository root:

```sh
pnpm install
pnpm --filter @agentne/provider-sdk build
```

Create a provider profile, application and scoped key in **Provider console → Applications**, or use the [Gateway API workflow](../../docs/modules/04-jobs-and-provider-execution.md#implemented-development-gateway). Application/key management requires the owner's Supabase session; registering commands and connecting require the application API key. Keep keys server-side. Secret values are shown once, expire after 90 days and can be revoked; create a replacement before revoking an old key. Inspect registered commands and run a schema-generated test in the owner's Playground.

```ts
import { ProviderClient } from "@agentne/provider-sdk";

const provider = new ProviderClient({
  apiKey: process.env.AGENTNE_API_KEY!,
  applicationId: process.env.AGENTNE_APPLICATION_ID!,
  baseUrl: "http://localhost:8000", // HTTPS required outside localhost
  journalPath: "data/provider.sqlite", // create a private directory first
  onError: (error) => console.error(error.message),
});

// Explicit deployment step. Do not register on every reconnect.
const revision = await provider.registerCommands([
  {
    name: "logo",
    description: "Design one logo symbol",
    inputSchema: {
      type: "object",
      properties: { brief: { type: "string", maxLength: 8000 } },
      required: ["brief"],
      additionalProperties: false,
    },
  },
]);

provider.onCommand("logo", revision.id, async ({ input, progress, signal }) => {
  await progress("Preparing the design…");
  // Call your own runtime here; respect signal and supply provider-owned credentials.
  // This example is synthetic and makes no model calls.
  signal.throwIfAborted();
  return `Synthetic result for: ${input.brief}`;
});

await provider.connect();
process.once("SIGTERM", () => {
  void provider.close();
});
```

In a normal deployment, register commands separately, save the returned revision ID, then bind handlers to that revision without registering again. Multiple revisions may have handlers installed explicitly. The SDK refuses to run an invocation against an uninstalled revision.

## Recovery contract

- Keep the same SQLite journal on restart. Its persistent executor UUID owns previously delivered work. Never copy a live journal to a second process; an exclusive SQLite lock enforces one process per journal. Keep its directory private: terminal text can contain sensitive provider output.
- Before calling a handler, the SDK persists a started record, then waits for the platform's acceptance acknowledgement. Cached terminal results are persisted before sending and replayed after a lost acknowledgement.
- Interrupted started records become `uncertain` on restart, **never automatic re-execution**. Handler exceptions and deadlines are conservative uncertain outcomes; cancellation of external work is cooperative, not proof it stopped.
- The platform replays the same invocation ID only to its assigned executor. A new empty journal cannot take over delivered work. Do not delete the journal as a retry mechanism.
- Socket reconnect uses bounded exponential backoff with jitter. A surviving backend session lease causes a retry, not loss of invocation identity. Authentication/protocol errors require operator intervention; they do not retry indefinitely.
- Progress is a replaceable text snapshot, not token streaming or an event log. Output is inert text, at most 16,000 characters. No file delivery, arbitrary widgets, tools, cancellation commands or financial authority.
- One Gateway connection and one outstanding dispatch per application in this slice. Gateway v2 listings can pin a command revision and pass operator catalog review; the owner can then use slash autocomplete/confirmation in their private workspace. This does not grant buyer execution. Horizontal provider workers, general event cursors, commercial admission and production proxy/load validation remain deferred.

## Checks

```sh
pnpm --filter @agentne/provider-sdk typecheck
pnpm --filter @agentne/provider-sdk test
```

Tests use a local synthetic WebSocket server and exercise registration, lost completion acknowledgements, reconnect, process recovery, revision fencing and journal locking. Backend database tests also run this SDK against the real Fastify Gateway and PostgreSQL with a synthetic handler. Neither test suite calls a model.
