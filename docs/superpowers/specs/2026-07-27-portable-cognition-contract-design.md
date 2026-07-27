# Portable Cognition Contract Design

**Status:** Implemented and task-reviewed; Task 6 broad final review pending

**Date:** 2026-07-27

## Problem

The SDK can already create immutable cognitive objects and transition events, but those values are defined primarily by TypeScript types and runtime validation. A host written in another language cannot determine the complete serialized contract, validate exchanged cognition independently, or distinguish a portable cognitive object from an event, authorization result, transition request, or domain error.

The next Phase 3 slice must create one strict, versioned, language-neutral exchange boundary without selecting a database, event bus, service, connector, agent runtime, or organizational ontology.

## Decision

Introduce `PortableCognitionRecord` as a closed, self-describing JSON envelope:

```json
{
  "schemaVersion": "0.1.0",
  "recordType": "cognitive-object",
  "payload": {}
}
```

The `recordType` discriminator selects one of five exact payload families:

- `cognitive-object`;
- `cognition-event`;
- `transition-context`;
- `authorization-decision`; or
- `domain-error`.

Relationships, attribution, provenance, actors, confirmations, lifecycle states, and standard object data fields are defined inside those payload families. The envelope and structured core payloads are closed. Cognitive-object `data` remains an open JSON object so domain-specific cognition does not require changes to the universal contract.

## Alternatives

### Stabilize Existing Objects Directly

Rejected because existing `CognitiveObject` values have no serialized contract discriminator or contract version. Adding a required field directly would alter the current Supported Experimental object API and would make it difficult to carry non-object records through the same exchange path.

### Publish Schemas Without a Runtime Boundary

Rejected because the TypeScript reference implementation could then accept or emit values that do not pass the portable contract. A runtime create, validate, serialize, and deserialize path is required for differential conformance.

### Include Persistence and Event Publication

Deferred because persistence atomicity, query capabilities, transaction boundaries, and event delivery guarantees are host concerns. This slice defines the values a host stores or publishes; the next slice can define host integration interfaces against these records.

## Scope

### Included

- A Normative Stable Portable Cognition Contract `0.1.0`.
- Strict JSON Schema Draft 2020-12 validation.
- Normative prose with stable `PCR-*` rule identifiers.
- Versioned valid and invalid language-neutral JSONL fixtures.
- Lexical rejection of duplicate JSON member names and lone surrogate strings.
- A maximum nesting depth of 256 JSON containers, counting the envelope as depth 1.
- TypeScript runtime creation, validation, serialization, and deserialization.
- Differential schema/runtime tests.
- Package subpaths for the schema and conformance fixtures.
- One complete portable cognitive-loop fixture containing objects, events, transition contexts, authorization decisions, and a domain error.
- Package `0.2.0` and compatibility baseline `0.2.0` as an additive public capability.

### Excluded

- Persistence interfaces or implementations.
- Event buses, delivery guarantees, retries, subscriptions, or remote endpoints.
- Source connectors, team-memory behavior, Obsidian behavior, or vault discovery.
- Automatic interpretation, scoring, belief extraction, or semantic inference.
- Authentication or proof that a human confirmation is genuine.
- Registry publication or removal of `"private": true`.
- A `1.0.0` stability promise.

## Version Domains

- Portable contract version: `0.1.0`.
- Package version carrying the new public capability: `0.2.0`.
- Compatibility baseline for the resulting package inventory: `0.2.0`.
- Cognitive-object `version`: remains only an object revision counter.
- Cognition-event payload `schemaVersion`: remains `0.1.0` and is distinct from the envelope version even when both initially match.

The immutable SourceRecord contract and compatibility baseline `0.1.0` remain unchanged and distributed. A new compatibility baseline records additive root exports, package subpaths, declarations, emitted files, and normative artifact hashes.

## Runtime API

The package root adds:

```ts
export const PORTABLE_COGNITION_MAX_JSON_DEPTH = 256;
export const PORTABLE_COGNITION_SCHEMA_VERSION = "0.1.0";

export function createPortableCognitionRecord(
  input: CreatePortableCognitionRecordInput,
): PortableCognitionRecord;

export function validatePortableCognitionRecord(
  value: unknown,
): asserts value is PortableCognitionRecord;

export function serializePortableCognitionRecord(
  record: PortableCognitionRecord,
): string;

export function deserializePortableCognitionRecord(
  json: string,
): PortableCognitionRecord;
```

Validation, creation, and serialization each capture one JSON snapshot through own data-property descriptors without invoking accessors or inherited `toJSON` hooks. Semantic validation and serialization consume only that snapshot, so stateful callers are not reread. Reflection and snapshot failures use the stable portable error without underlying exception text. Creation restores ordinary JSON container prototypes, deeply freezes the accepted snapshot, and never retains caller-owned mutable references. Deserialization uses the existing profiled JSON parser so duplicate member names and lone surrogate strings are rejected before normal parsing can erase the distinction.

