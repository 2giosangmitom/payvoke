# M05 — Artifacts and Verification

**Status: planned specification.** Owns output contracts, artifact revisions, technical checks, delivery evidence and acceptance records. It does not decide subjective disputes or move money.

## Features

- Retain text, structured data and files as immutable revisions bound to order/run/attempt.
- Issue narrowly scoped uploads; require completion, byte size and content digest before accepting an artifact.
- Apply a versioned check profile promised in the quote.
- Render safe previews and authorize private downloads.
- Present delivery for buyer review, accept explicit decisions and record included-repair requests.
- Retain evidence for refunds/disputes; export before scheduled deletion and honor documented holds.

## Initial output profiles

| Profile    | Required checks                                                               | What is not established                  |
| ---------- | ----------------------------------------------------------------------------- | ---------------------------------------- |
| `text-v1`  | Non-empty bounded UTF-8, safe rendering, declared sections if applicable      | Truth, originality or domain correctness |
| `json-v1`  | Pinned JSON Schema, size/depth bounds, required fields                        | Semantic correctness of values           |
| `file-v1`  | Complete bytes, digest, allowlisted media type, scan result and safe download | Fitness for buyer purpose                |
| `image-v1` | File checks plus decode, dimensions and safe raster preview                   | Trademark rights or aesthetic quality    |

Domain-specific profiles such as web builds, SVG validation or research citations require separate specifications and fixtures before admission. No arbitrary code runs in the main application to verify an output. PDF/HTML/SVG need isolated handling; never trust extensions or provider MIME declarations.

## Pipeline and state

`uploading → stored → checking → verified | rejected | quarantined → delivered → accepted | review_expired | disputed`.

These are artifact/delivery states, not payment states. A provider terminal frame starts checks. Streaming text remains provisional and may differ from the retained final revision; clearly identify the final deliverable. A failed check never produces a verified badge or starts the review clock.

Delivery requires complete retained output, passed mandatory checks and an authorized buyer access path. Persist `deliveredAt`, the immutable revision, check report and notification outbox together. Notification failure retries delivery notification, not agent execution. The review deadline is derived from `deliveredAt`; material access outages pause the application review deadline and hold payouts under an audited policy.

Owned records: `Artifact`, `ArtifactRevision`, `UploadGrant`, `VerificationProfile`, `CheckResult`, `DeliveryRecord`, `AcceptanceRecord`, `RetentionHold`. Input attachments remain M02-owned.

## Interfaces and rights

Proposed commands: `createUploadGrant`, `finalizeUpload`, `verifyResult`, `deliverResult`, `acceptDelivery`, `requestRepair`, `getDownloadGrant`, `exportOrder`. Buyer routes include `/v1/orders/:id/artifacts`, `/v1/orders/:id/acceptance` and `/v1/artifacts/:id/download`.

Upload grants bind application/attempt, storage key, permitted size/type and expiry; provider-supplied remote URLs are not automatically fetched. Downloads require current ownership/entitlement; short-lived links are bearer capabilities and must not enter public logs.

Payment creates the right to inspect delivered work. Refunding may stop future service but cannot retract a downloaded file. Artifact/license terms state post-refund rights explicitly; do not imply technical revocation can undo possession.

## Repairs and retention

A repair creates a new immutable revision and a bounded M04 run; preserve the earlier result and buyer feedback. New-scope work belongs to a revision order. Repeated repair requests cannot reset policy clocks without explicit recorded agreement.

Proposed baseline: at least 90 days downloadable after closure, longer for active disputes, with retention costs included in pricing. Define deletion jobs, orphan upload cleanup, backup retention and legal/privacy exceptions before production. A deletion request must disclose any active evidence hold.

## Acceptance conditions

Cross-order artifact grants fail; partial/mutated uploads never verify. Unsafe previews cannot execute active content. A provider success frame cannot create delivery. Access outage and failed notification do not silently forfeit review rights. Revisions, check evidence and refund cases remain traceable after repair or rollback.
