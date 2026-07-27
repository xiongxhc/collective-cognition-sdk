# Portable Cognition Contract 0.1.0

## Status and Scope

This document defines the Normative Stable serialized Portable Cognition Contract version `0.1.0`. It defines values exchanged between hosts; it does not define persistence, publication, authentication, policy execution, access control, or an organizational ontology.

The JSON Schema at [`schemas/0.1.0/portable-cognition.schema.json`](schemas/0.1.0/portable-cognition.schema.json) is normative for serialized structure. This prose is normative for lexical, depth, lifecycle, isolation, and trust-boundary behavior that JSON Schema alone cannot prove.

## Normative Rules

### PCR-001 Envelope and discriminator

A Portable Cognition record MUST be a JSON object with exactly `schemaVersion`, `recordType`, and `payload`. `recordType` MUST select exactly one of `cognitive-object`, `cognition-event`, `transition-context`, `authorization-decision`, or `domain-error`; the payload MUST match that family. Unknown envelope members MUST be rejected.

### PCR-002 Supported contract version

The envelope `schemaVersion` MUST equal `"0.1.0"`. A cognition-event payload also carries its own `schemaVersion`, which MUST equal `"0.1.0"` and remains distinct from the envelope version domain.

### PCR-003 JSON and lexical profile

Records MUST contain only JSON values, finite IEEE 754 binary64 numbers, and Unicode scalar strings. Serialized JSON MUST reject duplicate member names at every level and lone UTF-16 surrogate code units before ordinary parsing erases that information. Schema validators operate on parsed values; lexical fixtures are normative for this pre-schema boundary.

### PCR-004 Depth boundary

The complete record MUST contain at most 256 nested JSON containers, counting the envelope object as depth 1 and each object or array as one additional depth. Implementations MUST reject a deeper record before recursive cloning, freezing, canonicalization, or other processing.

### PCR-005 Cognitive object common fields

A cognitive-object payload MUST contain non-whitespace `id`, `title`, and `contextId`; a positive integer `version`; RFC 3339 `createdAt` and `updatedAt`; exact attribution; one or more provenance entries; relationships; and an object `data`. `createdAt` MUST NOT be later than `updatedAt`. The payload is closed except for `data` and optional `extensions`.

### PCR-006 Type-state correlation

`type` MUST be exactly one of `identity`, `goal`, `hypothesis`, `experiment`, `evidence`, `decision`, or `principle`; `state` MUST use that type's supported state enum. Types and states from different object families MUST be rejected.

### PCR-007 Open typed data

`data` MUST be a JSON object. Known optional fields use these portable types: identity (`actorKind`, `displayName`); goal (`objective`, `description`, `successCriteria`); hypothesis (`statement`, `claim`, `scope`); experiment (`action`, `expectedOutcome`, `successCriteria`); evidence (`statement`, `evidenceKind`, `polarity`, `sourceActorId`, `project`); decision (`rationale`, `selectedOption`, `rejectedOptions`); and principle (`rule`, `rationale`). Other `data` members MAY contain JSON values but MUST NOT override core contract meaning.

### PCR-008 Namespaced extensions

Optional `extensions` MUST be a JSON-valued object whose immediate keys contain a non-empty namespace and name separated by `:` or `.`. Unsupported unnamespaced members MUST NOT be treated as extensions.

### PCR-009 Attribution

Attribution MUST be a closed object containing non-whitespace `initiatorId`, `executorId`, and `accountableId`. It records asserted roles and does not authenticate them.

### PCR-010 Provenance

Each provenance entry MUST be a closed object containing non-whitespace `source` and `sourceId` and a valid `capturedAt` timestamp. Optional `uri` and `contentHash` MUST be non-whitespace strings. Provenance links do not prove source access, content binding, or truth.

### PCR-011 Relationship shape and uniqueness

Each relationship MUST be a closed `{ "type", "targetId" }` object using a declared relationship type and a non-whitespace opaque target ID. A cognitive object MUST NOT repeat the same relationship type-target pair. Target existence and cross-store integrity are host responsibilities.

### PCR-012 Relationship cardinality

