# Final Universal Ingestion Review Fix Report

**Date:** 2026-07-24
**Base commit:** `9015b18b2e1da7f311887ea82a40fcca58cf76ab`
**Branch:** `feature/universal-ingestion`
**Status:** Complete and verified
**Commit message:** `fix: close universal ingestion review gaps`

## Scope

Implemented the final review findings as one correction without adding production dependencies or reverting unrelated work:

1. accepted external values are normalized into cloned, deeply frozen SourceRecords;
2. SourceRecord top-level and `source` objects reject unknown fields, including polarity, confidence, and authority outside extensions;
3. promotion consumes one or more SourceRecords, requires rationale and non-empty policy identity, and preserves every provenance entry;
4. composed ingestion returns successful ingestion plus a discriminated promotion success or structured failure;
5. SDK and CLI limits cover input bytes, record count, and record bytes with stable `INGESTION_LIMIT_EXCEEDED`;
6. file size is checked before reading, stdin is read incrementally, and top-level CLI failures use one structured JSON diagnostic;
7. `IngestionItemResult` is a discriminated union and changed content under a new revision is positively covered;
8. affected Markdown and examples use the corrected API and semantics, including the Phase 4 team-memory wording.

`package.json` and `package-lock.json` are unchanged. The package still has no production dependencies.

## Baseline

Command:

```text
npm test
```

Result at the requested base:

```text
tests 123
pass 123
fail 0
```

## RED → GREEN Evidence

### SourceRecord, Ingestion Normalization, Union, Revision, and SDK Limits

Tests were changed before production source:

```text
node --disable-warning=ExperimentalWarning --test tests/source-records.test.ts tests/ingestion.test.ts
npx tsc --noEmit
```

RED result:

```text
tests 23
pass 19
fail 4
TypeScript: exit 1
```

The four runtime failures proved:

- ingestion retained the caller-owned mutable object;
- changed content under a new revision was accepted without normalization;
- SDK limits were ignored;
- unknown top-level/source fields were accepted.

TypeScript separately failed because `IngestionItemResult` was not a discriminated union and the new limit options/error code did not exist.

After the minimal contract and ingestion changes, plus narrowing existing union consumers:

```text
tests 23
pass 23
fail 0
TypeScript: exit 0
```

### Multi-Source Promotion and Observable Composition Failure

Tests were replaced with the one-or-more-record request contract before promotion source changed:

```text
node --disable-warning=ExperimentalWarning --test tests/promotion.test.ts
npx tsc --noEmit
```

RED result:

```text
tests 9
pass 1
fail 8
TypeScript: exit 1
```

The failures proved:

- policies received one record instead of a frozen record array;
- multi-source neutral mapping and complete provenance did not exist;
- empty records/rationale and blank policy identity were not validated;
- composed output had no discriminated `promotion` result;
- an ordinary policy exception escaped after successful ingestion.

After the promotion correction:

```text
tests 9
pass 9
fail 0
```

The private API was cleanly renamed from `promoteSourceRecordToEvidence` to `promoteSourceRecordsToEvidence`.

### CLI Limits, Rationale, Structured Errors, and Incremental Stdin

CLI tests were changed before CLI source:

```text
node --disable-warning=ExperimentalWarning --test tests/cli.test.ts
```

RED result:

```text
tests 14
pass 3
fail 11
```

The failures proved:

- `--rationale` and all three limit flags were rejected as unknown;
- promotion still attempted one Evidence per record;
- composed output used the stale shape;
- top-level failures emitted plain text rather than JSON;
- file, record-count, record-size, and stdin limits were absent.

After the CLI correction and promotion API rename:

```text
node --disable-warning=ExperimentalWarning --test tests/promotion.test.ts tests/cli.test.ts

tests 23
pass 23
fail 0
```

Final affected-surface focus:

```text
node --disable-warning=ExperimentalWarning --test tests/source-records.test.ts tests/ingestion.test.ts tests/promotion.test.ts tests/cli.test.ts tests/conformance.test.ts
npx tsc --noEmit

tests 51
pass 51
fail 0
TypeScript: exit 0
```

