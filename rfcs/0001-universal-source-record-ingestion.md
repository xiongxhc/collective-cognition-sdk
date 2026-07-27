# RFC 0001: Universal Source-Record Ingestion

**Status:** Implemented and final-review verified

**Created:** 2026-07-24  
**Decision owner:** Project maintainer

## Problem

The Phase 1 reference implementation mapped team-memory SQLite rows directly into `Evidence` and exported the adapter from the root module. This proved real-source compatibility but made a team-specific schema and semantic conversion look like universal SDK behavior.

The SDK needs an ingestion contract that works across organizations and source systems without requiring custom code for basic use or treating collected material as evidence automatically.

## Proposed Semantics

1. The universal ingestion boundary MUST accept a versioned, source-neutral `SourceRecord`.
2. Ingestion MUST preserve source identity, source revision identity, timestamps, media type, caller-authorized content or a caller-designated reference, and available integrity metadata in a cloned, deeply frozen accepted record.
3. A `SourceRecord` MUST reject unknown top-level and `source` fields. Every extension key MUST contain `:` or `.` with non-empty namespace and local-name sides. Direct `context` keys named `polarity`, `confidence`, or `authority` MUST be rejected; raw source `content` MAY preserve fields with those names.
4. The tuple `(source.system, source.instance, sourceId, revisionId)` MUST be the logical source-revision key.
5. The same key and canonical content MUST classify as a duplicate; the same key with different canonical content MUST fail as a collision.
6. Changed source content MUST use a new revision identity and preserve history rather than silently overwrite a prior immutable record.
7. Conversion from source records into cognitive objects MUST be an explicit promotion operation.
8. Promotion MUST accept one or more source records, run them through duplicate/collision classification, map only accepted unique immutable records, require a non-empty rationale and non-empty policy ID/version, and preserve provenance for every contributing record.
9. The initial promotion target MUST be `Evidence`; additional targets require accepted semantics.
10. A composed ingest-and-promote operation MAY exist, but after successful ingestion it MUST return that ingestion result plus a discriminated promotion success or structured failure rather than throw a promotion error.
11. Connectors MUST emit canonical source records and MUST NOT bypass core validation.
12. Canonical JSON and JSONL ingestion MUST be available without connector code.
13. Source-specific connectors MUST NOT define the root SDK API.
14. SDK callers MUST be able to configure maximum input bytes, records, and serialized record bytes. The CLI MUST use finite defaults and incrementally bound both file and stdin input.
15. A limit breach MUST use `INGESTION_LIMIT_EXCEEDED`.
16. Every top-level CLI error MUST be one JSON stderr diagnostic with stable `code`, `message`, `details`, and `stage`; pre-output failures MUST write zero stdout.
17. Unknown SDK values MUST pass a bounded structural preflight that does not invoke accessors or `toJSON`, rejects cycles, `BigInt`, accessors, and other non-JSON values per item, and enforces record-byte limits while building one plain descriptor snapshot. Normalization and classification MUST use only that snapshot and MUST NOT reread the original value. Proxy reflection failures MUST become secret-safe item rejections in collect-all mode. The normalized plain frozen record MUST be measured exactly again as defense in depth. JSONL line-byte limits MUST be enforced before parsing.
18. Evidence identity MUST be a canonical hash of the complete validated promotion payload, including records and content identity, context, hypothesis, policy identity, rationale, attribution, timestamp, and mapping output.
19. Promotion MUST snapshot and freeze validated request fields, attribution, rationale, and accepted records before reading any policy accessor. It MUST capture policy ID, version, and mapper exactly once inside a secret-safe fail-closed boundary, invoke the mapper with a frozen captured receiver that preserves `this.id` and `this.version`, capture mapping output exactly once through own data-property descriptors inside that boundary, and MUST NOT reread mutable caller objects afterward. Mapping accessors, unknown fields, malformed fields, and reflection failures MUST be rejected; later validation and use MUST consume only the plain frozen mapping snapshot.
20. Parser failures, arbitrary promotion-policy exceptions, and non-domain CLI failures MUST use stable public errors without exposing underlying exception messages.
21. The team-memory connector MUST omit `row.raw` by default and include it only through explicit connector or CLI opt-in.
22. `transitionObject` MUST pass an immutable validated `TransitionContext` snapshot to authorization policy, accept only exact closed `AuthorizationDecision` objects, and proceed only for status `allowed`; policy failure or mutation MUST fail closed.
23. `contentHash` MUST be treated as opaque caller-supplied integrity metadata unless verified by an external trust boundary. This SDK does not validate digest syntax or content binding.
24. `teammem:export` failures MUST use `{stage,error:{code,message,details}}` and MUST sanitize non-domain exception messages.

