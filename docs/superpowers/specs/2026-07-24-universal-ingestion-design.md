# Universal Ingestion Design

**Date:** 2026-07-24  
**Architecture direction:** Approved  
**Implementation status:** Implemented and final-review verified in Phase 2

## Problem

The Phase 1 reference implementation exposed a team-memory SQLite reader and mapped source rows directly into `Evidence`. That proved the core could consume real data, but it was not a universal SDK boundary:

- a source record is not automatically evidence;
- direct conversion embeds one team's schema and interpretation in the root API;
- requiring every team to write TypeScript adapters creates an adoption barrier;
- connector-specific dependencies and release cycles should not control the semantic core.

Phase 2 implements one source-neutral entrypoint that works with canonical records from files, APIs, databases, messages, commits, tickets, documents, agents, and future systems without assigning cognitive meaning during collection.

## Decision

Universal ingestion is **neutral first**:

```text
external source
  → SourceRecord
  → explicit promotion policy
  → CognitiveObject
```

Every accepted item entering through the ingestion boundary becomes a cloned, deeply frozen `SourceRecord` before it can become `Evidence` or another cognitive object. A convenience workflow may perform ingestion and promotion in one caller operation, but the implementation must still produce and link both artifacts.

Callers that already possess a semantically complete cognitive object may use the core object API directly. They do not need to wrap that object in a `SourceRecord`.

## Why This Is the Universal Boundary

`SourceRecord` answers source questions:

- What system produced this item?
- What was its source identifier?
- When was it observed and captured?
- What content was preserved?
- Has the content changed?
- Which connector or caller supplied it?

A cognitive object answers interpretation questions:

- Is this material evidence?
- Which hypothesis or experiment does it relate to?
- Does it support, challenge, or remain neutral?
- Who is accountable for the interpretation?
- Which policy and rationale produced the interpretation?

Keeping those responsibilities separate lets organizations apply different interpretations to the same source material without rewriting or losing its provenance.

## Adoption Paths

The SDK supports four adoption levels:

1. **Canonical JSON or JSONL:** an operator or scheduled task emits `SourceRecord` documents and uses the generic CLI. No adapter code is required.
2. **Programmatic ingestion:** an application calls the ingestion API with source records. No connector is required.
3. **Reusable connector:** a maintained package reads a common external system and emits source records.
4. **Direct core usage:** a trusted application creates already-interpreted cognitive objects through the core API.

A team writes its own connector only when its source cannot emit canonical records and no reusable connector exists. Connectors are ecosystem conveniences, not a requirement imposed by the core.

## SourceRecord Boundary

The implemented schema version `0.1.0` includes:

```ts
interface SourceRecord {
  schemaVersion: string;
  id: string;
  source: {
    system: string;
    instance?: string;
  };
  sourceId: string;
  revisionId: string;
  capturedAt: string;
  observedAt?: string;
  mediaType: string;
  content: JsonValue;
  contentHash?: string;
  actorId?: string;
  context?: JsonObject;
  extensions?: JsonObject;
}
```

The boundary preserves these invariants:

- `id` is an opaque SDK record identity.
- `source.system`, optional `source.instance`, and `sourceId` identify the upstream item.
- `revisionId` identifies one immutable upstream revision; an upstream version is preferred, with a canonical content digest as the fallback.
- `capturedAt` records ingestion time; `observedAt` records source time when available.
- `mediaType` declares how to interpret `content`.
- `content` preserves the caller-authorized source material or a stable structured descriptor; large or restricted payloads may be represented by an integrity-bound reference.
- `contentHash`, when supplied, verifies content rather than defining semantic truth.
- source context and extensions remain JSON-compatible and namespaced where necessary.
- top-level and `source` objects are closed: unknown fields are rejected, and polarity, confidence, authority, or other source-specific semantics belong only in namespaced `extensions`.
- accepted external values are cloned and deeply frozen so later mutation of caller-owned input cannot change ingestion results.
- the tuple `(source.system, source.instance, sourceId, revisionId)` is the logical idempotency key.
- receiving the same key and canonical content is a duplicate, while receiving the same key with different canonical content is a collision error.
- a changed source revision creates a distinct immutable record or version; it never silently overwrites history.