## Implementation Summary

### SourceRecord and Ingestion

- Closed the documented top-level and `source` field sets.
- Kept interpretation metadata legal only inside `extensions`.
- Added internal `normalizeSourceRecord` validation, structured cloning, and deep freezing.
- Normalized valid incoming and seeded existing records before retaining them.
- Replaced optional-field item results with accepted/duplicate/rejected union members.
- Added configurable `maxInputBytes`, `maxRecords`, and `maxRecordBytes`.
- Added `INGESTION_LIMIT_EXCEEDED` with `{ limit, maximum, actual }`.
- Added positive acceptance coverage for changed content under a new revision.

### Promotion and Composition

- Changed requests from `record` to non-empty `records`.
- Changed policy mapping from `map(record)` to `map(records)`.
- Required a non-empty rationale and non-empty policy ID/version.
- Created one Evidence object for the complete contributing record set.
- Preserved one provenance reference and one revision key per record.
- Stored rationale and policy identity in the promotion extension.
- Returned `{ ingestion, promotion }`, where promotion is `succeeded` or `failed`.
- Preserved underlying `DomainError` codes and used `PROMOTION_FAILED` for ordinary policy exceptions.

### CLI and Examples

- Added `--rationale`.
- Added `--max-input-bytes`, `--max-records`, and `--max-record-bytes`.
- Set defaults to `10485760`, `10000`, and `1048576`.
- Checked file metadata before reading.
- Replaced unbounded `readFileSync(0)` with incremental stdin chunk reading.
- Standardized pre-output failure diagnostics as one JSON object containing `code`, `message`, `details`, and `stage`.
- Kept collect-all item failures as item diagnostics.
- Changed `promote` to emit one Evidence object preserving all accepted unique records.
- Changed `ingest-promote` to serialize the explicit promotion result.
- Updated the team-memory example to aggregate its bounded non-empty SourceRecord set into one Evidence object with rationale.

### Documentation

All nine tracked Markdown files were audited. Current documentation now covers closed fields, normalization, limits, multi-source promotion, rationale, composed failures, structured CLI errors, and exact CLI defaults.

Phase 2 and RFC 0001 were reaffirmed as implemented/final-review verified only after the first full post-fix suite passed `133/133`.

The stale core-design Phase 4 statement now says to maintain and package the already-migrated team-memory connector rather than migrate it again.

## Final Verification

Fresh final commands:

```text
npm test
npx tsc --noEmit
npm run check
npm run example
git diff --check
```

Results:

```text
npm test: 133 tests, 133 pass, 0 fail
npx tsc --noEmit: exit 0, 0 diagnostic bytes
npm run check: exit 0
npm run example: exit 0, 11 successful events
git diff --check: exit 0, 0 output bytes
```

## Bounded Live Team-Memory Flow

Source ledger:

```text
~/Workspace/local-agent-team/team-memory-agent/ledger.db
```

Flow:

1. captured ledger size and `mtimeMs`;
2. exported at most five SourceRecords with `teammem:export --limit 5`;
3. validated every record through generic `cc validate`;
4. promoted the complete record set through `cc promote` with explicit rationale;
5. parsed and asserted every output line and all provenance links;
6. asserted all three stderr files were empty;
7. compared ledger metadata and removed temporary scratch data.

Results:

```text
SourceRecords exported: 5
validation item lines: 5
accepted validation items: 5
Evidence objects: 1
Evidence provenance entries: 5
total parsed output lines: 11
export stderr bytes: 0
validate stderr bytes: 0
promote stderr bytes: 0
scratch cleaned: true
```

Every SourceRecord had schema version `0.1.0` and source system `team-memory-agent`. The Evidence object was `collected`, neutral, linked to all five SourceRecords, and carried policy `{ id: "neutral-evidence", version: "1" }` plus the explicit rationale.

Ledger metadata:

```text
before: size=20987904, mtimeMs=1784905588881.021
after:  size=20987904, mtimeMs=1784905588881.021
unchanged: true
```

