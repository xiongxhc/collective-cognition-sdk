# SourceRecord Normative Conformance Design

**Status:** Implemented and verified.

**Date:** 2026-07-27

## Problem

The repository has a verified TypeScript `SourceRecord` validator and implementation fixtures, but another language cannot implement the contract without reading TypeScript. Phase 3 needs one portable, versioned, machine-readable boundary before the broader cognitive model is stabilized.

## Decision

Stabilize `SourceRecord` first as the initial language-neutral normative contract.

This slice will not define every cognitive object, persistence, event publication, licensing, or package-release policy. It establishes the specification structure and conformance method those later contracts can follow.

## Design Principles

1. The serialized JSON contract is normative and language-neutral.
2. The TypeScript runtime is a reference implementation, not the source of normative truth.
3. JSON Schema validation and reference-runtime validation must agree for every normative fixture.
4. Source collection remains neutral; interpretation enters only through explicit promotion.
5. Accepted history remains immutable, and source revision identity remains collision-sensitive.
6. Validator-specific messages are not portable API.

## Artifacts

The implementation will add:

```text
spec/
  schemas/
    0.1.0/
      source-record.schema.json
  conformance/
    0.1.0/
      source-record/
        valid.jsonl
        invalid.jsonl
  source-record.md
```

The existing implementation fixtures will move into the versioned conformance location. Repository documentation, tests, and package contents will reference the normative paths.

## Normative SourceRecord Schema

The schema will:

- declare JSON Schema Draft 2020-12 with `$schema`;
- use `urn:collective-cognition:schema:source-record:0.1.0` as its infrastructure-independent `$id`;
- require `schemaVersion` to equal `"0.1.0"`;
- close the root object and nested `source` object;
- require non-whitespace `id`, `source.system`, `sourceId`, `revisionId`, `capturedAt`, and `mediaType`;
- validate `capturedAt` and optional `observedAt` as RFC 3339 date-time values;
- validate `mediaType` with the same media-type grammar enforced by the reference runtime;
- accept any JSON value as `content`;
- treat optional `contentHash` as opaque non-whitespace caller metadata;
- allow neutral JSON properties in `context` while rejecting immediate `polarity`, `confidence`, and `authority` keys;
- require every `extensions` key to be namespaced;
- reject unsupported fields rather than silently discarding them.

JSON Schema describes serialized JSON. JavaScript-specific rejection of cycles, accessors, symbols, custom prototypes, and non-finite numbers remains reference-runtime input hardening. Those cases do not belong in cross-language JSON fixtures because they cannot exist in valid JSON text.

Duplicate JSON member names and lone surrogate strings require lossless lexical fixtures and pre-schema checks because ordinary parsing erases or preserves them inconsistently across implementations.

## Normative Prose

`spec/source-record.md` will define rules with stable identifiers such as `SR-001`.

Each machine-checkable rule will map to:

- a JSON Schema location;
- at least one valid or invalid fixture; and
- a conformance assertion.

Prose-only requirements will state why machine validation is insufficient. These include immutability after acceptance, collision handling, source neutrality, and the trust boundary for `contentHash`.

The implemented contract also fixes the complete SourceRecord depth at 256 nested JSON containers, counting the root object as depth 1. JSON Schema Draft 2020-12 cannot express this recursive resource boundary, so the packaged corpus contains a valid depth-256 fixture and an invalid depth-257 fixture marked `validationLayer: "runtime"`. Runtime tests enforce identical `INVALID_SOURCE_RECORD` behavior across direct SDK, JSON, JSONL, and CLI entry points before recursive processing.

The document will use `MUST`, `MUST NOT`, `SHOULD`, and `MAY` only for normative requirements.

## Conformance Fixtures

Valid fixtures will remain direct `SourceRecord` JSON values.

Invalid fixtures will remain envelopes and add a stable `ruleId`:

```json
{
  "description": "missing revision identity",
  "ruleId": "SR-004",
  "expectedCode": "INVALID_SOURCE_RECORD",
  "record": {}
}
```

Fixtures will cover every machine-checkable schema rule, including:

- required fields;
- supported schema version;
- closed root and source fields;
- non-whitespace identifiers;
- valid timestamps;
- media type syntax;
- JSON content;
- neutral context restrictions;
- namespaced extension keys; and
- optional-field types.

They also cover the schema-inexpressible recursive depth boundary with a valid depth-256 record and an invalid depth-257 runtime-layer envelope. Fixture order will not be normative.

## Conformance Runner

Development tests will use Ajv's Draft 2020-12 validator in strict mode plus `ajv-formats` for RFC 3339 date-time validation. Ajv remains a development dependency and does not enter the SDK runtime dependency graph.

Tests will prove:

1. the schema compiles in strict mode;
2. every valid fixture passes JSON Schema, SDK, and CLI validation;
3. every invalid fixture fails JSON Schema, SDK, and CLI validation;
4. every invalid fixture maps to its expected stable SDK error code;
5. each normative machine-checkable rule has fixture coverage;
6. the packed artifact contains the schema, normative prose, and fixtures; and
7. a clean installed consumer can locate and parse the shipped schema.

Schema-validator diagnostic wording and ordering will not be asserted.

## Runtime Alignment

The existing `validateSourceRecord` behavior will remain the runtime path. This slice will not replace it with Ajv.

If the new schema exposes a difference from the existing runtime:

- the approved normative behavior wins;
- a failing differential test is added first;
- the smallest runtime or schema correction is made; and
- the compatibility impact is documented.

The generic CLI continues to call the SDK runtime rather than a separate schema-only path.

## Packaging

The npm package allowlist will include:

- `spec/source-record.md`;
- `spec/schemas/0.1.0/source-record.schema.json`;
- versioned valid and invalid SourceRecord fixtures.

Implementation plans, tests, source connectors, and unrelated repository documents remain excluded.

`"private": true` remains in place. This slice improves distribution readiness but does not authorize npm publication.

## Compatibility

`0.1.0` identifies the current experimental serialized contract.

- Editorial prose corrections that do not alter acceptance behavior MAY update the document without a schema-version change.
- Any change that alters which serialized records are accepted or rejected MUST use a new schema-version artifact and new conformance fixtures.
- Existing versioned schema artifacts MUST NOT be silently repurposed after an external release.
- Namespaced extension data MAY evolve without adding core fields.

At the time this design was approved, the complete package versioning and deprecation policy remained a later Phase 3 deliverable. That policy is now implemented through `spec/compatibility.md`, RFC 0002, and baseline `0.1.0`; final verification of that later slice remains pending.

## Documentation Updates

Implementation will synchronize:

- `README.md`;
- `docs/ROADMAP.md`;
- `spec/README.md`;
- RFC 0001 where fixture paths or normative status change;
- package-content documentation; and
- the package allowlist.

No document may describe the package as published, licensed, production-ready, or a cross-language standard.

## Verification

The completed slice must pass:

```text
npm test
npx tsc --noEmit
npm run check
npm run example
node --test tests/conformance.test.ts
npm run pack:check
git diff --check
```

Independent code review must find no unresolved correctness, compatibility, security, packaging, or documentation findings before merge.

## Deferred Work

- Cognitive-object, relationship, transition, authorization, event, and error schemas.
- Host persistence and event-publication contracts.
- Full compatibility, deprecation, and migration policy — historical deferral, now implemented pending final verification.
- License selection, registry-name confirmation, security policy, and publication approval.
- Connector packaging and marketplace behavior.
