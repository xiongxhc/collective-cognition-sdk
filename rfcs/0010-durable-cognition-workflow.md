# RFC 0010: Durable Cognition Workflow

**Status:** Implemented
**Created:** 2026-08-13

## Problem

The SDK previously exposed ingestion, promotion, host persistence, SQLite, and
Markdown projection as separate pieces. A host could compose them, but there
was no supported source-neutral operation that validated one complete request
and atomically persisted its initial Hypothesis, promoted neutral Evidence,
reviewed Hypothesis, and transition event.

A simple sequential wrapper would permit partial cognition persistence. A
source-specific wrapper would also make one connector's storage model part of
the cognition workflow. The package needs an explicit composition boundary
without inferring cognition or claiming service-level readiness.

## Proposed Semantics

Durable Cognition Workflow `0.1.0` accepts caller-supplied canonical
SourceRecords, an explicit Hypothesis, explicit promotion context, and an
explicit review transition. Preparation validates and freezes the full request
before invoking storage, publication, or projection.

The supported flow is:

```text
connector or canonical JSONL
  -> explicit durable workflow request
  -> atomic cognition database
  -> optional event publisher
  -> optional managed Markdown projection
```

The source-neutral API is exported only from
`collective-cognition-sdk/workflows/durable/0.1.0`. A host supplies a
`CognitionWorkflowStore` and may supply a `CognitionEventPublisher` and
`DurableCognitionProjector`. Persistence completes before either optional
downstream stage. Publication and projection report independent, recoverable
outcomes and do not change the authoritative commit result.

The Node-specific SQLite implementation is exported only from
`collective-cognition-sdk/stores/sqlite-workflow/0.1.0`. It requires schema
version `2`, creates a missing database only when explicitly requested, uses
one immediate transaction, and does not upgrade a version-`1` database. This
slice therefore requires a new, explicitly selected SQLite v2 cognition
database.

The installed `collective-cognition-workflow` executable has one `run`
command. It accepts one absolute request path, canonical JSON or JSONL input,
one absolute cognition-database path, and an optional absolute managed
Markdown target. It supports only the built-in `neutral-evidence-v1` policy.
The CLI does not accept or invoke a publisher.

Markdown is a deterministic human-readable projection, not authoritative
storage. The cognition store remains authoritative even when projection fails.

## Alternatives

### Promote the team-memory example

Rejected because that example is source-specific and manually sequences
multiple persistence operations. It cannot define the general atomicity
boundary.

### Add only a sequential CLI wrapper

Rejected because preflight validation cannot prevent a later storage failure
from leaving a partial multi-object workflow.

### Build a scheduler or service

Rejected because scheduling, source discovery, credentials, retries, and
operational tenancy are host concerns outside this package slice.

## Compatibility and Migration

Private package `0.9.0` adds two Supported Experimental versioned subpaths and
the `collective-cognition-workflow` executable. It preserves every root runtime
and type export, historical package subpath, historical executable, and
immutable compatibility artifact. The change is additive with a minor
pre-`1.0.0` package-version effect.

Existing SQLite version-`1` databases remain valid for
`collective-cognition-sdk/stores/sqlite/0.1.0`. They are not migrated or
adopted by the workflow store. Operators must choose a new explicit database
for SQLite workflow schema version `2`.

The package remains private and unpublished. This RFC does not authorize npm
publication or claim production use.

## Security and Human Authority

The workflow does not infer a Goal, Hypothesis, Decision, Principle,
attribution, confirmation, or organizational approval. Callers remain
responsible for authenticated identity, authorization policy, consent,
retention, workspace isolation, encryption, and secret filtering.

Successful local persistence is not production certification. The workflow
does not supply authentication, encryption, a durable publication outbox, a
retry worker, or a delivery guarantee.

## Acceptance Checks

- Package tests import both versioned subpaths from a clean packed consumer,
  typecheck every public workflow type, and execute the installed workflow CLI.
- Compatibility tests lock exact runtime exports, type exports, declaration
  closures and digests, package files, and the additive change case.
- SQLite tests cover atomic commit, exact replay, conflicts, rollback,
  concurrency, close, and reopen on a runtime with enforced defensive mode.
- Tarball tests lock executable modes and exclude source, tests, examples,
  plans, and unexported internal package paths.
- Documentation checks keep package publication blocked and production use
  not claimed.

## Explicit Deferrals

This RFC does not add a scheduler, automatic cognition, Obsidian discovery,
authentication, encryption, a durable outbox, production certification, npm
publication, publisher support in the CLI, or authoritative Markdown storage.
It does not certify a host, connector, deployment, or organization.
