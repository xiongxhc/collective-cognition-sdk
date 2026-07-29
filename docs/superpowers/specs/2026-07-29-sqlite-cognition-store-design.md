# SQLite Cognition Store Design

**Status:** Implemented; final review pending

**Date:** 2026-07-29

## Problem

The SDK can transform team-memory ledger rows into neutral `SourceRecord` values, promote selected records into attributable Evidence, and validate host persistence behavior. The current real-ledger example still has two practical gaps:

1. it links Evidence to a hypothesis identifier without creating the corresponding Hypothesis object; and
2. the reference host is in-memory, so accepted cognition disappears when the process exits.

The quick quality test also showed that `neutral-evidence` correctly preserves source statements without interpreting them, but its concatenated output is not a useful activity summary. Changing that policy silently would break Evidence identity and would blur the boundary between source preservation and interpretation.

This slice must improve the testable workflow without introducing automatic conclusions, coupling the root SDK to team-memory, or risking writes to the source ledger.

## Decision

Deliver two related additions:

1. an internal, versioned team-memory activity promotion policy that deterministically summarizes activity shape without judging truth, quality, readiness, confidence, or decision impact; and
2. a public SQLite `CognitionStore` reference adapter that durably persists Portable Cognition objects and audit events in an explicitly supplied, separate database.

The durable real-ledger example will:

1. read the team-memory ledger in read-only mode;
2. create a real Hypothesis object;
3. map selected ledger rows to `SourceRecord`;
4. promote them into structured neutral Evidence linked to that Hypothesis;
5. commit both objects to a separate cognition database;
6. perform and persist one valid Hypothesis transition and its audit event;
7. close and reopen the database; and
8. prove that the Hypothesis, Evidence, historical version, and event survive restart.

No Decision or Principle is inferred.

## Alternatives

### Change `neutral-evidence-v1`

Rejected. The policy intentionally preserves source statements, and its identity participates in deterministic Evidence IDs. Changing version `1` would silently alter behavior and invalidate replay expectations.

### Persist Cognition in `team-memory-agent/ledger.db`

Rejected. The activity ledger is source-owned. Cognition contains governed interpretation, rationale, authority, lifecycle, and audit history and must remain logically and physically separate.

### Add SQLite Store and Durable Outbox Together

Rejected for this slice. `CognitionStore` and `CognitionEventPublisher` are separate host ports. Durable object and audit-event persistence satisfies the Phase 4 database-adapter deliverable. A durable publication outbox remains a later operational adapter.

### Put SQLite in the Root Export

Rejected. The root remains runtime- and storage-neutral. Node-specific persistence is an optional versioned package subpath.

## Scope

### Included

- Internal team-memory activity policy version `1`.
- A real Hypothesis object in the team-memory example.
- Structured deterministic activity counts, time range, actor count, project, and unresolved status signals.
- Public `SqliteCognitionStore` through `collective-cognition-sdk/stores/sqlite/0.1.0`.
- Package version `0.4.0` and an additive pre-`1.0.0` compatibility baseline.
- Explicit database creation and open behavior.
- Durable object revisions and cognition events.
- Atomic transition object-plus-event commits.
- Exact canonical replay and Host Integration conflict precedence.
- Close/reopen recovery.
- Full host-conformance execution against fresh SQLite stores.
- A durable real-ledger example using explicitly supplied source and cognition paths.
- RFC 0005, package documentation, and roadmap updates.

### Excluded

- Modification of `neutral-evidence-v1`.
- Automatic belief, hypothesis, decision, or principle generation.
- LLM synthesis in the SDK.
- SourceRecord persistence in the cognition database.
- Writes to `team-memory-agent/ledger.db`.
- Obsidian or Markdown rendering.
- Background synchronization, polling, or scheduled execution.
- Durable event publication or an outbox.
- Authentication of actors or human confirmations.
- Database encryption, network database support, or multi-process scale claims.
- npm publication or removal of `"private": true`.

