# Universal Ingestion Implementation Plan

**Status:** Complete and verified

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved neutral `SourceRecord → explicit promotion → CognitiveObject` boundary with generic JSON/JSONL tooling and a migrated team-memory connector.

**Architecture:** A dependency-free ingestion layer validates immutable source records and classifies duplicate source revisions without persistence. Explicit, versioned promotion maps validated records to Evidence; a composed workflow preserves both stages. Source-specific readers emit canonical records from connector modules and never define the root API.

**Tech Stack:** Node.js 24+, native erasable TypeScript, `node:test`, `node:assert`, `node:crypto`, `node:fs`, and `node:sqlite`.

## Global Constraints

- The package has no production dependencies.
- External ingestion is neutral first; collected material never becomes Evidence implicitly.
- `(source.system, source.instance, sourceId, revisionId)` is the logical source-revision key.
- Equal keys and canonical content classify as duplicates; equal keys with different canonical content fail as collisions.
- Source records are immutable JSON-compatible values.
- Promotion is explicit, identifies a policy ID/version, preserves source-record provenance, and uses normal core object validation.
- A composed workflow exposes ingestion and promotion separately.
- Canonical JSON and JSONL work without connector code.
- Team-memory becomes an optional connector and is not exported from `src/index.ts`.
- SQLite access remains read-only.
- The personal Obsidian vault is never read or written.
- Every behavior change follows RED → GREEN TDD.
- All repository Markdown remains synchronized with implementation status.

---

### Task 1: SourceRecord Contract

**Files:**
- Create: `src/source-records.ts`
- Modify: `src/errors.ts`
- Modify: `src/index.ts`
- Create: `tests/source-records.test.ts`

**Interfaces:**
- Produces: `SOURCE_RECORD_SCHEMA_VERSION`
- Produces: `createSourceRecord(input: CreateSourceRecordInput): SourceRecord`
- Produces: `validateSourceRecord(value: unknown): asserts value is SourceRecord`
- Produces: `serializeSourceRecord(record: SourceRecord): string`
- Produces: `deserializeSourceRecord(json: string): SourceRecord`
- Produces: `sourceRevisionKey(record: SourceRecord): string`
- Produces: `canonicalizeJson(value: JsonValue): string`

- [x] **Step 1: Write failing contract tests**

Cover valid creation, deep immutability, required source/revision fields, ISO timestamps, media type, JSON-only content/context/extensions, optional integrity metadata, serialization round trip, deterministic canonical object-key ordering, and collision-safe revision keys.

```ts
const record = createSourceRecord({
  id: "source-record:1",
  source: { system: "git", instance: "github.example/acme" },
  sourceId: "commit:abc",
  revisionId: "abc",
  capturedAt: "2026-07-24T10:00:00.000Z",
  observedAt: "2026-07-24T09:59:00.000Z",
  mediaType: "application/json",
  content: { summary: "Added source records." },
  contentHash: "sha256:abc",
});
```

- [x] **Step 2: Run RED**

Run: `node --test tests/source-records.test.ts`

Expected: FAIL because `createSourceRecord` and related exports do not exist.

- [x] **Step 3: Implement the contract**

Use schema version `"0.1.0"`. Reject malformed external records with `INVALID_SOURCE_RECORD`; wrap malformed serialized JSON with `SERIALIZATION_ERROR`. Clone and deeply freeze every returned JSON-compatible value. Encode revision-key segments as a canonical JSON array rather than delimiter concatenation.

- [x] **Step 4: Run GREEN**

Run: `node --test tests/source-records.test.ts tests/objects.test.ts`

Expected: all focused tests pass.

- [x] **Step 5: Commit**

```bash
git add src/source-records.ts src/errors.ts src/index.ts tests/source-records.test.ts
git commit -m "feat: add neutral source record contract"
```

### Task 2: Generic Batch Ingestion

**Files:**
- Create: `src/ingestion.ts`
- Modify: `src/index.ts`
- Create: `tests/ingestion.test.ts`

**Interfaces:**
- Consumes: `SourceRecord`, `validateSourceRecord`, `sourceRevisionKey`, `canonicalizeJson`
- Produces: `ingestSourceRecords(values, options?): IngestionBatchResult`
- Produces: `ingestSourceRecordText(text, options): IngestionBatchResult`
- Produces: `IngestionMode`, `IngestionItemResult`, and `IngestionBatchResult`

- [x] **Step 1: Write failing ingestion tests**

Cover accepted records, duplicate classification, collision rejection, existing-record seeding, collect-all malformed-item results, fail-fast errors, JSON object/array input, JSONL blank lines, and one malformed JSONL line that does not hide valid lines.