## Concerns and Boundaries

No blocking final-review concern remains.

Intentional boundaries:

1. The promotion API and composed result shape are private breaking changes.
2. Duplicate/collision state remains in-memory; persistent or distributed deduplication is deferred.
3. SDK text ingestion receives an already-materialized string; only CLI stdin is incrementally bounded.
4. The Git connector remains a fixture mapper rather than a repository reader.
5. `node:sqlite` remains experimental in Node.js 24.
6. This is verified private reference source, not a stable published package or production service.

# Second Consolidated Review-Fix Wave

**Date:** 2026-07-24
**Starting commit:** `3e9dbb219a838e2f91d0aed929feee2e8074dcfb`
**Original requested base:** `9015b18b2e1da7f311887ea82a40fcca58cf76ab`

The second wave hardened extension governance, direct promotion identity, mutable policy boundaries, pre-parse limits, secret-safe diagnostics, team-memory privacy, and transition authorization. Production dependencies remain unchanged.

## Baseline

Command:

```text
npm test
```

Result before second-wave test changes:

```text
tests 133
pass 133
fail 0
```

## RED → GREEN Evidence

### Namespaced Extensions, Neutral Context, and Opaque `contentHash`

Tests changed before production source:

```text
node --disable-warning=ExperimentalWarning --test tests/source-records.test.ts tests/conformance.test.ts
```

RED:

```text
tests 18
pass 16
fail 2
```

The failures proved that unnamespaced extension keys were accepted and that `polarity`, `confidence`, and `authority` could be placed directly in `context`. The conformance assertion that implied SHA-256 digest verification was removed, and positive coverage now accepts a deliberately non-digest `contentHash` as opaque caller metadata.

GREEN:

```text
tests 18
pass 18
fail 0
```

Every extension key now contains `:` or `.` with non-empty segments. Interpretation keys are rejected in `context`, while raw source `content` may preserve fields with those names.

### Direct Promotion Classification, Canonical Identity, and Immutable Snapshots

Tests changed before promotion source:

```text
node --disable-warning=ExperimentalWarning --test tests/promotion.test.ts
```

RED:

```text
tests 12
pass 8
fail 4
```

The failures proved:

- direct promotion mapped duplicate records instead of accepted unique records;
- same-key/different-content records were not rejected before mapping;
- Evidence IDs omitted rationale, attribution, timestamp, and mapping output;
- mutable request and policy objects were reread after `map`;
- arbitrary policy exception messages escaped the public boundary.

GREEN:

```text
tests 12
pass 12
fail 0
```

Direct promotion now uses fail-fast ingestion classification, snapshots and freezes the complete validated request and policy identity before mapping, and hashes canonical JSON for the full validated payload with built-in SHA-256. Mapping output is closed, validated, copied, and frozen. Arbitrary policy exceptions become `PROMOTION_FAILED` with the stable message `Promotion policy failed.`

### Pre-Parse Limits, Incremental Readers, and Secret-Safe Diagnostics

Tests changed before ingestion and CLI source:

```text
node --disable-warning=ExperimentalWarning --test tests/ingestion.test.ts tests/cli.test.ts
```

RED:

```text
tests 30
pass 26
fail 4
```

The failures proved:

- oversized malformed records reached SourceRecord validation before `maxRecordBytes`;
- oversized malformed JSONL lines reached `JSON.parse` before `maxRecordBytes`;
- parser exception text containing `LEAK42` appeared in public item output;
- CLI input diagnostics exposed a distinctive path secret.

GREEN:

```text
tests 30
pass 30
fail 0
```

Record bytes are measured before normalization or cloning. JSONL line bytes are checked before parsing. File and stdin input share one incremental bounded stream reader. Parser causes, input paths, and unknown top-level exception messages are not included in public diagnostics.

### Team-Memory Raw Privacy and Structured CLI Errors

Tests changed before connector and team-memory CLI source:

```text
node --disable-warning=ExperimentalWarning --test tests/team-memory.test.ts
```

RED:

```text
tests 16
pass 11
fail 5
```