The schema must not contain evidence polarity, confidence, decision status, or organizational truth claims. Canonicalization, digest algorithms, and reference integrity rules will be normative conformance work rather than connector-specific choices.

## Promotion

Promotion is an explicit interpretation operation. Its input includes:

- one or more source record IDs;
- a target cognitive object type supported by the core;
- accountable attribution and organization context;
- relationship targets such as a hypothesis or experiment;
- a named, versioned mapping policy;
- a rationale and timestamp.

The first implementation promotes one or more source records together into one `Evidence` object. `EvidencePromotionPolicy.map` receives the complete non-empty record array. Additional target types require their own accepted semantics rather than a generic arbitrary-object mapper.

Promotion must:

- preserve links to every contributing source record;
- identify the mapping policy and version;
- reject empty policy IDs, empty policy versions, empty record sets, and blank rationales;
- validate the resulting cognitive object through normal core rules;
- preserve accountable human or organizational attribution;
- return structured errors without partially emitting results.

Promotion must not:

- infer that collected material is accepted evidence;
- infer support, challenge, truth, confidence, or authority without an explicit policy;
- discard source records after promotion;
- let a connector bypass core validation.

## Convenience Workflows

The CLI and SDK may expose a composed operation for users who want one command:

```text
ingest source
  → validate and emit SourceRecord
  → apply named promotion policy
  → validate and emit Evidence
```

This is orchestration, not a collapsed data model. Output and events must make both steps observable. A failed promotion must not invalidate or conceal a valid source record. The SDK result contains the successful `ingestion` plus a discriminated `promotion` result; any exception raised after ingestion becomes a structured promotion failure instead of escaping the composed call.

## Logical Module Boundaries

The public architecture has four logical layers:

- **Core:** cognitive objects, lifecycles, authorization, events, and serialization.
- **Ingestion:** source-record schema, validation, JSON/JSONL codecs, idempotency, and promotion contracts.
- **CLI:** source-neutral commands over canonical records and named policies.
- **Connectors:** optional source-specific readers that emit canonical source records.

The root SDK API must expose source-neutral core and ingestion contracts. Source-specific functions such as team-memory SQLite queries belong in connector modules or separate packages and must not define the root behavior.

Exact package names and exports are deferred until the package-surface compatibility work is complete.

## Generic CLI Direction

The implemented `cc` CLI supports:

```bash
npm run --silent cc -- validate --input records.jsonl --format jsonl
npm run --silent cc -- ingest --input records.jsonl --format jsonl
npm run --silent cc -- promote --input records.jsonl --format jsonl \
  --policy neutral-evidence-v1 \
  --hypothesis-id hypothesis:delivery-risk \
  --context-id organization:team \
  --rationale "These records jointly document the delivery change." \
  --initiator-id human:owner \
  --executor-id agent:importer \
  --accountable-id human:owner \
  --promoted-at 2026-07-24T12:00:00.000Z
npm run --silent cc -- ingest-promote --input records.jsonl --format jsonl \
  --policy neutral-evidence-v1 \
  --hypothesis-id hypothesis:delivery-risk \
  --context-id organization:team \
  --rationale "These records jointly document the delivery change." \
  --initiator-id human:owner \
  --executor-id agent:importer \
  --accountable-id human:owner \
  --promoted-at 2026-07-24T12:00:00.000Z
```

The team-memory connector produces canonical JSONL:

```bash
npm run --silent teammem:export -- --db ledger.db --limit 5
```

The generic CLI is intended for operators, CI jobs, scheduled tasks, data migration, and teams that do not want to embed the TypeScript API. Applications, agents, connector authors, and platform teams use the SDK API directly.

`validate` emits item results, `ingest` emits accepted unique SourceRecords, `promote` emits one neutral Evidence object preserving every accepted unique record, and `ingest-promote` emits one result containing serialized ingestion plus a discriminated promotion outcome. JSON and JSONL input may come from a file or stdin.

The CLI accepts `--max-input-bytes`, `--max-records`, and `--max-record-bytes`, with finite defaults `10485760`, `10000`, and `1048576`. Files are size-checked before reading and stdin is read incrementally up to the configured limit.