The proposed record shape and complete rationale are in the [universal ingestion design](https://github.com/xiongxhc/collective-cognition-sdk/blob/master/docs/superpowers/specs/2026-07-24-universal-ingestion-design.md).

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
- Team-memory SourceRecords omit the ledger `raw` column by default; callers explicitly opt in with `{ includeRaw: true }` or `--include-raw`.
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
- [x] Reject unnamespaced extension keys and interpretation fields in `context` while preserving source-authored raw content.
- [x] Normalize accepted external values into isolated deeply frozen SourceRecords.
- [x] Reject cycles, `BigInt`, accessors, `toJSON`, and other non-JSON SDK values without executing property access, normalize only one bounded descriptor snapshot, sanitize Proxy reflection failures per item, continue collect-all batches, and measure normalized records exactly.
- [x] Promote one or more source records into one Evidence object while preserving every source, policy, and rationale link.
- [x] Reclassify direct-promotion records, reject collisions, snapshot request state before policy access, capture policy accessors secret-safely, preserve captured mapper receiver semantics, snapshot mapping output exactly once through data descriptors, and hash the complete canonical promotion payload.
- [x] Reject empty source sets, rationales, and policy identities.
- [x] Report valid ingestion separately from a structured failed promotion without throwing after ingestion.
- [x] Enforce configurable SDK and finite CLI limits for input bytes, record count, and per-record bytes.
- [x] Enforce incremental file/stdin limits, pre-parse line limits, pre-normalization record limits, stable limit codes, and structured top-level CLI errors.
- [x] Sanitize parser, policy, and non-domain CLI exceptions.
- [x] Convert the team-memory integration into a conformant connector.
- [x] Omit team-memory raw content by default and require explicit connector/CLI opt-in.
- [x] Enforce immutable transition snapshots and exact fail-closed authorization decisions.
- [x] Treat `contentHash` as opaque caller metadata without implicit digest verification.
- [x] Pass the same SourceRecord conformance contract with a second source-specific fixture connector.
- [x] Verify that the root export surface contains no source-specific connector API.
- [x] Verify that every repository Markdown file is current or explicitly historical.

Implementation evidence:

- canonical fixtures: [`spec/fixtures/source-records/`](../spec/fixtures/source-records/);
- conformance suite: [`tests/conformance.test.ts`](https://github.com/xiongxhc/collective-cognition-sdk/blob/master/tests/conformance.test.ts);
- generic CLI: [`src/cli.ts`](https://github.com/xiongxhc/collective-cognition-sdk/blob/master/src/cli.ts);
- migrated connector: [`src/adapters/team-memory.ts`](https://github.com/xiongxhc/collective-cognition-sdk/blob/master/src/adapters/team-memory.ts);
- second fixture connector: [`src/adapters/git-commit.ts`](https://github.com/xiongxhc/collective-cognition-sdk/blob/master/src/adapters/git-commit.ts);
- completion commands: `npm test`, `npx tsc --noEmit`, `npm run check`, and `npm run example`;
- bounded live verification: default-privacy team-memory SourceRecord export, generic validation, explicit `neutral-evidence-v1` promotion, complete JSON-line parsing, and unchanged source-ledger metadata.

## Explicit Deferrals

- Persistent storage and distributed deduplication.
- Hosted ingestion endpoints.
- Automatic semantic classification.
- Connector marketplace and third-party trust program.
- Cross-language implementation claims.
- Team-memory-agent LaunchAgent or team-vault integration.