```ts
const result = ingestSourceRecords([record, record], {
  mode: "collect-all",
});
assert.deepEqual(result.items.map((item) => item.status), [
  "accepted",
  "duplicate",
]);
```

- [x] **Step 2: Run RED**

Run: `node --test tests/ingestion.test.ts`

Expected: FAIL because the ingestion module does not exist.

- [x] **Step 3: Implement deterministic classification**

Use `sourceRevisionKey` for logical identity and canonicalize `{ mediaType, content }` for collision comparison. Return item-level accepted, duplicate, and rejected results. A duplicate references the retained record ID. A collision uses `SOURCE_REVISION_COLLISION`. Collect-all never throws for an item failure; fail-fast throws the matching `DomainError`.

- [x] **Step 4: Implement JSON and JSONL ingestion**

`ingestSourceRecordText` accepts `format: "json" | "jsonl"`. JSON accepts one object or an array. JSONL parses non-empty lines independently and records one-based line numbers in item results.

- [x] **Step 5: Run GREEN**

Run: `node --test tests/ingestion.test.ts tests/source-records.test.ts`

Expected: all focused tests pass.

- [x] **Step 6: Commit**

```bash
git add src/ingestion.ts src/index.ts tests/ingestion.test.ts
git commit -m "feat: add generic source record ingestion"
```

### Task 3: Explicit Evidence Promotion

**Files:**
- Create: `src/promotion.ts`
- Modify: `src/index.ts`
- Create: `tests/promotion.test.ts`

**Interfaces:**
- Consumes: `SourceRecord`, `ingestSourceRecords`, `createObject`
- Produces: `EvidencePromotionPolicy`
- Produces: `EvidencePromotionRequest`
- Produces: `promoteSourceRecordToEvidence(request, policy): CognitiveObject<"evidence">`
- Produces: `neutralEvidencePolicyV1`
- Produces: `ingestAndPromoteEvidence(values, request, policy, options?)`

- [x] **Step 1: Write failing promotion tests**

Cover explicit policy execution, deterministic Evidence IDs, source-record provenance, policy ID/version metadata, attribution and hypothesis relationships, invalid mapping rejection, and no promotion for rejected or duplicate batch items.

```ts
const evidence = promoteSourceRecordToEvidence({
  record,
  hypothesisId: "hypothesis:delivery",
  contextId: "organization:acme",
  promotedAt: "2026-07-24T11:00:00.000Z",
  attribution: {
    initiatorId: "human:owner",
    executorId: "agent:importer",
    accountableId: "human:owner",
  },
}, neutralEvidencePolicyV1);
```

- [x] **Step 2: Run RED**

Run: `node --test tests/promotion.test.ts`

Expected: FAIL because the promotion API does not exist.

- [x] **Step 3: Implement explicit promotion**

The policy exposes `{ id, version, map(record) }`. The mapping returns `title`, `statement`, `evidenceKind`, and `polarity`. Evidence provenance uses `source: "collective-cognition:source-record"` and `sourceId: record.id`; namespaced extensions preserve the source-revision key and policy identity.

- [x] **Step 4: Implement the built-in neutral policy and composition**

`neutralEvidencePolicyV1` uses string content directly, an object `summary` string when present, and canonical JSON otherwise. It always emits `polarity: "neutral"`. `ingestAndPromoteEvidence` returns `{ ingestion, promotions }` and promotes accepted records only.

- [x] **Step 5: Run GREEN**

Run: `node --test tests/promotion.test.ts tests/ingestion.test.ts tests/cognitive-loop.test.ts`

Expected: all focused tests pass.

- [x] **Step 6: Commit**

```bash
git add src/promotion.ts src/index.ts tests/promotion.test.ts
git commit -m "feat: add explicit evidence promotion"
```

### Task 4: Connector and Generic CLI

**Files:**
- Modify: `src/adapters/team-memory.ts`
- Modify: `src/teammem-cli.ts`
- Create: `src/cli.ts`
- Modify: `examples/team-memory-evidence.ts`
- Modify: `src/index.ts`
- Modify: `package.json`
- Modify: `tests/team-memory.test.ts`
- Create: `tests/cli.test.ts`

**Interfaces:**
- Consumes: SourceRecord ingestion and Evidence promotion APIs
- Produces: `teamMemoryEventToSourceRecord(row): SourceRecord`
- Produces: source-neutral `validate`, `ingest`, `promote`, and `ingest-promote` CLI commands
- Produces: team-memory SourceRecord JSONL export

- [x] **Step 1: Write failing connector tests**

Change team-memory expectations from direct Evidence to SourceRecord. Assert source system, source item/revision identity, preserved row content, parsed refs, read-only behavior, and absence of team-memory exports from `src/index.ts`.

- [x] **Step 2: Run connector RED**

