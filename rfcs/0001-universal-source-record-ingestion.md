# RFC 0001: Universal Source-Record Ingestion

**Status:** Implemented and final-review verified

**Created:** 2026-07-24  
**Decision owner:** Project maintainer

## Problem

The Phase 1 reference implementation mapped team-memory SQLite rows directly into `Evidence` and exported the adapter from the root module. This proved real-source compatibility but made a team-specific schema and semantic conversion look like universal SDK behavior.

The SDK needs an ingestion contract that works across organizations and source systems without requiring custom code for basic use or treating collected material as evidence automatically.

## Proposed Semantics

1. The universal ingestion boundary MUST accept a versioned, source-neutral `SourceRecord`.
2. Ingestion MUST preserve source identity, source revision identity, timestamps, media type, caller-authorized content or an integrity-bound reference, and available integrity metadata in a cloned, deeply frozen accepted record.
3. A `SourceRecord` MUST reject unknown top-level and `source` fields. It MUST NOT assign evidence polarity, truth, confidence, decision status, or authority outside namespaced `extensions`.
4. The tuple `(source.system, source.instance, sourceId, revisionId)` MUST be the logical source-revision key.
5. The same key and canonical content MUST classify as a duplicate; the same key with different canonical content MUST fail as a collision.
6. Changed source content MUST use a new revision identity and preserve history rather than silently overwrite a prior immutable record.
7. Conversion from source records into cognitive objects MUST be an explicit promotion operation.
8. Promotion MUST accept one or more source records, require a non-empty rationale and non-empty policy ID/version, and preserve provenance for every contributing record.
9. The initial promotion target MUST be `Evidence`; additional targets require accepted semantics.
10. A composed ingest-and-promote operation MAY exist, but after successful ingestion it MUST return that ingestion result plus a discriminated promotion success or structured failure rather than throw a promotion error.
11. Connectors MUST emit canonical source records and MUST NOT bypass core validation.
12. Canonical JSON and JSONL ingestion MUST be available without connector code.
13. Source-specific connectors MUST NOT define the root SDK API.
14. SDK callers MUST be able to configure maximum input bytes, records, and serialized record bytes. The CLI MUST use finite defaults and enforce file size before reading and stdin size incrementally.
15. A limit breach MUST use `INGESTION_LIMIT_EXCEEDED`.
16. Every top-level CLI error MUST be one JSON stderr diagnostic with stable `code`, `message`, `details`, and `stage`; pre-output failures MUST write zero stdout.

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
- Existing callers migrate by validating or ingesting the exported records, then invoking `promote` or `ingest-promote` with explicit policy, attribution, hypothesis, context, rationale, and promotion time arguments. One promotion consumes the complete non-empty accepted record set and produces one Evidence object.
- Existing cognitive objects remain valid because this RFC changes the ingestion path, not their stored shape.

## Security and Human Authority

- Ingestion does not establish consent, truth, acceptance, or authority.
- Connectors use explicit configuration and least-privilege source access.
- Diagnostics must not print source secrets by default.
- CLI input uses finite defaults of `10485760` input bytes, `10000` records, and `1048576` bytes per record unless the caller supplies stricter positive safe-integer flags.
- Promotion uses the existing attribution and authorization boundaries.
- Automated promotion cannot satisfy human-confirmation requirements for consequential lifecycle transitions.

## Acceptance Checks

- [x] Validate canonical valid and invalid `SourceRecord` fixtures.
- [x] Demonstrate SDK and CLI parity for JSON and JSONL.
- [x] Demonstrate deterministic duplicate and collision classification.
- [x] Demonstrate preservation of changed source revisions without overwrite.
- [x] Reject unknown top-level and source fields while permitting namespaced extensions.
- [x] Normalize accepted external values into isolated deeply frozen SourceRecords.
- [x] Promote one or more source records into one Evidence object while preserving every source, policy, and rationale link.
- [x] Reject empty source sets, rationales, and policy identities.
- [x] Report valid ingestion separately from a structured failed promotion without throwing after ingestion.
- [x] Enforce configurable SDK and finite CLI limits for input bytes, record count, and per-record bytes.
- [x] Enforce file-size preflight, incremental stdin limits, stable limit codes, and structured top-level CLI errors.
- [x] Convert the team-memory integration into a conformant connector.
- [x] Pass the same SourceRecord conformance contract with a second source-specific fixture connector.
- [x] Verify that the root export surface contains no source-specific connector API.
- [x] Verify that every repository Markdown file is current or explicitly historical.

Implementation evidence:

- canonical fixtures: [`spec/fixtures/source-records/`](../spec/fixtures/source-records/);
- conformance suite: [`tests/conformance.test.ts`](../tests/conformance.test.ts);
- generic CLI: [`src/cli.ts`](../src/cli.ts);
- migrated connector: [`src/adapters/team-memory.ts`](../src/adapters/team-memory.ts);
- second fixture connector: [`src/adapters/git-commit.ts`](../src/adapters/git-commit.ts);
- completion commands: `npm test`, `npx tsc --noEmit`, `npm run check`, and `npm run example`;
- bounded live verification: team-memory SourceRecord export, generic validation, explicit `neutral-evidence-v1` promotion, complete JSON-line parsing, and unchanged source-ledger metadata.

## Explicit Deferrals

- Persistent storage and distributed deduplication.
- Hosted ingestion endpoints.
- Automatic semantic classification.
- Connector marketplace and third-party trust program.
- Cross-language implementation claims.
- Team-memory-agent LaunchAgent or team-vault integration.
