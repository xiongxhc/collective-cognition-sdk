# Collective Cognition Specification

This directory contains the implemented Normative Stable SourceRecord `0.1.0` and Portable Cognition `0.1.0` contracts plus compatibility baselines `0.1.0` and `0.2.0`. Portable Cognition is task-reviewed; Task 6 broad final review remains pending. The runnable TypeScript code and emitted package artifacts are the current reference implementation; package `0.2.0` remains private and unpublished, and the repository is not yet a protocol, production-ready package, or cross-language standard.

## Current Architecture

Four documents define the current direction:

- the [implemented cognitive-core design](https://github.com/xiongxhc/collective-cognition-sdk/blob/master/docs/superpowers/specs/2026-07-24-collective-cognition-core-design.md);
- the [approved universal-ingestion design](https://github.com/xiongxhc/collective-cognition-sdk/blob/master/docs/superpowers/specs/2026-07-24-universal-ingestion-design.md).
- the [approved compatibility, versioning, and deprecation design](../docs/superpowers/specs/2026-07-27-compatibility-versioning-deprecation-design.md).
- the [implemented Portable Cognition design, with final review pending](../docs/superpowers/specs/2026-07-27-portable-cognition-contract-design.md).

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
- Read the normative [`Portable Cognition 0.1.0` contract](portable-cognition.md), its [`JSON Schema`](schemas/0.1.0/portable-cognition.schema.json), and its [conformance fixtures](conformance/0.1.0/portable-cognition/).
- Read the normative [compatibility policy](compatibility.md), [baseline `0.1.0`](compatibility/0.1.0/baseline.json), and [change cases](compatibility/0.1.0/change-cases.jsonl).
- Run `npm run test:schema` for the combined SourceRecord and Portable Cognition schema gate; `pack:check` and npm prepack inherit it.
- Run `node --test tests/conformance.test.ts` for the canonical SourceRecord suite.
- Run `npm run build` and `npm run test:compatibility` for baseline checks.
- Inspect [`conformance/0.1.0/source-record/valid.jsonl`](conformance/0.1.0/source-record/valid.jsonl) and [`conformance/0.1.0/source-record/invalid.jsonl`](conformance/0.1.0/source-record/invalid.jsonl).
- Review RFC 0001 before changing ingestion semantics or connector boundaries.
- Review [RFC 0002](../rfcs/0002-compatibility-versioning-and-deprecation.md) before changing compatibility, versioning, or deprecation semantics.
- Review [RFC 0003](../rfcs/0003-portable-cognition-contract.md) before changing Portable Cognition exchange semantics.
- Inspect the [compatibility test](../tests/compatibility.test.mjs) and its [approved design](../docs/superpowers/specs/2026-07-27-compatibility-versioning-deprecation-design.md).
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

## Normative Portable Cognition 0.1.0

`portable-cognition.md` defines the Normative Stable serialized exchange contract for cognitive objects, cognition events, transition contexts, authorization decisions, and serializable domain errors. `schemas/0.1.0/portable-cognition.schema.json` is its language-neutral Draft 2020-12 structural contract. The package exposes the schema at `collective-cognition-sdk/schemas/portable-cognition/0.1.0` and its valid, invalid, and cognitive-loop fixtures through versioned conformance subpaths.

The contract provides an envelope and runtime codec, not persistence, event publication, identity authentication, authorization-policy execution, connector packaging, runtime policy, or security policy. Confirmation metadata remains an assertion rather than proof of a human approval. The domain-error shape has no dedicated stack, cause, exception-name, or path fields, and the runtime does not automatically project caught exceptions; caller-supplied `message` and `details` still require host filtering for secrets, paths, and operational details. `npm run test:schema` runs this schema suite together with SourceRecord conformance. The next active Phase 3 slice is host integration contracts for host-owned persistence and publication.

## Normative Compatibility Baselines

`compatibility.md` defines the normative compatibility, versioning, and deprecation policy. `compatibility/0.1.0/baseline.json` is the byte-immutable baseline for the SourceRecord contract and initial package surface. `compatibility/0.2.0/baseline.json` retains that surface and records the additive Portable Cognition runtime, type, schema, conformance, package, and artifact inventories. The package exposes them at `collective-cognition-sdk/compatibility/0.1.0` and `collective-cognition-sdk/compatibility/0.2.0`.

SourceRecord `0.1.0`, Portable Cognition `0.1.0`, and compatibility baselines `0.1.0` and `0.2.0` are Normative Stable. Before `1.0.0`, the package root and generic CLI are Supported Experimental. Connectors and unexported source modules are Internal. Compatibility checks detect exact baseline drift and declared process consequences; they do not automatically determine semantic compatibility.

Phase 3 remains in progress. SourceRecord and the compatibility baselines are implemented normative contracts, and the compatibility slice is final-review verified. Portable Cognition is implemented and task-reviewed; Task 6 broad final review remains pending. The initial ESM build, declarations, package entrypoints, CLI contract, package-content checks, clean-consumer schema discovery, Apache-2.0 license, attribution notice, and citation metadata are also implemented. Host integration contracts, adapters and connector packaging, runtime policy, security policy, publication, and production readiness remain deferred.

## Planned Normative Content

Specification work will add:

- host integration contracts for host-owned cognition persistence and event publication;
- additional type-specific cognitive-object semantics and versioned machine-readable schemas where Portable Cognition's intentionally open `data` fields are insufficient;
- a mapping from every normative rule to an executable check or explicit prose-only rationale.

Package publication still requires registry confirmation, runtime and security policies, final verification, and explicit human approval. The manifest retains `"private": true`, and the package is unpublished.

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