A hypothesis requires `supports-goal`; an experiment requires `tests-hypothesis`; evidence requires one of `supports-hypothesis`, `challenges-hypothesis`, `relates-to-hypothesis`, or `observed-in-experiment`; a decision requires `supports-goal`, `justified-by-evidence` or `informs-decision`, `considers-option`, and `accountable-identity`; and a principle requires `justified-by-decision` or `justified-by-evidence`.

### PCR-013 Cognitive event shape

A cognition event MUST be closed and contain its identity, payload schema version, object identity/type/version, previous and next states, occurrence time, context ID, three actors, automation mode, consequence level, non-whitespace rationale, one or more provenance entries, and optional human confirmation.

### PCR-014 Lifecycle edge and event-type correlation

An event MUST represent one supported current lifecycle edge for its `objectType`. It MUST reject same-state events, unsupported jumps, states from another type, and an event `type` inconsistent with the target state. The schema enumerates every supported edge and deterministic event type.

### PCR-015 Transition context

A transition-context payload MUST be closed and contain `eventId`, `occurredAt`, initiator, executor, accountable party, automation mode, consequence level, and non-whitespace rationale. A standalone context does not bind its confirmation object and target state to a transition request; that binding is a runtime operation.

### PCR-016 Human confirmation

When a confirmation is present, it MUST be closed; its actor kind MUST be `human`, its event ID MUST equal the containing context event ID, and its confirmation time MUST NOT follow the context occurrence time. Its object ID and target state MUST be non-whitespace strings. This assertion is not authentication or proof of consent.

### PCR-017 Authorization decisions

An authorization decision MUST be exactly one closed shape: `{ "status": "allowed" }`, `{ "status": "denied", "reason": "..." }`, or `{ "status": "confirmation_required", "reason": "...", "requiredActorKind": "human" }`. It records a decision value and does not identify or trust the policy that produced it.

### PCR-018 Domain error projection

A domain-error payload MUST be closed and contain a current stable domain `code`, a non-whitespace `message`, and a JSON-object `details` map. It omits stack traces, causes, host paths, exception names, and arbitrary host exception text. Consumers MUST branch on `code`, not message wording.

### PCR-019 Runtime isolation and immutability

Runtime acceptance MUST validate first, clone accepted values, and deeply freeze the clone. Implementations MUST NOT retain mutable caller-owned references. Serialization MUST validate before encoding; malformed JSON text uses `SERIALIZATION_ERROR`.

### PCR-020 Stable portable error classification

Portable-contract structural, lexical, and runtime-boundary failures MUST expose `INVALID_PORTABLE_COGNITION_RECORD` as a machine-readable code. Validator-library error paths, ordering, and wording are not portable API.

### PCR-021 Version independence

The portable contract version, package version, cognitive-object revision `version`, and event payload schema version are independent domains. A released versioned schema and fixture artifact MUST NOT be silently repurposed; a changed accepted value requires a new contract version artifact.

### PCR-022 Host trust boundary

Schema validity establishes serialized shape only. Hosts remain responsible for identity, authorization provenance, access control, secret filtering, retention, deletion policy, trusted persistence, publication, and delivery. Open `data` values receive no authority over lifecycle, attribution, provenance, relationships, events, or authorization.

## Conformance

The normative fixtures are:

- [`conformance/0.1.0/portable-cognition/valid.jsonl`](conformance/0.1.0/portable-cognition/valid.jsonl)
- [`conformance/0.1.0/portable-cognition/invalid.jsonl`](conformance/0.1.0/portable-cognition/invalid.jsonl)
- [`conformance/0.1.0/portable-cognition/cognitive-loop.jsonl`](conformance/0.1.0/portable-cognition/cognitive-loop.jsonl)

Valid fixtures are direct records. Invalid fixtures contain `description`, `ruleId`, `expectedCode`, and exactly one of `record` or lossless `recordJson`; `validationLayer` is `lexical` or `runtime` only when schema validation cannot establish the rule. The cognitive-loop corpus contains linked records for all seven object types and each non-object record family.

An implementation claiming Portable Cognition Contract `0.1.0` conformance MUST accept every valid record, reject every invalid record at its declared validation layer with its `expectedCode`, and enforce the applicable lexical, depth, lifecycle, isolation, and trust-boundary rules above.