## Team-Memory Migration

The team-memory experiment is migrated:

1. SQLite rows map to `SourceRecord`, not directly to `Evidence`.
2. The separate `neutral-evidence-v1` policy maps selected records to neutral collected evidence.
3. The connector is imported directly from `src/adapters/team-memory.ts` and is absent from the root export surface.
4. `teammem:export` now emits SourceRecord JSONL and no longer accepts hypothesis or context mapping arguments.
5. `example:teammem` demonstrates explicit promotion after collection.
6. Integration with `team-memory-agent` or its LaunchAgent remains separate work; this repository does not modify scheduled team-vault output.

This migration proves the generic boundary against a real source without making team-memory a universal dependency.

## Errors and Partial Success

Batch operations return item-level results:

- valid records remain usable when unrelated records fail;
- every failure identifies the item and stable error code;
- malformed input never becomes a partial cognitive object;
- composed ingestion and promotion report the two stages independently;
- callers choose whether a batch is fail-fast or collect-all.

`IngestionItemResult` is a discriminated union with status-specific fields. Ingestion limits fail with `INGESTION_LIMIT_EXCEEDED`. Every pre-output CLI failure is one JSON stderr diagnostic containing `code`, `message`, `details`, and `stage`; stdout remains empty.

## Security and Privacy

The core does not fetch arbitrary URLs, discover credentials, or obtain broad source access. Connectors receive explicit source configuration and apply least privilege.

Implementations must support:

- caller-configured input, record-count, and per-record byte limits;
- rejection of malformed or unsupported media types;
- secret-safe diagnostics;
- explicit handling of personally identifiable or restricted data;
- provenance retention without forcing raw secret storage;
- host-defined retention, redaction, and authorization policy.

The SDK does not treat successful parsing as consent to retain or promote data.

## Compatibility and Conformance

Universal adoption requires behavior that is testable outside one implementation. Phase 2 delivers:

- a versioned `SourceRecord` schema;
- valid and invalid JSON/JSONL fixtures;
- closed-field validation, normalization immutability, limits, duplicate, collision, positive revision, and multi-source promotion coverage in the TypeScript test suite;
- connector tests based only on emitted records;
- additive namespaced extension examples.

The Phase 2 implementation fixtures are in `spec/fixtures/source-records/`. They exercise the current TypeScript SDK and CLI but are not yet normative, versioned, language-neutral specification fixtures; those remain a Phase 3 deliverable.

Team-memory and the source-specific Git commit fixture connector both emit records that pass the same SourceRecord validation boundary. A reusable connector author harness remains Phase 4 work.

## Alternatives Considered

### Direct Source-to-Evidence Mapping

This is simple for one source but assigns cognitive meaning too early, couples source integrations to the ontology, and makes neutral archival impossible. It was the Phase 1 team-memory experiment, not the Phase 2 root boundary.

### Every Source Implements a Full Adapter

This keeps integrations strongly typed but forces each team to write and maintain code before basic adoption. It remains available for complex sources but is not required.

### Generic SourceRecord With Optional Composed Promotion

This is the selected approach. It gives every source a stable neutral boundary, permits no-code JSONL adoption, and retains a convenient one-command workflow without collapsing provenance and interpretation.

## Success Criteria

The universal-ingestion phase completed when:

1. canonical JSON and JSONL source records validate through both SDK and CLI;
2. identical source-revision keys and content produce deterministic duplicate classification;
3. changed source content preserves both revisions;
4. explicit promotion produces evidence linked to source records and a policy version;
5. a composed workflow exposes both ingestion and promotion results;
6. team-memory operates as a connector without source-specific root exports;
7. a second source-specific fixture connector passes the same SourceRecord conformance contract as team-memory;
8. all public documentation describes the same neutral-first architecture.

## Non-Goals

This design does not:

- automatically determine whether source material is true or useful;
- require every team to build a connector;
- define a universal evidence score;
- ship a connector marketplace;
- add persistence, synchronization, or a hosted service;
- change the team-memory-agent LaunchAgent or team-vault output;
- claim production readiness or millions of users before external validation.
