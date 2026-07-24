# Collective Cognition Specification

This directory is the contribution entrypoint for the future language-neutral specification. The runnable TypeScript code is the current reference implementation; it is not yet a protocol, stable public package, or cross-language standard.

## Current Architecture

Two documents define the current direction:

- the [implemented cognitive-core design](../docs/superpowers/specs/2026-07-24-collective-cognition-core-design.md);
- the [approved universal-ingestion design](../docs/superpowers/specs/2026-07-24-universal-ingestion-design.md).

The core design and Phase 2 universal ingestion are implemented locally. [RFC 0001](../rfcs/0001-universal-source-record-ingestion.md) records the implemented ingestion semantics.

The governing boundary is:

```text
external material → neutral SourceRecord → explicit promotion → CognitiveObject
```

The historical team-memory direct-to-Evidence path was replaced. The current connector emits SourceRecords and is imported directly rather than exported from the source-neutral root API.

## Start Here

- Review the [roadmap](../docs/ROADMAP.md) and distinguish completed phases from planned ones.
- Run `npm test`, `npx tsc --noEmit`, `npm run check`, and `npm run example`.
- Run `node --test tests/conformance.test.ts` for the canonical SourceRecord suite.
- Inspect [`fixtures/source-records/valid.jsonl`](fixtures/source-records/valid.jsonl) and [`fixtures/source-records/invalid.jsonl`](fixtures/source-records/invalid.jsonl).
- Review RFC 0001 before changing ingestion semantics or connector boundaries.
- Use the [RFC process](../rfcs/README.md) for semantic, compatibility, or governance changes.

## Current Phase 2 Fixtures

`fixtures/source-records/valid.jsonl` contains canonical SourceRecords directly. It covers string and structured content plus optional source instance, observed time, opaque integrity metadata, actor, context, and namespaced extensions.

`fixtures/source-records/invalid.jsonl` contains fixture envelopes with:

- `description`: the invalid case;
- `expectedCode`: the stable error code;
- `record`: the SourceRecord-shaped value to validate.

The invalid corpus covers missing revision identity, invalid timestamp, non-string media type, and unsupported schema version. The conformance suite verifies SDK and CLI outcomes plus equivalent canonical JSON and JSONL results. It also proves the team-memory and Git fixture connectors emit valid records under the same SourceRecord contract.

These Phase 2 files are implementation conformance fixtures for the TypeScript reference source. Phase 3 will define normative, versioned, language-neutral fixtures and schemas suitable for independent implementations.

## Planned Normative Content

Specification work will add:

- cognitive objects, relationships, lifecycle transitions, authorization, events, and errors;
- versioned machine-readable schemas;
- normative, versioned, language-neutral conformance fixtures;
- compatibility, extension, versioning, and deprecation rules;
- a mapping from every normative rule to an executable check or explicit prose-only rationale.

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
