# Collective Cognition Specification

This directory contains the implemented normative SourceRecord `0.1.0` contract and is the contribution entrypoint for the broader language-neutral specification still under development. The runnable TypeScript code and emitted package artifacts are the current reference implementation; the repository is not yet a protocol, externally distributed package, or cross-language standard.

## Current Architecture

Two documents define the current direction:

- the [implemented cognitive-core design](https://github.com/xiongxhc/collective-cognition-sdk/blob/master/docs/superpowers/specs/2026-07-24-collective-cognition-core-design.md);
- the [approved universal-ingestion design](https://github.com/xiongxhc/collective-cognition-sdk/blob/master/docs/superpowers/specs/2026-07-24-universal-ingestion-design.md).

The core design and Phase 2 universal ingestion are implemented and final-review verified locally. [RFC 0001](../rfcs/0001-universal-source-record-ingestion.md) records the implemented ingestion semantics.

The governing boundary is:

```text
external material → neutral SourceRecord → explicit promotion → CognitiveObject
```

The historical team-memory direct-to-Evidence path was replaced. The current connector emits SourceRecords and is imported directly rather than exported from the source-neutral root API.

## Start Here

- Review the [roadmap](https://github.com/xiongxhc/collective-cognition-sdk/blob/master/docs/ROADMAP.md) and distinguish completed phases from planned ones.
- Run `npm test`, `npx tsc --noEmit`, `npm run check`, and `npm run example`.
- Read the normative [`SourceRecord 0.1.0` contract](source-record.md) and its [`JSON Schema`](schemas/0.1.0/source-record.schema.json).
- Run `node --test tests/schema-conformance.test.mjs` for schema conformance.
- Run `node --test tests/conformance.test.ts` for the canonical SourceRecord suite.
- Inspect [`conformance/0.1.0/source-record/valid.jsonl`](conformance/0.1.0/source-record/valid.jsonl) and [`conformance/0.1.0/source-record/invalid.jsonl`](conformance/0.1.0/source-record/invalid.jsonl).
- Review RFC 0001 before changing ingestion semantics or connector boundaries.
- Use the [RFC process](../rfcs/README.md) for semantic, compatibility, or governance changes.

## Normative SourceRecord 0.1.0

`source-record.md` defines the normative serialized, lifecycle, collision, and trust-boundary rules. `schemas/0.1.0/source-record.schema.json` is the language-neutral Draft 2020-12 structural contract. The package exposes that schema at `collective-cognition-sdk/schemas/source-record/0.1.0`.

`conformance/0.1.0/source-record/valid.jsonl` contains canonical SourceRecords directly. It covers every JSON content shape, optional source instance, observed time, offset and fractional timestamps, opaque caller-supplied integrity metadata, actor, context, and colon- or dot-namespaced extensions. The SDK does not verify `contentHash` syntax or bind it to `content`; an external trust boundary must perform any such verification.

`conformance/0.1.0/source-record/invalid.jsonl` contains fixture envelopes with:

- `description`: the invalid case;
- `ruleId`: the normative SourceRecord rule;
- `expectedCode`: the stable error code;
- optional `validationLayer`: `lexical` for pre-parse checks or `runtime` for schema-inexpressible rules;
- exactly one of `record` or lossless `recordJson`: the SourceRecord value to validate.

The invalid corpus covers every machine-checkable rule `SR-001` through `SR-011`, including lossless lexical cases for duplicate member names and lone surrogates and a runtime-layer depth-257 fixture for the schema-inexpressible recursive bound. The valid corpus includes the depth-256 boundary. The schema suite proves strict compilation and rejection of schema-layer fixtures even when `format` assertion is disabled. The runtime conformance suite verifies all fixtures through SDK and CLI outcomes plus equivalent canonical JSON and JSONL results. Focused runtime suites additionally enforce direct-object parity, immutable accepted values, revision collision behavior, bounded normalization, promotion identity, sanitized diagnostics, and fail-closed authorization. Connector tests prove team-memory defaults to raw omission and that team-memory and Git emit valid records under the same SourceRecord contract.

Phase 3 remains in progress. SourceRecord is the first implemented normative language-neutral contract; the initial ESM build, declarations, package entrypoints, CLI contract, package-content checks, clean-consumer schema discovery, Apache-2.0 license, attribution notice, and citation metadata are also implemented. Broader cognitive-object, relationship, transition, authorization, event, error, persistence, compatibility, and security contracts remain planned.

## Planned Normative Content

Specification work will add:

- cognitive objects, relationships, lifecycle transitions, authorization, events, and errors;
- additional versioned machine-readable schemas and fixtures using the SourceRecord structure as a reference;
- compatibility, extension, versioning, and deprecation rules;
- a mapping from every normative rule to an executable check or explicit prose-only rationale.
- host integration contracts for cognition persistence and event publication without selecting one mandatory database.

Package publication still requires a confirmed registry name, supported-runtime and security policies, final compatibility rules, and explicit human approval. The manifest retains `"private": true` until those gates are complete.

Implementation details specific to TypeScript, SQLite, Markdown, a UI, one connector, or one organization do not belong in the language-neutral core specification.

## Contribution Acceptance

A specification contribution must:

1. identify a concrete user or interoperability problem;
2. state normative behavior with `MUST`, `MUST NOT`, `SHOULD`, and `MAY`;
3. preserve attribution, provenance, immutable history, and human authority;
4. keep source collection separate from cognitive interpretation;
5. include valid, invalid, and compatibility fixtures when machine-checkable;
6. document migration, privacy, and deferral implications;
7. update the reference implementation or explicitly track implementation as deferred;
8. reconcile every affected Markdown document.

Accepted text must not silently infer decisions, truth, evidence status, organizational values, consent, or authority from raw source material.
