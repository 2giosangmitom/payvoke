# Agent capabilities and capacity

**Normative target contract, protocol `agentne/1`; not an implemented SDK API.** A capability describes work. Capacity describes current throughput. Neither grants financial authority.

## Declaration layers

| Layer                 | Owner                     | Mutability and meaning                                                    |
| --------------------- | ------------------------- | ------------------------------------------------------------------------- |
| Public listing        | M07/provider editor       | Marketing text and discovery; never executable instructions               |
| Capability revision   | M04/provider registration | Immutable schemas, handler binding, trigger and protocol support          |
| Manifest version      | M07/reviewed publication  | Pins capability revisions, variants, output profiles and commercial terms |
| Runtime advertisement | M04/provider heartbeat    | Ephemeral connectivity, capacity and health; cannot change price/schema   |
| Run grant             | M04/platform admission    | Exact attempt, input, deadline and permitted operations                   |

## Capability fields

| Field                                 | Required meaning                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| `capabilityId`, `revision`, `handler` | Stable identity, immutable revision and provider handler name                              |
| `title`, `description`                | Plain-text explanation for buyer/command form                                              |
| `triggers`                            | `slash_command`, `message`, or both; never an implicit subscription to all chat            |
| `commandName`                         | Unique slash name when that trigger is supported                                           |
| `mode`                                | `task` or `bounded_session`                                                                |
| `inputSchema`                         | Restricted JSON Schema for structured input; no remote references or executable validators |
| `contextPolicy`                       | Allowed selected message/brief fields; maximum context size; no implicit full history      |
| `attachments`                         | Allowed media types, count and byte limits; scanned files only                             |
| `outputs`                             | Required profile, schema, file count/size and check profile                                |
| `interactions`                        | Allowed structured input requests; bounded number; timeout behavior                        |
| `streaming`                           | Supported `agentne/1` AG-UI subset and maximum output                                      |
| `execution`                           | Runtime limit, cancellation mode, recovery mode, side-effect class                         |
| `session`                             | Maximum buyer turns and wall-clock duration when session mode applies                      |
| `variants`                            | Stable variant IDs, disclosed model/provider claims and fixed price bindings               |
| `privacy`                             | Declared external subprocessors, retention and data-use policy reference                   |

Release-one schemas allow bounded objects, arrays, enums, strings, numbers and booleans. Enforce size, nesting, pattern and property limits; no recursive/remote `$ref`. Unknown fields or unsupported schema vocabulary fail registration. A reviewed manifest references canonical schema digests and a platform-owned schema-profile version.

Declared model identity and privacy claims remain provider assertions unless independently verified. “Uses model X” is not cryptographic attestation. The buyer sees what is declared versus tested.

## Example manifest fragment

This complete fragment describes one capability; listing identity, price/token and policy versions are supplied by the enclosing reviewed manifest. Example values are design fixtures, not existing deployed IDs.

```json
{
  "protocol": "agentne/1",
  "capabilityId": "logo-concept",
  "revision": "rev-1",
  "handler": "designLogo",
  "title": "Create a logo concept",
  "description": "Create one raster logo concept from a brand brief.",
  "triggers": ["slash_command"],
  "commandName": "design-logo",
  "mode": "task",
  "inputSchema": {
    "type": "object",
    "additionalProperties": false,
    "required": ["brand", "brief"],
    "properties": {
      "brand": { "type": "string", "minLength": 1, "maxLength": 120 },
      "brief": { "type": "string", "minLength": 1, "maxLength": 4000 }
    }
  },
  "contextPolicy": { "fields": ["selectedBrief"], "maxBytes": 16384 },
  "attachments": {
    "mediaTypes": ["image/png", "image/jpeg"],
    "maxFiles": 3,
    "maxBytesPerFile": 10485760
  },
  "outputs": {
    "profile": "image-v1",
    "mediaTypes": ["image/png"],
    "requiredFiles": 1,
    "maxBytes": 10485760,
    "checkProfile": "raster-logo-v1"
  },
  "interactions": { "types": [], "maxRequests": 0 },
  "streaming": { "profile": "text-progress-v1", "maxBytes": 1048576 },
  "execution": {
    "maxSeconds": 600,
    "cancellation": "cooperative",
    "recovery": "status_only",
    "sideEffects": "output_only"
  },
  "variants": [{ "id": "standard", "pricingRef": "logo-fixed-v1" }],
  "privacy": { "policyRef": "provider-data-v1", "subprocessors": ["declared-model-vendor"] }
}
```

`raster-logo-v1` must have actual check fixtures before admission. Its presence in an example does not create a supported verification profile.

## Example offerings and limits

| Agent              | Capabilities                         | Inputs and output                                                   | Trigger / commercial scope                                                 |
| ------------------ | ------------------------------------ | ------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Logo designer      | `logo-concept`                       | Brand brief + reference raster → one checked raster concept         | `/design-logo`; one task, optional included repair                         |
| Research assistant | `research-brief`, `clarify-research` | Question + selected sources → structured claims, citations and text | Task command or bounded session; citation profile required                 |
| Document extractor | `extract-fields`                     | Supported scanned document → schema-valid JSON                      | `/extract`; file limits and confidence disclosure                          |
| Coding assistant   | `review-code`                        | Selected source files → findings with locations                     | Task only; no deployment, repository write or arbitrary platform execution |

These are product examples, not claims that four agents or all their output profiles already exist. An agent may expose multiple capabilities, but every purchased run pins one.

## Runtime capacity

Provider heartbeat advertises `applicationId`, active protocol/revisions, `maxConcurrentRuns`, per-capability limits, active attempt IDs and health. Proposed heartbeat interval is 15 seconds; after 45 seconds without a valid heartbeat stop new dispatch. Values require load testing and remain configurable.

The platform calculates available slots from its own active/reserved/uncertain attempts, bounded by approved application limits and provider advertisement. Provider-reported zero active tasks cannot erase a durable reservation. Atomically reserve a slot before dispatch. Queue size and per-buyer fairness are platform policy, not arbitrary provider settings.

Runtime version removal drains old work; new registration cannot mutate an in-flight handler binding. When a provider cannot recover a running attempt it must report `uncertain`, not advertise a free slot and restart it.

## Permission boundary and negotiation

Handshake negotiates protocol/schema/event profiles. Unsupported required capabilities reject the integration with actionable diagnostics; no silent downgrade. Optional features can be omitted only when the quote does not promise them.

Release one permits `output_only` effects. External read access must be disclosed; external writes, account modification, purchases and tool execution in the buyer environment require a future separately reviewed capability model. Provider-declared permissions cannot grant platform or wallet authority.

The platform can restrict credentials and effects through its own APIs; it cannot sandbox all code on independently operated provider infrastructure. Side-effect and privacy declarations therefore require provider accountability and admission evidence, and must not be presented as technically enforced guarantees about the provider's entire environment.

Admission tests cover actual useful output, process compliance, replay/recovery, capacity and malicious inputs. Maintain version/date/sample count and fixture evidence; a manifest declaration alone establishes none of these.
