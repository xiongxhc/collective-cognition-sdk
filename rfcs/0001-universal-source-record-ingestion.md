# RFC 0001: Universal Source-Record Ingestion

**Status:** Implemented

**Created:** 2026-07-24  
**Decision owner:** Project maintainer

## Problem

The Phase 1 reference implementation mapped team-memory SQLite rows directly into `Evidence` and exported the adapter from the root module. This proved real-source compatibility but made a team-specific schema and semantic conversion look like universal SDK behavior.

The SDK needs an ingestion contract that works across organizations and source systems without requiring custom code for basic use or treating collected material as evidence automatically.

## Proposed Semantics

1. The universal ingestion boundary MUST accept a versioned, source-neutral `SourceRecord`.
2. Ingestion MUST preserve source identity, source revision identity, timestamps, media type, caller-authorized content or an integrity-bound reference, and available integrity metadata.
3. A `SourceRecord` MUST NOT assign evidence polarity, truth, confidence, decision status, or authority.
4. The tuple `(source.system, source.instance, sourceId, revisionId)` MUST be the logical source-revision key.
5. The same key and canonical content MUST classify as a duplicate; the same key with different canonical content MUST fail as a collision.
6. Changed source content MUST use a new revision identity and preserve history rather than silently overwrite a prior immutable record.
7. Conversion from source records into cognitive objects MUST be an explicit promotion operation.
8. Promotion MUST identify its source records, accountable attribution, context, rationale, and named policy version.
9. The initial promotion target MUST be `Evidence`; additional targets require accepted semantics.
10. A composed ingest-and-promote operation MAY exist, but it MUST expose both artifacts and both operation results.
11. Connectors MUST emit canonical source records and MUST NOT bypass core validation.
12. Canonical JSON and JSONL ingestion MUST be available without connector code.
13. Source-specific connectors MUST NOT define the root SDK API.

The proposed record shape and complete rationale are in the [universal ingestion design](../docs/superpowers/specs/2026-07-24-universal-ingestion-design.md).

## Alternatives

### Map Every Source Directly to Evidence

Rejected as the root architecture because collection and cognitive interpretation have different provenance, policy, and accountability requirements.

### Require a Custom Adapter for Every Team

Rejected as the minimum adoption path because canonical JSON/JSONL can cover simple integrations without source-specific SDK code.

### Permit Immediate Promotion Without a Source Record

Rejected for ingestion because it loses a stable neutral boundary. Trusted callers with already-complete cognitive objects may use the core object API directly.

## Compatibility and Migration

- The cognitive-object TypeScript API remains runnable.
- Team-memory-specific root exports and direct row-to-Evidence mapping were removed before any stable compatibility promise.
- The team-memory reader emits source records; neutral Evidence creation is an explicit promotion operation.
- `teammem:export` emits SourceRecord JSONL and no longer accepts hypothesis or context mapping arguments.
- Existing callers migrate by validating or ingesting the exported records, then invoking `promote` or `ingest-promote` with explicit policy, attribution, hypothesis, context, and promotion time arguments.
- Existing cognitive objects remain valid because this RFC changes the ingestion path, not their stored shape.

## Security and Human Authority

- Ingestion does not establish consent, truth, acceptance, or authority.
- Connectors use explicit configuration and least-privilege source access.
- Diagnostics must not print source secrets by default.
- Promotion uses the existing attribution and authorization boundaries.
- Automated promotion cannot satisfy human-confirmation requirements for consequential lifecycle transitions.

## Acceptance Checks

- [x] Validate canonical valid and invalid `SourceRecord` fixtures.
- [x] Demonstrate SDK and CLI parity for JSON and JSONL.
- [x] Demonstrate deterministic duplicate and collision classification.
- [x] Demonstrate preservation of changed source revisions without overwrite.
- [x] Promote source records into evidence while preserving source and policy links.
- [x] Report valid ingestion separately from failed promotion.
- [x] Convert the team-memory integration into a conformant connector.
- [x] Pass the same validation boundary with a source-independent canonical fixture corpus.
- [x] Verify that the root export surface contains no source-specific connector API.
- [x] Verify that every repository Markdown file is current or explicitly historical.

Implementation evidence:

- canonical fixtures: [`spec/fixtures/source-records/`](../spec/fixtures/source-records/);
- conformance suite: [`tests/conformance.test.ts`](../tests/conformance.test.ts);
- generic CLI: [`src/cli.ts`](../src/cli.ts);
- migrated connector: [`src/adapters/team-memory.ts`](../src/adapters/team-memory.ts);
- completion commands: `npm test`, `npx tsc --noEmit`, `npm run check`, and `npm run example`;
- bounded live verification: team-memory SourceRecord export, generic validation, explicit `neutral-evidence-v1` promotion, complete JSON-line parsing, and unchanged source-ledger metadata.

## Explicit Deferrals

- Persistent storage and distributed deduplication.
- Hosted ingestion endpoints.
- Automatic semantic classification.
- Connector marketplace and third-party trust program.
- Cross-language implementation claims.
- Team-memory-agent LaunchAgent or team-vault integration.
