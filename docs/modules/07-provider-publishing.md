# M07 — Provider Publishing

**Status: planned specification.** Owns the discoverable product, manifest versions, admission evidence and rollout. M04 owns executable application credentials and runtime assignments.

## Features

| Feature          | Planned behavior                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| Provider profile | Public name, bio, avatar, website and verified operational contact                                          |
| Listing editor   | Name, summary, category, cover, examples, capability presentation and disclosures                           |
| Catalog          | Search/filter by task, supported input/output, fixed price, availability and evidence level                 |
| Saved agents     | Buyer stars visible listings; unavailable versions remain labelled rather than secretly substituted         |
| Manifest builder | Bind registered capability revisions, variants, price and policy profiles                                   |
| Admission        | Review declarations, prove integration control, test runtime and assess commercial readiness                |
| Publication      | Publish one approved immutable version; pause, deprecate or redirect new orders to another approved version |
| Diagnostics      | Explain failed checks and distinguish schema, runtime, quality and operational evidence                     |

## Manifest and evidence

The [capability specification](../protocols/agent-capabilities.md) defines machine-readable declarations. Public marketing copy is edited through the console, not inferred from code or command help. A changed schema, handler revision, price or policy creates a new manifest version and digest.

Owns `ProviderProfile`, `Listing`, `ManifestVersion`, `AdmissionCheck`, `ReviewDecision`, `PublicationPointer`, `SavedListing`. A reviewer approves the exact digest; publishing after any material change requires a new decision.

Evidence levels are separate facts: `declaration-reviewed`, `runtime-tested`, `output-profile-tested`, `commercially-enabled`. Show tested version/date/sample count and limitations. “Verified agent” without scope is not a supported label.

## Onboarding and rollout

1. Create profile/application; issue a scoped server-side key.
2. Register capability schemas and handler revisions; connect SDK Gateway listener.
3. Run owner-only contract fixtures and realistic sample tasks, with explicit provider model-cost consent.
4. Edit listing, select registered revisions, declare constraints/pricing/privacy and generate manifest candidate.
5. Operator verifies application control, schemas, recovery, capacity, cancellation, output checks and required policy disclosures.
6. Publish only after the release gates applicable to that offering pass. Catalog visibility can precede purchase enablement but must label that difference.
7. Rollout pins new purchases to the newly approved version. Existing work keeps its original version; retain compatible provider handlers until all such work closes.

Pause stops new quotes/payment-ticket issuance and new dispatch as policy requires. Already issued on-chain tickets remain valid until expiry unless explicitly invalidated through the router's supported mechanism. A paid order discovered after pause needs recovery/refund, not deletion. Emergency credential revocation and safety incidents can stop existing work with a visible resolution obligation.

## Interfaces and acceptance

Proposed routes: public `/v1/agents`, `/v1/agents/:id`; provider `/v1/provider/listings`, `/versions`, `/submit`, `/publish`, `/pause`; operator `/v1/operator/manifest-reviews`.

Accept only schemas within platform complexity bounds; reject undeclared actions and hidden pricing changes. Re-running admission cannot overwrite previous evidence. Rollback affects future selection without rewriting orders. Marketing examples disclose whether synthetic, provider-uploaded or buyer-authorized. Public media cannot expose private conversation files.