The failures proved that raw ledger content was emitted by default, no opt-in existed, team-memory errors were plain text, and a non-domain database error exposed its caller-supplied path.

GREEN:

```text
tests 16
pass 16
fail 0
```

`teamMemoryEventToSourceRecord` omits `row.raw` unless `{ includeRaw: true }` is supplied. `teammem:export` adds `--include-raw`. Every failure is one nested diagnostic:

```json
{"stage":"read","error":{"code":"TEAM_MEMORY_READ_FAILED","message":"Unable to read team-memory events.","details":{}}}
```

### Immutable Transition Context and Exact Authorization Decisions

Tests changed before authorization and transition source:

```text
node --disable-warning=ExperimentalWarning --test tests/transitions.test.ts
```

RED:

```text
tests 49
pass 46
fail 3
```

The failures proved that injected policies received the mutable caller context, could mutate transition attribution, and could return unknown or extra-field statuses that fell through as authorization.

GREEN:

```text
tests 49
pass 49
fail 0
```

`transitionObject` now creates a cloned, validated, deeply frozen context snapshot before policy invocation. Policy throws and mutation attempts fail closed with `AUTHORIZATION_DENIED` and `Authorization policy failed.` Exact closed `allowed`, `denied`, and `confirmation_required` decisions are validated at runtime; only `allowed` proceeds.

### Typed Surface Correction

The first post-behavior typecheck correctly found five diagnostics:

```text
npx tsc --noEmit
exit 1
diagnostics 5
```

They traced to the new connector option colliding with `Array.map`'s index callback and runtime-validated interfaces lacking TypeScript `JsonObject` index signatures. The example now uses an explicit mapper callback, and validated values are reconstructed as concrete JSON snapshots.

GREEN:

```text
npx tsc --noEmit
exit 0
diagnostics 0
```

## Consolidated Focused Verification

Command:

```text
node --disable-warning=ExperimentalWarning --test tests/source-records.test.ts tests/ingestion.test.ts tests/promotion.test.ts tests/cli.test.ts tests/team-memory.test.ts tests/transitions.test.ts tests/conformance.test.ts
```

Result:

```text
tests 125
pass 125
fail 0
```

## Final Verification

Fresh required commands:

```text
npm test
npx tsc --noEmit
npm run check
npm run example
git diff --check
```

Results:

```text
npm test: 147 tests, 147 pass, 0 fail
npx tsc --noEmit: exit 0, 0 diagnostics
npm run check: exit 0
npm run example: exit 0, 11 successful events
git diff --check: exit 0, 0 output bytes
```

Phase 2 and RFC 0001 remain marked Implemented only after this full second-wave verification passed. `package.json` and `package-lock.json` remain unchanged, with no production dependencies added.

## Bounded Live Team-Memory Flow

Source ledger:

```text
~/Workspace/local-agent-team/team-memory-agent/ledger.db
```

The flow exported at most five records without `--include-raw`, validated them through the generic CLI, promoted the complete accepted set, parsed every output line, asserted empty stderr, compared exact ledger metadata, and removed all scratch files.

Results:

```text
SourceRecords exported: 5
raw fields exported: 0
validation item lines: 5
accepted validation items: 5
Evidence objects: 1
Evidence ID: evidence:promotion:sha256:cbcc22487e0c5f7711f13e48b6ce56e1f6f34d9d3fadc39962877c37bcadb46c
Evidence provenance entries: 5
policy: { id: "neutral-evidence", version: "1" }
export stderr bytes: 0
validate stderr bytes: 0
promote stderr bytes: 0
scratch cleaned: true
```

Ledger metadata:

```text
before: size=20987904, mtimeMs=1784905588881.021
after:  size=20987904, mtimeMs=1784905588881.021
unchanged: true
```

## Second-Wave Concerns and Boundaries

No blocking concern remains.

Intentional boundaries:

