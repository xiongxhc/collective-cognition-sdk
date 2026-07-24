# Collective Cognition Specification

This directory is the contribution entrypoint for the future language-neutral specification. The runnable TypeScript package is the current reference implementation; it is not yet a protocol or cross-language standard.

## Start Here

- Read the [approved core design](../docs/superpowers/specs/2026-07-24-collective-cognition-core-design.md).
- Review the [roadmap](../docs/ROADMAP.md), especially Phase 2 entry criteria and deferrals.
- Run `npm test` and `npm run example` to observe the current reference behavior.
- Use an [RFC](../rfcs/README.md) for proposed semantic or compatibility changes.

## What Belongs Here

Phase 2 specification work will add:

- normative definitions for objects, relationships, lifecycle transitions, authorization, events, and errors;
- versioned JSON Schemas or equivalent machine-readable contracts;
- canonical valid and invalid conformance fixtures;
- compatibility, extension, versioning, and deprecation rules;
- a mapping from every normative rule to an executable check or an explicit prose-only rationale.

Implementation details that apply only to TypeScript, SQLite, Markdown, a UI, or a specific organization do not belong in the core specification.

## Contribution Acceptance

A specification contribution should:

1. identify the ambiguity or interoperability need with a concrete example;
2. state normative behavior using unambiguous terms such as MUST, MUST NOT, SHOULD, and MAY;
3. preserve attribution, provenance, historical state, and human authority boundaries;
4. include valid, invalid, and compatibility fixtures when the rule is machine-checkable;
5. document migration and deferral implications;
6. update the TypeScript reference implementation or explicitly record why implementation is deferred.

Accepted specification text must not silently infer decisions, truth, organizational values, or authority from raw evidence.