Portable-contract failures use a new stable code:

```ts
INVALID_PORTABLE_COGNITION_RECORD
```

Malformed JSON text remains `SERIALIZATION_ERROR`. Existing object, transition, authorization, event, ingestion, promotion, and SourceRecord APIs remain behaviorally unchanged.

## Envelope

Every record:

- MUST be a JSON object with exactly `schemaVersion`, `recordType`, and `payload`;
- MUST set `schemaVersion` to `"0.1.0"`;
- MUST use one of the five declared `recordType` values;
- MUST contain the payload selected by `recordType`;
- MUST contain only Unicode scalar strings;
- MUST contain only finite JSON numbers;
- MUST remain within 256 nested JSON containers;
- MUST reject duplicate JSON member names in serialized text; and
- MUST be cloned and deeply frozen after runtime acceptance.

## Cognitive Object Payload

The cognitive-object payload preserves the current common object model:

- non-whitespace `id`, `title`, and `contextId`;
- one of seven exact object `type` values;
- positive integer object `version`;
- a state valid for the selected object type;
- RFC 3339 `createdAt` and `updatedAt`, with `createdAt` not later than `updatedAt`;
- exact attribution with initiator, executor, and accountable IDs;
- one or more exact provenance references;
- exact typed relationships without duplicate type-target pairs;
- open JSON-object `data`; and
- optional namespaced `extensions`.

Known `data` fields remain optional. When present, their portable types are normative:

- identity: `actorKind`, `displayName`;
- goal: `objective`, `description`, `successCriteria`;
- hypothesis: `statement`, `claim`, `scope`;
- experiment: `action`, `expectedOutcome`, `successCriteria`;
- evidence: `statement`, `evidenceKind`, `polarity`, `sourceActorId`, `project`;
- decision: `rationale`, `selectedOption`, `rejectedOptions`;
- principle: `rule`, `rationale`.

Additional `data` properties MAY contain any JSON value. Their semantics are application-defined and MUST NOT override core envelope, lifecycle, attribution, provenance, relationship, authorization, or event meanings.

Relationship cardinality matches the current reference model:

- hypothesis requires `supports-goal`;
- experiment requires `tests-hypothesis`;
- evidence requires at least one hypothesis or experiment relationship;
- decision requires a goal, evidence or decision-information relationship, considered option, and accountable identity;
- principle requires a justifying decision or evidence relationship.

Relationship targets remain opaque identifiers. Existence, access, and cross-store integrity checks belong to a host.

## Cognition Event Payload

The cognition-event payload preserves:

- event identity and event payload schema version;
- object identity, type, and resulting object version;
- an allowed previous-state to next-state edge for the selected object type;
- the deterministic event type produced by the current transition implementation;
- occurrence time and context;
- initiator, executor, and accountable party;
- manual or automated mode;
- routine or consequential level;
- non-whitespace rationale;
- one or more provenance references; and
- optional human confirmation.

When event confirmation is present, its event ID, object ID, and target state bind respectively to the event ID, object ID, and next state. Confirmation and occurrence timestamps compare exact RFC 3339 instants across offsets and all 1–9 fractional-second digits.

The schema enumerates the supported lifecycle edges. It rejects same-state events, unsupported jumps, event types inconsistent with the target state, and states belonging to a different object type.

The event records an accepted transition. It does not prove durable persistence, publication, authentication, or downstream delivery.

## Transition Context Payload

The transition-context payload is closed and contains:

- event ID;
- occurrence timestamp;
- initiator, executor, and accountable party actors;
- automation mode;
- consequence level;
- non-whitespace rationale; and
- optional human confirmation.

When confirmation is present:

- the actor kind MUST be `human`;
- confirmation event ID MUST equal the context event ID;
- confirmation time MUST not follow occurrence time; and
- object ID and target state MUST be non-whitespace strings.

Binding the confirmation object ID and target state to a particular transition request remains a runtime operation because the standalone context record does not contain the target object.

## Authorization Decision Payload

Authorization decisions use one of three closed shapes:

```json
{ "status": "allowed" }
```

```json
{ "status": "denied", "reason": "..." }
```

```json
{
  "status": "confirmation_required",
  "reason": "...",
  "requiredActorKind": "human"
}
```

No additional fields are accepted. This contract records a decision value; it does not identify, execute, or trust the policy that produced it.

## Domain Error Payload

The domain-error payload is a closed serializable projection:

```json
{
  "code": "INVALID_OBJECT",
  "message": "Object id must be a non-empty string.",
  "details": {
    "field": "id"
  }
}
```

`code` uses the package's complete current domain-error inventory plus `INVALID_PORTABLE_COGNITION_RECORD`. `message` is a non-whitespace human-readable summary. `details` is a JSON object. Both are caller supplied.