1. `contentHash` is preserved but never verified by this SDK; callers needing integrity guarantees must verify it externally.
2. The team-memory reader must retrieve the raw column to support explicit opt-in, but default SourceRecord mapping and CLI export omit it.
3. SDK text ingestion receives an already-materialized string; bounded incremental I/O is enforced by the CLI reader.
4. Duplicate/collision state remains in-memory, and collision content identity remains media type plus source content.
5. Evidence IDs use Node's built-in SHA-256 implementation and are deterministic only for the complete validated payload.
6. `node:sqlite` remains experimental in Node.js 24.
7. This remains verified private reference source, not a stable published package or production service.

# Third Consolidated Merge-Gate Fix Wave

**Date:** 2026-07-24
**Commit target:** `fix: close adversarial ingestion edge cases`

## Third-Wave Scope

This wave closes the final three adversarial merge-gate findings without adding production dependencies or reverting unrelated work:

1. Unknown SDK inputs receive a bounded descriptor-based structural preflight before normalization or cloning. The preflight never invokes accessors or `toJSON`, rejects cycles, `BigInt`, functions, symbols, `undefined`, non-finite numbers, sparse or decorated arrays, custom prototypes, and other non-JSON shapes, and converts unsafe values into item-level rejections in collect-all mode.
2. `maxRecordBytes` is enforced during that preflight, then the normalized plain deeply frozen SourceRecord is measured exactly again as defense in depth.
3. Promotion snapshots and freezes request fields, attribution, rationale, and contributing records before reading any policy property. Policy ID, version, and mapper are captured once inside a stable secret-safe failure boundary.
4. The mapper is invoked with a frozen captured receiver containing the captured ID and version. Methods using `this.id` or `this.version` therefore retain receiver semantics without rereading mutable policy identity.

## Third-Wave Baseline

The wave started from the clean second-wave commit:

```text
37fde1441a7e1b9256f6dd3e01692d6a20b55faf
fix: harden universal ingestion boundaries
```

Baseline verification:

```text
npm test
tests 147
pass 147
fail 0
```

## Third-Wave RED → GREEN Evidence

### Safe Structural Preflight and Collect-All Continuation

Tests were added before changing ingestion production code:

```text
node --disable-warning=ExperimentalWarning --test tests/ingestion.test.ts
```

The new cases cover:

- circular source content;
- `BigInt` source content;
- a throwing accessor whose message contains a distinctive secret;
- throwing and mutating `toJSON` hooks;
- zero accessor and `toJSON` invocations;
- secret-free item diagnostics;
- continuation to a later valid record in collect-all mode.

RED:

```text
tests 16
pass 14
fail 2
```

Both new tests failed because the old `JSON.stringify` size probe executed or encountered caller-controlled behavior before the collector’s item-level rejection boundary and surfaced a top-level `SERIALIZATION_ERROR`.

GREEN:

```text
tests 16
pass 16
fail 0
```

The replacement uses an iterative stack and own-property descriptors rather than property reads or serialization hooks. It counts the exact UTF-8 JSON representation, stops as soon as the configured record limit is exceeded, and reports unsafe structures as stable `INVALID_SOURCE_RECORD` item failures. Accepted values still pass through normalization into isolated deeply frozen SourceRecords, followed by a second exact measurement.

### Policy Accessor Capture and Receiver Semantics

Tests were added before changing promotion production code:

```text
node --disable-warning=ExperimentalWarning --test tests/promotion.test.ts
```

The new cases cover:

- a policy accessor that mutates every mutable request field before mapping;
- throwing `id`, `version`, and `map` accessors with distinctive secrets;
- one read only for each captured policy property;
- a method-style mapper that reads `this.id` and `this.version`;
- mutation of the original policy after capture without identity drift.

RED:

```text
tests 15
pass 12
fail 3
```

The failures proved that policy access happened before request snapshotting, accessor exceptions escaped unsanitized, and the detached mapper lost its receiver so `this.id` and `this.version` were unavailable.

GREEN:

```text
tests 15
pass 15
fail 0
```

Promotion now snapshots the request first. It then captures `id`, `version`, and `map` once inside the fail-closed policy boundary, validates the captured values, and freezes a receiver containing only those captured values. Mapping exceptions and accessor exceptions both become `PROMOTION_FAILED` with `Promotion policy failed.` and empty details.

