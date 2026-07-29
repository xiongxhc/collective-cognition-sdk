# RFC 0005: SQLite Cognition Store

**Status:** Implemented; final review pending
**Created:** 2026-07-29

## Problem

Host Integration `0.1.0` defines how a host persists governed cognitive
objects and audit events, but the SDK previously supplied only an in-memory
reference host. The team-memory ledger is a source-owned SQLite database and
must not become the store for governed cognition: it contains captured source
activity, while cognition includes approved rationale, authority, object
lifecycle, and audit history.

Hosts need a small durable reference implementation that proves the port's
commit, replay, and recovery behavior without coupling the source-neutral root
API to team-memory or selecting SQLite as the required storage backend.

## Decision

Provide `SqliteCognitionStore` only through the optional package subpath:

```text
collective-cognition-sdk/stores/sqlite/0.1.0
```

The root export remains storage- and runtime-neutral. The adapter implements
`CognitionStore`, not `CognitionEventPublisher`.

### Source and Cognition Separation

The source ledger and cognition database are distinct host-owned stores. The
adapter requires a caller-supplied, absolute cognition-database path and never
discovers a source database or derives a path from environment variables, home
directories, URLs, or a default location. The durable team-memory example
opens its source ledger read-only, stores cognition only in the separate target,
and verifies the source ledger's byte size and modification time are unchanged.

### Creation and Identity

`createIfMissing` defaults to `false`; a missing database is created only when
the caller explicitly sets it to `true`. Existing unmarked, incompatible, or
source-ledger databases fail closed before schema mutation.

Every created database contains a singleton `cognition_schema` marker with the
adapter identity and schema version. The marker distinguishes a cognition
database from an activity ledger or unrelated SQLite file. Schema version `1`
stores canonical Portable Cognition object revisions in `cognition_objects`
and canonical audit events in `cognition_events`.

### Records, Transactions, and Replay

Writes first use the Host Integration preparation functions. Stored objects and
events are complete canonical Portable Cognition records; reads deserialize,
validate, detach, and deeply freeze them. Source rows and SourceRecords are not
copied into the cognition database.

The adapter uses `BEGIN IMMEDIATE` for every initial or transition commit.
Transition commits insert the object revision and audit event atomically.
Outcomes retain Host Integration precedence: exact replay, object-revision
collision, event-ID collision, partial-state failure, stale version, then
insertion. Exact canonical replay is idempotent; conflicts leave persisted rows
unchanged. After close and reopen, the host can read latest and historical
revisions, list ordered events, and replay an exact request.

## Alternatives

### Store cognition in `team-memory-agent/ledger.db`

Rejected. The ledger is source-owned and read-only for this workflow. Mixing
it with cognition would risk source mutation and conflate captured activity
with governed interpretation.

### Export SQLite from the root package

Rejected. A Node-specific persistence implementation would make the root API
appear to require a runtime or storage choice. The versioned subpath keeps the
adapter optional and additive.

### Add a durable publication outbox

Rejected for this slice. `CognitionStore` and `CognitionEventPublisher` remain
separate ports. This adapter provides durable object and audit-event storage;
durable event publication, queues, and retry workers remain deferred.

### Infer conclusions from team-memory activity

Rejected. The internal activity policy produces structured neutral Evidence
only. It creates no Decisions or Principles and does not infer truth, quality,
readiness, confidence, causality, or authority.

## Compatibility and Migration

Package `0.4.0` remains private and unpublished. It adds the optional
`./stores/sqlite/0.1.0` and `./compatibility/0.4.0` subpaths as an additive
`minor-before-1.0` change. Root runtime and type exports and the generic CLI
contract remain unchanged. Compatibility baselines `0.1.0` through `0.3.0`
remain immutable.

Existing hosts need no migration. A host that adopts SQLite must select an
explicit new cognition-database target and must not point the adapter at a
source ledger or unrelated SQLite database.

## Security and Human Authority

The adapter preserves host-owned authorization boundaries; it neither
authenticates actors nor proves human confirmation. It rejects unsafe target
paths and malformed or mismatched stored records without exposing query text,
source content, or unrelated database rows. Source-ledger raw content remains
opt-in at connector time.

## Acceptance Checks

- dedicated tests cover target safety, schema identity, canonical replay,
  transaction rollback, corruption, restart recovery, and concurrent writers;
- fresh SQLite stores pass the complete Host Integration conformance suite;
- the durable fixture-ledger workflow verifies separate source and cognition
  paths, durable Hypothesis, Evidence, transition, and event records, and
  unchanged source-ledger size and modification time;
- package and clean-consumer checks import the SQLite subpath and declarations;
- the full verification matrix passes on the supported runtime; and
- independent whole-branch review finds no unresolved Critical or Important
  issue before this RFC is marked final-review verified.

## Explicit Deferrals

- durable publication outbox or event delivery;
- database encryption, network databases, and multi-process scale claims;
- automatic cognition, LLM synthesis, Decision or Principle inference;
- SourceRecord persistence in the cognition database;
- maintained team-memory or Obsidian/Markdown adapters;
- package publication, registry confirmation, runtime policy, security policy,
  and production certification.