Error message wording is not a compatibility identity. Consumers branch on `code` and may inspect documented detail fields. The shape has no dedicated stack, cause, host-path, or runtime-exception-name fields, and the runtime does not automatically project caught exceptions. Hosts must filter secrets, paths, and operational details from caller-supplied messages and details before creating records.

## Schema and Conformance Artifacts

The slice adds:

```text
spec/
  portable-cognition.md
  schemas/
    0.1.0/
      portable-cognition.schema.json
  conformance/
    0.1.0/
      portable-cognition/
        valid.jsonl
        invalid.jsonl
        cognitive-loop.jsonl
```

The schema uses `$defs` for shared JSON values, timestamps, actors, attribution, provenance, relationships, object payloads, event payloads, transition contexts, authorization decisions, and domain errors. One public entry schema validates the complete discriminated envelope.

Invalid fixtures contain:

- `description`;
- `ruleId`;
- `expectedCode`;
- exactly one of `record` or lossless `recordJson`; and
- optional `validationLayer` equal to `lexical` or `runtime`.

Every machine-checkable normative rule has at least one invalid fixture. Prose-only rules explain why schema or standalone runtime validation cannot prove the requirement.

## Conformance

Tests prove:

1. the schema compiles in strict Draft 2020-12 mode;
2. every valid fixture passes schema and runtime validation;
3. every invalid fixture fails at its declared validation layer;
4. schema-layer invalid fixtures fail both schema and runtime validation with `INVALID_PORTABLE_COGNITION_RECORD`;
5. lexical fixtures fail deserialization without leaking parser details;
6. the depth-256 boundary passes and depth 257 fails before recursive processing;
7. validation, creation, and serialization consume one own-descriptor snapshot without invoking inherited getters or `toJSON`, and reflection failures remain secret-safe;
8. every accepted runtime record is isolated and deeply frozen, and serialize-deserialize round trips preserve exact JSON meaning;
9. the complete cognitive-loop fixture contains linked objects and events covering all seven object types and every record family;
10. existing SourceRecord and runtime tests remain green;
11. packed artifacts contain exact approved schema, prose, fixtures, RFC, and compatibility files; and
12. `test:schema`, `pack:check`, and prepack run both SourceRecord and Portable Cognition schema suites; and
13. a clean installed consumer can resolve the schema and fixtures and use the runtime API.

Schema-validator error wording and ordering are not portable API.

## Package and Compatibility

The package moves from unpublished `0.1.0` to unpublished `0.2.0`. `"private": true` remains enabled.

New package subpaths expose:

```text
./schemas/portable-cognition/0.1.0
./conformance/portable-cognition/0.1.0/valid
./conformance/portable-cognition/0.1.0/invalid
./conformance/portable-cognition/0.1.0/cognitive-loop
./compatibility/0.2.0
```

Compatibility baseline `0.2.0`:

- preserves and hashes baseline `0.1.0`;
- records Portable Cognition Contract rule IDs plus exact schema, fixture, and normative-prose hashes;
- records the additive runtime and type exports;
- records package `0.2.0` metadata and exact emitted files;
- records the new stable portable error code;
- retains every existing public and Normative Stable artifact; and
- classifies the slice as an additive minor release.

The current baseline test is generalized so immutable historical baselines are verified separately from the baseline describing the current package.

## Security and Human Authority

- Portable confirmation metadata is an assertion, not authentication.
- Agents cannot satisfy a human confirmation by labeling themselves as human through an SDK operation.
- Schema validation does not establish actor identity, consent, authorization provenance, access rights, or organizational approval.
- The error shape has no dedicated stack, cause, exception-name, or path fields, and runtime boundary failures do not automatically project caught exceptions.
- Error messages and details are caller supplied; hosts must filter secrets, paths, and operational details before creating records.
- Open `data` values do not receive authority over lifecycle, attribution, provenance, relationships, events, or authorization.
- Hosts remain responsible for access control, secret filtering, retention, deletion policy, and trusted persistence.

## Documentation

Implementation updates:

- `README.md`;
- `docs/ROADMAP.md`;
- `spec/README.md`;
- `rfcs/README.md`;
- a new RFC 0003;
- compatibility prose where the new Normative Stable surfaces and baseline evolution must be recorded;
- package usage examples; and
- historical design documents only where a status note is required to prevent contradiction.

## Acceptance

The slice is complete when:

- all conformance, source, schema, compatibility, and package tests pass;
- TypeScript checking, build checks, examples, and package checks pass;
- the package installs into a clean temporary project;
- the installed consumer imports and round-trips a portable cognition record;
- every repository Markdown status statement is current or explicitly historical;
- code review finds no unresolved correctness or contract issue;
- the feature branch is merged into `master`;
- `master` is pushed and matches `origin/master`; and
- the feature branch is removed.
