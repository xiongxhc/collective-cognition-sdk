# Durable Cognition Workflow 0.1.0 — Design

**Date:** 2026-08-13

**Status:** Approved in concept for specification by the user's selection of the durable cognition workflow as the next SDK milestone. Detailed design awaits user review before implementation planning.

## Problem

The repository has independently verified ingestion, Evidence promotion, cognitive-object transitions, host integration, SQLite persistence, and Markdown projection. A user can compose those pieces in application code, and the durable team-memory example proves that a Hypothesis, Evidence, and an event survive close and reopen. However, there is no supported source-neutral workflow API or CLI that joins those capabilities into one explicit, repeatable operation.

That leaves two practical gaps:

1. teams cannot run a supported end-to-end durable workflow without writing host glue; and
2. naive glue can partially persist a Hypothesis, Evidence, or transition because the current host contract guarantees atomicity only for one initial commit or one transition, not for a multi-object workflow.

The next slice must make the existing SDK usable as one durable workflow without making Team Memory root behavior, inferring cognition automatically, discovering user data, or claiming production readiness.

## User Outcome

A host or CLI operator supplies canonical SourceRecords and an explicit workflow request. One execution validates everything, creates neutral Evidence, places an explicitly supplied Hypothesis under review, commits the complete cognition set atomically to a host-selected store, optionally publishes the transition event through a host-selected publisher, and optionally projects the resulting Portable Cognition records into an already initialized Markdown target.

The same request can be replayed safely. Reopening the cognition database returns the same Hypothesis revisions, Evidence, and event. Source input is never modified.

## Considered Approaches

### Example-only composition

Promote the existing durable team-memory example as the recommended workflow. This is rejected because it is source-specific, has no supported package surface, and manually sequences three commits without a reusable multi-object atomicity contract.

### Thin CLI over sequential existing commits

Add a command that calls the current ingestion, promotion, SQLite, and Markdown APIs in order. This is initially attractive, but it can leave a partially committed workflow if a later cognition write fails. Preflight validation does not eliminate storage conflicts or I/O failure between commits.

### Source-neutral workflow contract with an atomic workflow-store capability

Add a versioned source-neutral workflow request, orchestrator, and optional workflow-store port. The SQLite implementation commits the initial Hypothesis, promoted Evidence, transitioned Hypothesis, and transition event in one database transaction. Publication and Markdown projection occur after authoritative persistence and have explicit recoverable partial-success outcomes.

This is the selected approach. It exposes the real consistency boundary, remains portable to other host stores, and produces one useful end-to-end workflow without expanding into a service or scheduler.

## Scope

This slice adds:

- a Supported Experimental `collective-cognition-sdk/workflows/durable/0.1.0` package subpath;
- a versioned source-neutral durable Evidence-review workflow request and result;
- an optional `CognitionWorkflowStore` port for one atomic multi-object workflow commit;
- a SQLite workflow-store implementation using one immediate transaction and an explicit version-`2` cognition database;
- an SDK orchestrator with explicit persistence, publication, and projection stages;
- a `collective-cognition-workflow` executable with one closed `run` command;
- deterministic replay, reopen verification, source-input immutability checks, and temporary Markdown acceptance;
- package, compatibility, public API, README, RFC, and roadmap updates;
- an additive private package `0.9.0` baseline while retaining the npm publication guard.

This slice does not add:

- Team Memory imports or source-ledger access to the workflow package;
- connector execution, connector discovery, or credential handling;
- automatic promotion, model calls, semantic classification, or generated hypotheses;
- a scheduler, watcher, background service, UI, or network endpoint;
- an editable Markdown store or implicit Obsidian integration;
- a durable publication outbox or delivery guarantee;
- npm publication, production certification, or LTS status.

## Architecture

```text
explicit SourceRecords + explicit workflow request
  -> bounded ingestion and validation
  -> deterministic Evidence promotion
  -> deterministic Hypothesis transition
  -> atomic CognitionWorkflowStore commit
  -> best-effort CognitionEventPublisher publication
  -> optional explicit Markdown projection
  -> closed durable-workflow result
```

The workflow package depends on existing source-neutral SDK contracts. The Node CLI additionally depends on the SQLite store and Markdown adapter subpaths. No connector depends on the workflow package, and the workflow package does not know where SourceRecords originated.

The cognition database is authoritative. Publication and Markdown are optional downstream delivery and projection stages. A failure after persistence does not roll back committed cognition; it produces a recoverable partial-success result.

## Workflow Request