### Typed Mapper Capture

The first post-runtime typecheck correctly caught that TypeScript narrowed the unknown mapper only to the broad `Function` type:

```text
npx tsc --noEmit
exit 1
diagnostics 1
TS2322: receiver.map Function was not assignable to EvidencePromotionPolicy.map
```

A dedicated mapper type guard now preserves the exact public method signature.

GREEN:

```text
npx tsc --noEmit
exit 0
diagnostics 0
```

## Third-Wave Focused Verification

Fresh command against the final code state:

```text
node --disable-warning=ExperimentalWarning --test tests/ingestion.test.ts tests/promotion.test.ts
```

Result:

```text
tests 31
pass 31
fail 0
```

## Third-Wave Final Verification

Fresh required commands against the final code state:

```text
npm test
npx tsc --noEmit
npm run check
npm run example
git diff --check
```

Results:

```text
npm test: 152 tests, 152 pass, 0 fail
npx tsc --noEmit: exit 0, 0 diagnostics
npm run check: exit 0
npm run example: exit 0, 11 successful events
git diff --check: exit 0, 0 output bytes
```

`package.json` and `package-lock.json` remain unchanged. No production dependency was added.

## Third-Wave Concerns and Boundaries

No blocking concern remains.

Intentional boundaries:

1. The structural preflight guarantees that ordinary JavaScript property accessors and serialization hooks are not invoked. JavaScript reflection over a caller-supplied `Proxy` can still execute proxy traps; any trap exception is caught and converted to a stable secret-safe item rejection.
2. SDK object ingestion uses the caller-configured `maxRecordBytes`; the generic CLI continues to supply the finite `1048576` byte default.
3. The captured policy receiver intentionally contains only immutable `id`, `version`, and `map`. Policy methods that depend on other mutable receiver state are outside the promotion policy contract.
4. This remains verified private reference source, not a stable published package or production service.

# Fourth TOCTOU Review-Fix Wave

**Date:** 2026-07-24
**Commit target:** `fix: snapshot adversarial inputs once`

## Fourth-Wave Scope

This wave closes the final two time-of-check/time-of-use findings without adding production dependencies or reverting unrelated work:

1. Ingestion preflight now builds and returns the bounded plain JSON snapshot from captured own data-property descriptors. Normalization, duplicate/collision classification, and retained output use only that snapshot and never reread the original unknown value.
2. Stateful Proxy mutation after descriptor capture cannot replace the bounded content, bypass `maxRecordBytes`, execute a property getter, or abort a collect-all batch.
3. Proxy `ownKeys` and `getOwnPropertyDescriptor` failures become stable secret-safe `INVALID_SOURCE_RECORD` item rejections, and later valid items continue.
4. Promotion invokes the mapper and captures its output exactly once inside one sanitized boundary. It uses one `ownKeys` result and one own descriptor per mapping field, rejects accessors, unknown fields, and malformed fields, and builds a plain frozen mapping snapshot.
5. Evidence validation, identity hashing, and object construction use only the mapping snapshot; later mutation or failure in the original mapping object cannot change or escape into the result.

## Fourth-Wave Baseline

The wave started from the clean third-wave commit:

```text
9f08ab1158e636575c524143df37bd9a0fb4f017
fix: close adversarial ingestion edge cases
```

Baseline verification:

```text
npm test
tests 152
pass 152
fail 0
```

## Fourth-Wave RED → GREEN Evidence

### Descriptor-Built Ingestion Snapshot

Tests were added before changing ingestion production code:

```text
node --disable-warning=ExperimentalWarning --test tests/ingestion.test.ts
```

The new cases cover:

- a stateful Proxy returning bounded content from its first `content` descriptor and mutating its target to oversized content immediately afterward;
- a throwing property-read trap that proves normalization never accesses the original Proxy;
- exact one-time descriptor capture;
- `maxRecordBytes` enforcement against the captured snapshot rather than mutable later state;
- secret-throwing `ownKeys` and `getOwnPropertyDescriptor` traps;
- item-level rejection and continuation to a later valid record in collect-all mode;
- secret-free diagnostics and output.

