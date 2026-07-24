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
/Users/cx/Workspace/local-agent-team/team-memory-agent/ledger.db
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