Run: `node --test tests/team-memory.test.ts`

Expected: FAIL because `teamMemoryEventToSourceRecord` does not exist and old root exports remain.

- [x] **Step 3: Implement connector migration**

Map rows to `application/vnd.team-memory.event+json` records. Use person plus upstream event source as `sourceId`, hash as `revisionId`, row timestamp as observed/captured time, and preserve project, kind, summary, refs, and raw in content. `teammem:export` requires only `--db` plus existing filters and emits SourceRecord JSONL.

- [x] **Step 4: Write failing generic CLI tests**

Use temporary JSON/JSONL files and subprocess assertions. Verify machine-readable output, stdin via `--input -`, duplicate suppression for `ingest`, explicit required promotion arguments, neutral-Evidence output, malformed-line diagnostics, and zero stdout on invalid command arguments.

- [x] **Step 5: Run CLI RED**

Run: `node --test tests/cli.test.ts`

Expected: FAIL because `src/cli.ts` and package script `cc` do not exist.

- [x] **Step 6: Implement the generic CLI**

Support:

```text
validate --input <path|-> --format <json|jsonl>
ingest --input <path|-> --format <json|jsonl>
promote --input <path|-> --format <json|jsonl> --policy neutral-evidence-v1 --hypothesis-id <id> --context-id <id> --initiator-id <id> --executor-id <id> --accountable-id <id> --promoted-at <ISO>
ingest-promote <same promotion arguments>
```

`validate` writes one item-result JSON line per input. `ingest` writes accepted normalized SourceRecords only. `promote` validates then promotes every valid unique record. `ingest-promote` uses the composed API. Diagnostics go to stderr.

- [x] **Step 7: Update the example and checks**

The team-memory example imports its connector directly, creates source records, and explicitly promotes them with `neutralEvidencePolicyV1`. Add `src/source-records.ts`, `src/ingestion.ts`, `src/promotion.ts`, `src/cli.ts`, and new tests to `npm run check`.

- [x] **Step 8: Run GREEN**

Run: `node --test tests/team-memory.test.ts tests/cli.test.ts`

Expected: all connector and CLI tests pass.

- [x] **Step 9: Commit**

```bash
git add src/adapters/team-memory.ts src/teammem-cli.ts src/cli.ts src/index.ts examples/team-memory-evidence.ts package.json tests/team-memory.test.ts tests/cli.test.ts
git commit -m "feat: migrate team memory to source connector"
```

### Task 5: Conformance, Documentation, and Verification

**Files:**
- Create: `spec/fixtures/source-records/valid.jsonl`
- Create: `spec/fixtures/source-records/invalid.jsonl`
- Create: `tests/conformance.test.ts`
- Modify: `README.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/superpowers/specs/2026-07-24-universal-ingestion-design.md`
- Modify: `rfcs/0001-universal-source-record-ingestion.md`
- Modify: `rfcs/README.md`
- Modify: `spec/README.md`
- Modify: `docs/superpowers/plans/2026-07-24-universal-ingestion.md`

**Interfaces:**
- Consumes: complete Phase 2 implementation
- Produces: canonical fixtures, synchronized documentation, and fresh completion evidence

- [x] **Step 1: Write failing conformance tests**

Assert that every valid fixture is accepted, every invalid fixture is rejected with its expected code, canonical JSON/JSONL produces equivalent records, and the root public API contains no source-specific connector exports.

- [x] **Step 2: Run RED**

Run: `node --test tests/conformance.test.ts`

Expected: FAIL because fixtures do not exist.

- [x] **Step 3: Add canonical fixtures and pass conformance**

The valid fixture includes string and structured content plus optional source instance, observed time, content hash, actor, context, and namespaced extension examples. The invalid fixture includes missing revision identity, invalid timestamp, non-string media type, and unsupported schema version cases.

- [x] **Step 4: Reconcile all Markdown**

Mark RFC 0001 implemented, Phase 2 complete only after all acceptance checks pass, document exact current commands and migration behavior, and retain Phase 3+ as planned. Historical `.superpowers` reports remain explicitly historical.

- [x] **Step 5: Run complete verification**

Run:

```bash
npm test
npx tsc --noEmit
npm run check
npm run example
git diff --check
```

Expected: zero failures, diagnostics, or whitespace errors.

- [x] **Step 6: Run end-to-end CLI verification**

Export a bounded team-memory SourceRecord JSONL file to `/tmp`, validate it with the generic CLI, promote it with `neutral-evidence-v1`, parse every output line, and verify the source ledger size and modification time remain unchanged.

- [x] **Step 7: Commit**

```bash
git add README.md docs rfcs spec tests/conformance.test.ts package.json
git commit -m "docs: complete universal ingestion phase"
```