## Evidence Quality Improvement

The internal team-memory policy accepts only SourceRecords produced from team-memory events. It rejects incompatible media types or malformed activity content.

It maps a selected record set into one neutral Evidence object with:

- a title naming the selected project or activity set;
- a statement containing deterministic counts rather than concatenated raw titles;
- the inclusive source time range;
- distinct actor count;
- activity counts by known kind, including message, commit, and merge request;
- merge-request status counts parsed only from explicit source summary prefixes such as `[opened]`, `[merged]`, `[closed]`, and `[reopened]`; and
- unresolved signals that report contradictory or incomplete explicit statuses without deciding their meaning.

The policy does not claim readiness, success, causality, support, challenge, confidence, or authority. Its polarity remains `neutral`.

The complete contributing SourceRecords remain represented through immutable provenance and promotion metadata. Raw source content remains omitted unless the caller explicitly opted into it at connector time.

## Public Adapter Boundary

The SQLite adapter is exported only through:

```text
collective-cognition-sdk/stores/sqlite/0.1.0
```

The root export remains unchanged.

The public constructor is conceptually:

```ts
new SqliteCognitionStore({
  databasePath: "/absolute/path/to/cognition.db",
  createIfMissing: true,
  busyTimeoutMs: 5_000,
})
```

Requirements:

- `databasePath` is mandatory, non-empty, absolute, and captured as an own data property.
- Relative paths, `:memory:`, URLs, environment lookup, home-directory expansion, and implicit defaults are rejected.
- `createIfMissing` defaults to `false`.
- Opening a missing file without explicit creation fails before SQLite creates it.
- An existing unrelated or unmarked database is rejected without schema mutation.
- Extension loading and double-quoted string literals remain disabled.
- foreign keys and defensive mode remain enabled.
- `close()` is explicit and idempotent.

The adapter implements `CognitionStore`; it does not implement `CognitionEventPublisher`.

## Database Identity and Schema

Schema version `1` uses three strict tables:

### `cognition_schema`

- singleton marker;
- adapter identity;
- schema version;
- creation timestamp.

The marker distinguishes cognition databases from source ledgers and unrelated SQLite files.

### `cognition_objects`

- `object_id`;
- `object_version`;
- `object_type`;
- canonical Portable Cognition JSON;
- primary key `(object_id, object_version)`.

### `cognition_events`

- `event_id` primary key;
- `object_id`;
- `object_version`;
- canonical Portable Cognition JSON;
- unique `(object_id, object_version)`;
- foreign key `(object_id, object_version)` to `cognition_objects`.

The latest object is the highest persisted version for an object ID. No separate mutable head table is required in schema version `1`.

The adapter stores complete Portable Cognition records, not source rows. Evidence provenance retains source identities without duplicating the source store.

## Canonical Record Handling

Every write first uses the existing Host Integration preparation functions to validate, detach, and freeze the request.

Records are compared by canonical JSON semantics, not caller key order or ordinary `JSON.stringify` output. Reads deserialize through the Portable Cognition contract and return detached, deeply frozen records.

Malformed, semantically invalid, or mismatched stored rows cause a closed adapter failure. The adapter never returns partially trusted data.

## Commit Semantics

Every write uses `BEGIN IMMEDIATE`, followed by `COMMIT` or `ROLLBACK`.

### Initial Commit

1. Validate a version-one cognitive-object record.
2. Read any existing `(object_id, 1)` revision.
3. Return `already_committed` for exact canonical replay.
4. Return `object_revision_collision` for different canonical content.
5. Reject inconsistent existing history.
6. Insert the new object and commit.

### Transition Commit

Evaluate outcomes in the Host Integration Contract order:

1. exact object-and-event replay;
2. object-revision collision;
3. event-ID collision;
4. partial-state corruption failure;
5. stale expected-version conflict; and
6. atomic object-and-event insertion.

