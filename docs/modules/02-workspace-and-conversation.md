# M02 — Workspace and Conversation

**Status: planned specification.** Owns private task context, messages, input attachments and buyer interaction. M03 owns purchases; M04 owns execution.

## Features

| Feature             | Intended behavior                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| Workspace and brief | Create/archive private workspaces; edit a versioned brief with stale-write detection             |
| Agent selection     | Bind a conversation to a selected listing; show capability/variant and active order              |
| Normal messages     | Address the selected agent; clarify inputs before quote or continue a purchased bounded session  |
| Slash commands      | Discover only declared commands; open a schema-derived form with explicit file/context selection |
| Attachments         | Upload private inputs, preview safe formats, choose which files to share                         |
| Purchase cards      | Render canonical quote/order actions; provider text cannot fabricate an actionable checkout      |
| Run timeline        | Show queued, running, waiting for input, verifying, delivered and failed states                  |
| Recovery            | Read canonical snapshot and resume an ordered stream without resubmitting the initiating command |

## Message routing and billing

Unassigned workspace messages update task context or invoke a clearly labelled platform clarification assistant under a disclosed free quota. They never broadcast to providers.

Before purchase, addressed input prepares a quote using declared schemas. Do not send it to paid provider compute just to show a price. An optional provider-funded preview must declare its own quota and non-commercial status.

After purchase, a bounded session can route additional turns to the same run while within its quoted turn/time scope. Each message has an idempotent operation key and consumes one turn atomically. A task capability does not become unlimited chat. Out-of-scope input produces a new quote; no automatic charge.

Changing agent creates a new conversation context. Sharing an earlier brief or files requires a visible selection; previous private history is not automatically copied to the new provider.

## Owned data and proposed interface

Owns `Workspace`, `BriefRevision`, `Conversation`, `Message`, `MessagePart`, `Attachment`, `ContextSelection` and stream projection checkpoints. References order/run IDs without owning their state.

Proposed routes: `/v1/workspaces`, `/v1/workspaces/:id/brief`, `/v1/conversations`, `/v1/conversations/:id/messages`, `/v1/conversations/:id/commands`, `/v1/conversations/:id/attachments`, `/v1/conversations/:id/events?after=cursor`.

Message input includes client operation ID, expected conversation revision, selected capability, optional active order/run, text/structured inputs and selected attachment IDs. The server rebuilds history from stored messages; browser-supplied assistant history is not authoritative.

## Files, context and interactions

Proposed input limits: 25 MiB/file, five selected files/message and 50 stored files/conversation. Capability limits may be stricter. Store bytes privately, record sanitized filename and detected media type, scan before provider access, and never render SVG/HTML as trusted inline content. Unsupported or unscannable files are rejected from dispatch until a supported profile exists.

Upload alone does not share data. Input IDs and context revision bind immutably to the order/run snapshot. A 120-second signed download link is issued only after M04 checks application/attempt ownership; renewed links retain the same scope. Public profile media uses a separate storage boundary.

Only platform-registered interaction schemas render controls. `request_input` may ask for an allowed field or choice; it cannot request wallet keys or trigger arbitrary browser tools. Financial buttons are generated from authoritative order records. Ignore or reject private reasoning and unsupported widgets.

## Streaming and failures

M02 projects validated M04 events into canonical messages and AG-UI-compatible browser events. SSE IDs refer to persisted platform cursors, not provider sequence numbers. Snapshot and tail must have a consistent high-water mark to avoid gaps; an expired cursor returns an explicit reset.

Read-only reconnect never creates another run. Duplicate content is deduplicated by identity, not by text similarity. On network loss show “Reconnecting”; on provider uncertainty show “Execution status unknown” without a fresh “Run again” action that could duplicate effects.

## Acceptance conditions

- A selected-agent message reaches exactly its assigned scope; unassigned messages cause no provider dispatch.
- Concurrent last-turn submissions cannot exceed the session limit.
- Refresh/reconnect preserves messages, files, order and run identity with no extra payment.
- Malicious text cannot create functional payment buttons, reveal another conversation or broaden file access.
- File scanning, quota errors, accessibility and stream resets have usable UI states.
