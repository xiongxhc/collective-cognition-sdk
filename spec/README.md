# Collective Cognition Specification

This directory is the contribution entrypoint for the future language-neutral specification. The runnable TypeScript code is the current reference implementation; it is not yet a protocol, stable public package, or cross-language standard.

## Current Architecture

Two documents define the current direction:

- the [implemented cognitive-core design](../docs/superpowers/specs/2026-07-24-collective-cognition-core-design.md);
- the [approved universal-ingestion design](../docs/superpowers/specs/2026-07-24-universal-ingestion-design.md).

The core design is implemented locally. Universal ingestion is an accepted written contract in [RFC 0001](../rfcs/0001-universal-source-record-ingestion.md) and is currently being implemented.

The governing boundary is:

```text
external material → neutral SourceRecord → explicit promotion → CognitiveObject
```

The current team-memory direct-to-Evidence path predates that boundary. It is an experimental implementation to migrate, not normative specification behavior.

## Start Here

- Review the [roadmap](../docs/ROADMAP.md) and distinguish completed phases from planned ones.
- Run `npm test` and `npm run example` to observe current core behavior.
- Review RFC 0001 before changing ingestion semantics or connector boundaries.
- Use the [RFC process](../rfcs/README.md) for semantic, compatibility, or governance changes.

## Planned Normative Content

Specification work will add:

- cognitive objects, relationships, lifecycle transitions, authorization, events, and errors;
- neutral source records, idempotency, source revisions, promotion, and connector contracts;
- versioned machine-readable schemas;
- canonical valid and invalid conformance fixtures;
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