`DurableCognitionWorkflowRequest` is a closed, descriptor-snapshotted SDK input containing:

- `workflowVersion`: exactly `0.1.0`;
- `workflowId`: a non-empty caller-owned idempotency scope;
- `records`: one or more SourceRecords;
- `hypothesis`: an explicit version-`1`, `proposed` Hypothesis supplied by the caller;
- `promotion`: `hypothesisId`, `contextId`, rationale, promotion timestamp, and attribution;
- `reviewTransition`: target state exactly `under_review`, event ID, occurrence timestamp, actors, automation mode, consequence level, and rationale;
- `policy`: an injected Evidence promotion policy for SDK callers.

The serialized CLI request replaces executable `policy` with the exact closed identity `policyId: "neutral-evidence-v1"`. The CLI resolves that identity to the built-in policy after structural validation. No function, module path, dynamic import, or plugin identifier is accepted from serialized input.

The request must satisfy all existing SourceRecord, cognitive-object, promotion, authorization, transition, and Portable Cognition rules. The promotion `hypothesisId` must equal the supplied Hypothesis ID. Context and attribution correlations must be explicit and exact. Unknown fields, accessors, inherited values, unsupported prototypes, cycles, and reflection failures are rejected before any host or filesystem operation.

The workflow does not invent a Goal, infer a Hypothesis, infer a Decision, or choose attribution. The supplied Hypothesis must already contain every relationship and provenance entry required by the core model.

## Prepared Workflow

Before opening or invoking a store, the orchestrator prepares and freezes a complete deterministic workflow:

1. ingest all SourceRecords in fail-fast mode with configured limits;
2. reject source-revision collisions and require at least one accepted unique record;
3. validate and snapshot the supplied Hypothesis;
4. promote accepted records through the captured policy;
5. transition the Hypothesis from `proposed` to `under_review`;
6. create Portable Cognition records for the initial Hypothesis, Evidence, transitioned Hypothesis, and event;
7. derive a canonical request digest covering the workflow ID, normalized records, policy identity, all semantic request fields, and every prepared output.

No database, publisher, or Markdown target is touched until preparation succeeds.

## Atomic Workflow Store

`CognitionWorkflowStore` extends `CognitionStore` and adds one operation:

```ts
commitWorkflow(request: PreparedDurableCognitionCommit):
  Promise<DurableCognitionCommitResult>
```

The prepared commit contains exactly:

- the initial Hypothesis record;
- the initial Evidence record;
- the expected Hypothesis version `1`;
- the transitioned Hypothesis record;
- the transition event record;
- the workflow ID;
- the canonical workflow request digest.

The operation is atomic across all four records. It returns:

- `committed` when all records are newly committed;
- `already_committed` when the exact complete workflow is already present;
- `conflict` with a closed conflict code when any retained object, version, event, or workflow digest differs;
- no success-shaped result after an exception or malformed adapter response.

The port does not require SQL or SQLite. Host implementations may use transactions, conditional writes, or another mechanism, but conformance requires all-or-nothing visibility and exact replay classification.

The workflow-store capability is optional and versioned. Existing `CognitionStore` implementations remain compatible and are not silently treated as workflow stores.

## SQLite Semantics

The SQLite implementation is exported from `collective-cognition-sdk/stores/sqlite-workflow/0.1.0` as `SqliteCognitionWorkflowStore`. It uses the existing cognition-database identity with additive schema version `2`. It does not change existing `CognitionStore` method semantics.

It adds a workflow-commit table keyed by `workflowId`, storing the canonical request digest. Within one `BEGIN IMMEDIATE` transaction it:

1. checks exact replay and all conflict precedence;
2. inserts or verifies the initial Hypothesis;
3. inserts or verifies the Evidence;
4. inserts or verifies the transitioned Hypothesis and event;
5. records the workflow digest;
6. commits once.

Any mismatch or failure rolls back the entire transaction. A process restart sees either the complete workflow or none of it. Existing database validation must recognize only the reviewed additive schema version; unknown, hybrid, or malformed databases still fail closed without mutation.

The workflow store creates schema version `2` only when creation is explicitly requested. It never upgrades a version-`1` database implicitly. The existing `SqliteCognitionStore` is updated to open and operate on both reviewed versions while ignoring version-`2` workflow receipts; `SqliteCognitionWorkflowStore` requires version `2`. Explicit version-`1` to version-`2` migration tooling remains deferred, so operators must select a new workflow cognition database in this slice.

A complete matching set of object and event rows without the matching workflow receipt is a conflict, not an adopted replay. This preserves the atomic workflow boundary and prevents unrelated historical writes from being relabeled as one workflow execution.

