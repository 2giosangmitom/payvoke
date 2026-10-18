# M04 — Jobs and Provider Execution

**Status: planned specification.** Owns integration credentials, Gateway delivery, runtime capacity, admitted runs, execution attempts and recovery. See the normative [capability](../protocols/agent-capabilities.md) and [event](../protocols/agent-events.md) contracts.

## Features

| Feature                       | Behavior                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Applications and keys         | Provider-owned applications; one-time secrets, hashed storage, explicit scopes, rotation and revocation       |
| Capability registration       | Register immutable handler/schema revisions; M07 binds reviewed versions                                      |
| Outbound Gateway              | Provider connects to the platform; no arbitrary provider URL fetch is required for dispatch                   |
| Admission and capacity        | Enforce application/capability concurrency, queue limits, availability and deadlines                          |
| Durable dispatch              | Persist run/attempt and outbox before notifying the assigned application                                      |
| Session interaction           | Route scoped buyer follow-up/input responses into an active bounded run                                       |
| Progress and terminal reports | Validate event sequence, lease, message IDs and result references                                             |
| Recovery and cancellation     | Reconnect, status reconciliation, cooperative cancellation and stale-attempt fencing                          |
| Development mode              | Owner-only tests with explicit provider model-cost warning; no buyer payment or commercial verification badge |

## Records and lifecycle

Owns `ProviderApplication`, `ApplicationKey`, `CapabilityRevision`, `GatewaySession`, `CapacityReservation`, `Run`, `Attempt`, `DispatchOutbox`, `ProviderInbox` and event checkpoints.

Run states: `queued → dispatching → running ↔ waiting_input → verifying → succeeded`; alternative states `cancel_requested`, `canceled`, `failed`, `expired`, `uncertain`. `succeeded` is technical work completion after M05 checks, not buyer acceptance or refund/payout finality.

Attempt states: `assigned → accepted → running → reported_complete | failed | canceled | uncertain`. A completed provider report enters verification. Final output is accepted only from the active fenced attempt. Keep late reports for audit without publishing them.

Initial purchase creates one run. Repairs create subsequent runs within the same order's allowance. An attempt retry is allowed only when the prior attempt is proven not to have executed, is cooperatively stopped with reliable evidence, or the capability explicitly supports safe idempotent resumption. A lease timeout alone does not prove external work stopped.

## Admission algorithm

1. Verify buyer ownership, immutable order terms, paid access (or owner-only development mode), capability admission and file scan status.
2. Lock capacity counters/reservation and check per-application and per-capability limits atomically; queue when permitted.
3. Persist a stable attempt ID, increasing fencing token, deadline and minimal context snapshot.
4. Commit outbox, then dispatch `run.requested`. The SDK must durably record the assignment before invoking a handler.
5. Mark acceptance only on persisted acknowledgment. A lost acknowledgment resends the same assignment, not a new attempt.
6. On ambiguous disconnect, retain the occupied/uncertain capacity until reconciliation or a bounded operator decision; do not immediately reuse it while an external operation may still be running.

Platform limits cap provider-advertised capacity. Stale heartbeat disables new dispatch. Provider busy responses requeue only work known not to have started. Queue time counts toward the commercial deadline.

## Proposed provider surface

`POST /v1/provider/applications`, `/keys`; `PUT /v1/provider/applications/:id/capabilities`; `GET /v1/provider/gateway` WebSocket; `POST /v1/provider/runs/:runId/attempts/:attemptId/events`; `GET .../stream-state`; `POST .../attachments/:attachmentId/url`; `POST .../artifact-uploads`.

Keys have separate `capabilities:write`, `gateway:connect`, `runs:read`, `runs:events`, `artifacts:write` scopes. Scope alone is insufficient: every request checks assigned application, attempt, lease and allowed action. No application key edits financial terms or issues refunds.

## Failure and isolation rules

Cancellation is a request, not proof of stopped compute or a refund. Deadline closes new output admission; an old process cannot publish after fencing. If work may have affected external systems, preserve `uncertain` and require evidence before any retry. Release one admits no irreversible external-write capability.

Limit per-event bytes, total output, duration and concurrent streams. Apply backpressure, heartbeat liveness and circuit breakers. Do not send arbitrary provider output directly to the browser. Execute file processing outside API/signing workers.

## Acceptance conditions

A duplicate Gateway delivery does not re-enter a durable handler; a provider violating the contract is detected and quarantined. Restart/lost acknowledgment preserves run identity. Old attempts cannot finalize. Last-slot races cannot over-admit. Uncertainty never silently starts another external action. Paid provider downtime reaches the quoted resolution path.