RED:

```text
tests 18
pass 17
fail 1
```

The stateful Proxy test failed because the old preflight measured descriptor values but discarded them. `normalizeSourceRecord` then reread the original Proxy, invoked caller-controlled behavior, and escaped the collect-all batch.

GREEN:

```text
tests 18
pass 18
fail 0
```

The bounded preflight now uses an iterative depth-first frame stack. It captures one key list and each own data descriptor into an isolated plain JSON snapshot while counting the exact UTF-8 JSON representation. Child values are captured before the next sibling descriptor is requested. The collector normalizes only that snapshot and performs the defense-in-depth normalized-size check on the resulting immutable record.

### Single-Capture Policy Mapping Output

Tests were added before changing promotion production code:

```text
node --disable-warning=ExperimentalWarning --test tests/promotion.test.ts
```

The new cases cover:

- a stateful Proxy mapping that throws if keys or descriptors are requested twice;
- mutation of the original mapping immediately after the final descriptor is returned;
- property-read traps that must remain uncalled;
- secret-throwing mapping `ownKeys` and `getOwnPropertyDescriptor` traps;
- unknown mapping fields;
- an accessor mapping field that must be rejected without invocation;
- preservation of the first captured title, statement, evidence kind, and polarity.

RED:

```text
tests 18
pass 15
fail 3
```

The failures proved that the previous path repeatedly reflected over the mapping during JSON validation, returned the wrong error class for Proxy reflection failures, and collapsed accessor-specific rejection into a generic mapping error.

GREEN:

```text
tests 18
pass 18
fail 0
```

Mapper invocation, prototype inspection, one `ownKeys` capture, one descriptor capture per field, shape checks, and snapshot construction now share one sanitized policy boundary. Arbitrary exceptions become `PROMOTION_FAILED` with `Promotion policy failed.` and empty details. Closed-field, accessor, and value-shape violations retain stable `INVALID_OBJECT` field diagnostics. All downstream work uses the frozen plain snapshot.

### Typed Mapping Snapshot

The first post-runtime typecheck correctly found that TypeScript did not retain string narrowing through dynamic captured-field indexing:

```text
npx tsc --noEmit
exit 1
diagnostics 1
TS2322: captured mapping title remained unknown
```

Direct checks now bind and narrow the three captured string fields before constructing the typed frozen mapping.

GREEN:

```text
npx tsc --noEmit
exit 0
diagnostics 0
```

## Fourth-Wave Focused Verification

Fresh command against the final code state:

```text
node --disable-warning=ExperimentalWarning --test tests/ingestion.test.ts tests/promotion.test.ts
```

Result:

```text
tests 36
pass 36
fail 0
```

## Fourth-Wave Final Verification

Fresh required commands against the final code state:

```text
npm test
npx tsc --noEmit
npm run check
npm run example
git diff --check
```

Results:

```text
npm test: 157 tests, 157 pass, 0 fail
npx tsc --noEmit: exit 0, 0 diagnostics
npm run check: exit 0
npm run example: exit 0, 11 successful events
git diff --check: exit 0, 0 output bytes
```

`package.json` and `package-lock.json` remain unchanged. No production dependency was added.

## Fourth-Wave Concerns and Boundaries

No blocking concern remains.

Intentional boundaries:

1. JavaScript Proxy traps necessarily execute when a caller chooses to expose an object through reflection. The SDK invokes each required key/descriptor operation once, sanitizes every thrown value, and treats the resulting plain snapshot as authoritative.
2. SDK object ingestion uses the caller-configured `maxRecordBytes`; the generic CLI continues to supply the finite `1048576` byte default.
3. Promotion mapping remains an exact closed four-field data contract. Accessor-backed, symbol-keyed, non-enumerable, inherited, or extra mapping state is rejected rather than copied.
4. This remains verified private reference source, not a stable published package or production service.