Concurrent identical writers produce one `committed` and one `already_committed`. Concurrent conflicting writers produce one winner and one deterministic conflict without partial rows.

## Publication

When the SDK caller supplies a publisher, the orchestrator publishes the transition event after authoritative persistence using its event ID as the idempotency key. When no publisher is supplied, publication is `not_requested`; this is not represented as successful delivery.

Publication returns `published` or `already_published`. An exception or malformed publisher result produces `committed_but_unpublished`. Replaying the identical request revalidates the complete database state and retries publication. This slice does not persist publication attempts or guarantee eventual delivery; a durable outbox remains the next reliability layer.

## Markdown Projection

Projection is optional and occurs only after successful or exact-replay persistence. The caller supplies a projection function or the CLI supplies an explicit absolute path to an already initialized Markdown cognition target.

The projection input is exactly the prepared initial Hypothesis, Evidence, transitioned Hypothesis, and event records. The existing adapter decides stable paths and highest object revisions. The workflow does not initialize a target, discover a vault, invoke Git, or project unrelated database records.

Projection failure produces `committed_but_unprojected` or `committed_but_unpublished_and_unprojected`, preserving the persistence and publication facts. Identical replay retries the failed downstream stage and retains write-if-unchanged behavior.

## Result Model

`DurableCognitionWorkflowResult` is a closed discriminated union:

- `committed`: cognition is complete; each optional downstream stage either was not requested, succeeded, or was an exact replay;
- `committed_but_unpublished`: cognition is complete; event delivery failed;
- `committed_but_unprojected`: cognition is complete, publication did not fail, and requested projection failed;
- `committed_but_unpublished_and_unprojected`: cognition is complete; both downstream stages failed;
- `conflict`: no workflow mutation occurred for this request;
- `failed`: no cognition commit succeeded.

Successful and partial-success results include normalized persistence, publication, and projection statuses; workflow ID and request digest; and the four prepared Portable Cognition records. Publication is one of `not_requested`, `published`, `already_published`, or `failed`. Projection is one of `not_requested`, `projected`, `unchanged`, or `failed`. Returning the records lets a CLI caller inspect or redirect the exact durable cognition without opening the database. Failures use closed codes and secret-safe messages. They do not expose paths, raw source content, arbitrary adapter errors, stack traces, or caught exception messages.

## CLI

The installed executable is `collective-cognition-workflow`. Version `0.1.0` exposes one command:

```text
collective-cognition-workflow run \
  --request /absolute/path/to/workflow-request.json \
  --input /absolute/path/to/source-records.jsonl \
  --format jsonl \
  --cognition-db /absolute/path/to/cognition.db \
  --create-cognition-db \
  [--markdown-target /absolute/path/to/initialized-target]
```

The CLI request file contains semantic fields but not executable code or resource paths. The CLI supports only the built-in `neutral-evidence-v1` policy in this slice. SDK consumers may inject another conforming policy. The CLI does not configure an event publisher in version `0.1.0`, so its successful result reports publication as `not_requested`; it never labels stdout or Markdown projection as event publication.

All paths are explicit and absolute. Input is fully bounded, parsed, normalized, and prepared before the cognition database is opened for mutation. The cognition database cannot alias the request, input, Markdown target metadata, or their SQLite-style sidecars. The Markdown target must already be initialized by the existing Markdown CLI.

The CLI writes one result object to stdout. Top-level failures write one sanitized JSON diagnostic to stderr and no stdout before output begins. It never reads environment-default paths, a home directory, a repository, an Obsidian vault, or a source ledger.

## Limits

The workflow reuses existing SourceRecord and Markdown limits and adds explicit positive safe-integer limits for:

- maximum input bytes;
- maximum SourceRecord count;
- maximum SourceRecord bytes;
- maximum request bytes.

Defaults match the generic ingestion CLI unless the workflow has a stricter reviewed boundary. Limit validation occurs before resource access, and limit failures use stable codes.

## Compatibility and Packaging

This is an additive pre-`1.0.0` private package change:

- package version becomes `0.9.0`;
- the root API remains unchanged;
- the workflow API is exported only from `collective-cognition-sdk/workflows/durable/0.1.0`;
- the SQLite workflow implementation is exported from `collective-cognition-sdk/stores/sqlite-workflow/0.1.0`;
- `collective-cognition-workflow` is added to the executable map;
- compatibility baseline `0.9.0` records exact runtime exports, type exports, subpaths, executable behavior, declaration closure, and package files;
- package contents remain allowlisted and `"private": true` remains set.