The transition object and event become visible together or not at all. Returned conflicts leave all stored rows unchanged.

Two store instances targeting the same database must serialize writers through SQLite and return a version conflict for a stale second transition rather than overwrite committed cognition.

## Failure and Recovery

Direct adapter construction and reads throw stable SQLite-adapter errors without exposing query text, source content, or unrelated database rows. Host coordinators continue to project unexpected store failures into sanitized `HOST_COMMIT_FAILED` outcomes.

Unknown schema versions, missing markers, malformed records, partial transition state, closed-store use, and incompatible files fail closed.

After process restart, a caller can reopen the same explicit database and:

- read the latest object;
- read any historical version;
- list ordered object events; and
- retry an exact commit as `already_committed`.

## Package and Compatibility

This additive slice releases source version `0.4.0` while retaining `"private": true`.

Required compatibility work:

- preserve baselines `0.1.0` through `0.3.0` byte-for-byte;
- add immutable baseline `0.4.0`;
- add `./compatibility/0.4.0`;
- add `./stores/sqlite/0.1.0`;
- pin the SQLite declaration closure and digest independently;
- classify the new optional adapter subpath as an additive minor-before-`1.0.0` change;
- extend package tarball and clean-consumer tests; and
- keep Node- and team-memory-specific APIs out of the root export allowlist.

The adapter is a durable reference implementation, not production certification.

## Testing

Implementation follows red-green-refactor.

### Evidence Policy

- rejects non-team-memory records;
- produces deterministic counts, range, actor count, and explicit status signals;
- remains neutral;
- retains complete provenance;
- creates the same Evidence ID for semantically identical input;
- creates an actual linked Hypothesis in the example; and
- infers zero Decisions.

### Target Safety

- rejects empty, relative, URL, `:memory:`, and implicit paths;
- does not create a missing database unless explicitly authorized;
- rejects the real shape of `team-memory-agent/ledger.db` without mutation;
- rejects unrelated and unknown-version databases without mutation; and
- never reads or discovers a personal vault.

### Store Correctness

- passes every reusable host-conformance case;
- survives close and reopen;
- preserves every object revision and ordered event;
- handles exact replay and every conflict;
- rolls back object insertion on event failure;
- returns a stale-version conflict across two open store instances;
- rejects malformed stored records;
- rejects partial transition state;
- returns detached frozen reads; and
- closes every test store and removes every temporary database.

### Package and Acceptance

- built subpath imports in a clean consumer;
- TypeScript declarations resolve under default NodeNext settings;
- package inventory contains only approved SQLite artifacts;
- the durable fixture-ledger example passes automatically;
- a manual real-ledger acceptance run proves the source ledger size and modification time remain unchanged; and
- the cognition database is closed, reopened, queried, and explicitly removed only by the acceptance command or operator.

## Documentation

Update:

- `README.md`;
- `docs/ROADMAP.md`;
- `spec/compatibility.md` only if additive-process wording needs clarification;
- RFC index and RFC 0005;
- package examples and commands; and
- every affected current-status or test-count statement.

Historical plans, specifications, baselines, and evidence remain immutable.

## Acceptance Criteria

This slice is complete when:

1. the improved team-memory example creates a real Hypothesis and structured neutral Evidence without inference;
2. a separate explicitly created cognition database durably stores the Hypothesis, Evidence, one transitioned Hypothesis revision, and its event;
3. close/reopen verification returns semantically identical frozen records;
4. the source ledger remains byte-size and modification-time unchanged;
5. the SQLite store passes the full host-conformance suite and dedicated safety tests;
6. package `0.4.0` installs and imports through the SQLite subpath in a clean consumer;
7. all existing and new tests, type checks, syntax checks, examples, compatibility checks, and package checks pass; and
8. independent final review finds no unresolved Critical or Important issue.

Implementation has completed the executable acceptance work. The independent
whole-branch review has not yet run, so this design is intentionally not marked
final-review verified.