No historical schema, fixture, compatibility baseline, prerelease asset, tag, or Normative Stable contract is modified.

## Security and Authority

- SourceRecords are untrusted data and receive the existing structural snapshot, depth, size, and canonical validation.
- Promotion remains an explicit interpretation act with rationale and attribution.
- The workflow requires an explicit Hypothesis and transition context; it does not infer authority.
- Consequential transition confirmation rules remain enforced by the existing transition API.
- Store, publisher, and projector responses are validated before use.
- SQLite and Markdown paths remain host-owned explicit configuration.
- Authentication, encryption, workspace isolation, retention, consent, credentials, and operating-system access control remain host-required.
- A successful workflow is evidence of a committed local operation, not organizational approval, production certification, or publication authority.

## Testing

### Focused SDK tests

- valid preparation produces exact frozen Portable Cognition records and a stable request digest;
- reordered JSON object keys and repeated equivalent input produce identical preparation;
- malformed, accessor-bearing, inherited, proxy-hostile, oversized, colliding, or mis-correlated input fails before host invocation;
- the orchestrator classifies every persistence, publication, and projection outcome exactly;
- identical replay re-invokes requested downstream stages through their idempotent publisher and write-if-unchanged projector boundaries because this slice does not persist downstream completion state;
- mutable or malformed host responses fail closed without leaking adapter details.

### Workflow-store conformance

- all records become visible atomically or none become visible;
- exact replay returns `already_committed`;
- object, version, event, and workflow-digest collisions follow a fixed precedence;
- concurrent identical and conflicting writers preserve one complete winner;
- failed commit and forced rollback leave no partial workflow rows;
- close and reopen preserve every canonical record and workflow digest.

### CLI tests

- JSON and JSONL SourceRecord input produce equivalent results;
- input and request are bounded before database mutation;
- aliases among input, request, cognition database, sidecars, and Markdown metadata are rejected;
- stdout and stderr remain machine-readable and secret-safe;
- the CLI never opens a source ledger or discovers a vault;
- clean-consumer installation exposes the executable and versioned subpath.

### End-to-end acceptance

Using an explicitly selected read-only source ledger and temporary writable targets only:

1. export selected real team-vault activity through the existing Team Memory connector;
2. run the source-neutral workflow CLI against that JSONL;
3. persist the initial Hypothesis, neutral Evidence, transitioned Hypothesis, and event in a separate cognition database;
4. close and reopen the database and verify exact records;
5. replay the same workflow and receive exact-replay statuses with no duplicate records;
6. project the four Portable Cognition records into an initialized temporary Markdown target;
7. verify a second projection does not rewrite unchanged notes;
8. verify source-ledger bytes and nanosecond modification time are unchanged;
9. verify no Decision or Principle is inferred.

No live vault is mutated during automated acceptance.

## Documentation

Implementation updates:

- `README.md` with the supported end-to-end workflow and non-claims;
- `docs/ROADMAP.md` with this Phase 4 completion slice and Phase 5 entry impact;
- `docs/public-api.md` with the workflow subpath and executable;
- a durable workflow operator guide;
- a new RFC defining atomic workflow composition and downstream partial success;
- `rfcs/README.md`, compatibility policy, changelog, and package-development commands.

## Acceptance

The slice is complete when:

1. all focused workflow and workflow-store conformance tests pass;
2. the complete SDK test, schema, compatibility, package, typecheck, syntax, example, and package-dry-run gates pass on the supported Node matrix;
3. clean-consumer tests import the versioned workflow subpath and run the installed executable;
4. SQLite tests prove atomic commit, exact replay, concurrency behavior, rollback, and reopen persistence;
5. temporary Markdown acceptance proves deterministic projection and write-if-unchanged replay;
6. real-ledger acceptance proves useful cognition output without source mutation or live-vault access;
7. package `0.9.0` remains private and npm-unpublished;
8. independent review finds no unresolved Critical or Important issue;
9. README, roadmap, public API, RFC index, compatibility baseline, and changelog agree with the shipped behavior.

## Deferred Follow-Up

After this slice:

1. build a durable publication outbox and retry worker against the explicit partial-publication outcome;
2. promote Git into a second independently useful maintained connector;
3. run Phase 5 cross-connector interoperability with Team Memory and Git;
4. begin opt-in real-team validation only after governance, consent, retention, and rollback owners are named;
5. consider npm publication only after registry-name and accountable-human release gates are satisfied.
