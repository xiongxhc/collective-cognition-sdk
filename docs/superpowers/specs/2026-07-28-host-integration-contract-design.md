# Host Integration Contract Design

**Status:** Final review correction implemented; scoped re-review pending

**Date:** 2026-07-28

## Problem

The SDK can create portable cognitive objects and transition events, but a host still has to invent how those records are committed, read, retried, and published. If every team invents a different boundary, adapters become application-specific and the SDK cannot provide reusable correctness tests.

The next Phase 3 slice must define a universal host boundary that:

- keeps source storage separate from cognition storage;
- preserves an object and its transition event atomically;
- detects stale or conflicting writes;
- supports safe retries;
- reports publication failure without discarding a successful commit; and
- does not require a database, queue, service, connector, or deployment architecture.

## Decision

Introduce two independent host ports:

1. `CognitionStore` durably commits and reads Portable Cognition records.
2. `CognitionEventPublisher` publishes committed cognition events using the event ID as an idempotency key.

An SDK coordinator performs store-first execution:

1. validate and snapshot the commit request;
2. atomically commit the cognitive object and, for transitions, its event;
3. publish the committed event;
4. return `committed` when both operations succeed; or
5. return `committed_but_unpublished` when persistence succeeds but publication fails.

The coordinator never reports rollback after a successful commit. Retrying the same request is safe: the store recognizes an exact replay as idempotent, and the publisher receives the same event ID.

## Alternatives

### Combined Transactional Host

Rejected because most databases and delivery systems do not share one transaction. Requiring atomic database-and-publisher behavior would exclude local files, Git, SQLite plus webhooks, Postgres plus third-party queues, and in-process event consumers.

### Event-Sourcing-Only Host

Rejected because it selects a persistence model. Event sourcing may implement the port, but snapshot stores, document databases, relational databases, Git-backed stores, and in-memory hosts must remain equally valid.

### Adapter-Specific Integration

Rejected because embedding team-memory, Obsidian, or another source schema in the root contract would reproduce the coupling removed by the universal ingestion work. Source connectors emit `SourceRecord`; cognition hosts persist Portable Cognition records.

## Scope

### Included

- Normative Host Integration Contract `0.1.0` prose with stable `HIC-*` rule identifiers.
- Public TypeScript interfaces for cognition persistence and event publication.
- Store-first coordinator functions with explicit partial-success outcomes.
- Atomic initial-object and transition-object-plus-event commit semantics.
- Optimistic concurrency and exact-replay idempotency.
- Immutable Portable Cognition records at every host boundary.
- A packaged in-memory reference implementation.
- A reusable host conformance harness for third-party implementations.
- Deterministic tests for commits, conflicts, retries, publication failure, recovery, mutation resistance, and error sanitization.
- Package `0.3.0` and compatibility baseline `0.3.0`: additive Host Integration capabilities plus the `COMP-012` source-breaking `PortableDomainError.code` correction under the pre-`1.0.0` minor policy.

### Excluded

- A mandatory database, queue, event bus, service, or network protocol.
- Team-memory, Obsidian, Git, SQL, or cloud persistence implementations.
- SourceRecord persistence or source-ledger mutation.
- Distributed transactions or a claim of exactly-once end-to-end delivery.
- A background worker, durable retry scheduler, hosted service, or synchronization daemon.
- Authentication of actors or human confirmations.
- Automatic interpretation, classification, inference, or cognition creation.
- Registry publication or removal of `"private": true`.

Concrete persistence and connector adapters remain Phase 4 work. They consume this contract rather than changing it.

## Contract Layers

### Normative Semantic Contract

The language-neutral contract defines required behavior for commits, reads, conflicts, idempotency, publication, partial success, and retries. It is Normative Stable at version `0.1.0`.

### TypeScript Service Provider Interface

The TypeScript interfaces and coordinator are the reference implementation of the semantic contract. They remain Supported Experimental until independent host implementations validate the interface shape.

### Reference and Conformance Packages

The in-memory host demonstrates the contract without becoming the required production architecture. The conformance harness runs the same behavioral cases against a host-supplied factory.

## Portable Boundary

The persistence port accepts only:

- `PortableCognitionRecord<"cognitive-object">`; and
- `PortableCognitionRecord<"cognition-event">`.

The publication port accepts only cognition-event records. A host cannot persist or publish source-specific rows through these ports.

The coordinator validates every caller-supplied record before invoking a host. Accepted values are detached own-data snapshots and deeply frozen. A host must not depend on caller prototypes, accessors, inherited properties, `toJSON`, mutable aliases, or object identity.

## Commit Model

### Initial Object Commit

An initial commit contains one cognitive-object record whose object version is `1`.

The store:

- commits the object only when no cognition with that object ID exists;
- returns `committed` after a new durable write;
- returns `already_committed` for an exact canonical replay;
- returns only an `object_revision_collision` correlated to the requested object ID when that object ID and version already identify different canonical content; and
- does not publish an event because object creation does not currently produce a cognition event.

### Transition Commit

A transition commit contains:

- the expected current object version;
- the next cognitive-object record; and
- the matching cognition-event record.

Before calling the store, the coordinator verifies:

- object and event IDs identify the same cognitive object;
- the next object version equals the expected version plus one;
- the event object version equals the next object version;
- the event object type and next state equal the next object;
- the event occurrence time equals the next object's `updatedAt`; and
- the event represents a valid lifecycle edge already accepted by the Portable Cognition Contract.

The store atomically writes the next object revision and event. Neither may become visible without the other.

The store evaluates outcomes in one exact order:

1. exact canonical replay of both records;
2. target object-revision collision;
3. event-ID collision; and
4. stale expected-version conflict only when both target identities are unused.

Every conflict uses a closed operation-specific shape correlated to the request. Version conflicts include the exact requested expected version and a positive safe actual version inconsistent with it. Event collisions include the exact requested event ID. The store leaves latest, object revisions, and events unchanged after every returned conflict.

## Store Interface

The public interface is conceptually:

```ts
interface CognitionStore {
  commitInitial(
    request: InitialCognitionCommit,
  ): Promise<CognitionStoreCommitResult>;

  commitTransition(
    request: TransitionCognitionCommit,
  ): Promise<CognitionStoreCommitResult>;

  getLatestObject(
    objectId: string,
  ): Promise<PortableCognitiveObjectRecord | undefined>;

  getObjectVersion(
    objectId: string,
    version: number,
  ): Promise<PortableCognitiveObjectRecord | undefined>;

  listObjectEvents(
    objectId: string,
  ): Promise<readonly PortableCognitionEventRecord[]>;
}
```

Reads return detached, validated, deeply frozen records. Events are ordered by ascending object version and then event ID. This slice intentionally provides object-scoped reads rather than defining global indexes, query languages, pagination, subscriptions, or retention.

## Publisher Interface

The public interface is conceptually:

```ts
interface CognitionEventPublisher {
  publish(
    event: PortableCognitionEventRecord,
    options: { readonly idempotencyKey: string },
  ): Promise<"published" | "already_published">;
}
```

The coordinator always sets `idempotencyKey` to the event payload ID. A conforming publisher:

- treats an exact repeated event with that key as `already_published`;
- rejects reuse of the key for different canonical event content;
- does not mutate the supplied event; and
- resolves only after accepting responsibility for the delivery guarantee documented by that implementation.

The contract does not equate accepted publication with downstream processing. A publisher must document whether acceptance means an in-process callback completed, a durable queue accepted the event, a file was written, or another host-defined boundary succeeded.

## Coordinator Outcomes

Initial commit returns:

```ts
type InitialCommitOutcome =
  | { status: "committed"; persistence: "committed" | "already_committed"; object: PortableCognitiveObjectRecord }
  | { status: "conflict"; conflict: HostConflict }
  | { status: "failed"; error: HostFailure };
```

Transition commit and publication returns:

```ts
type TransitionCommitOutcome =
  | {
      status: "committed";
      persistence: "committed" | "already_committed";
      publication: "published" | "already_published";
      object: PortableCognitiveObjectRecord;
      event: PortableCognitionEventRecord;
    }
  | {
      status: "committed_but_unpublished";
      persistence: "committed" | "already_committed";
      object: PortableCognitiveObjectRecord;
      event: PortableCognitionEventRecord;
      error: HostFailure;
    }
  | { status: "conflict"; conflict: HostConflict }
  | { status: "failed"; error: HostFailure };
```

`committed_but_unpublished` is durable success plus delivery failure. Callers must not retry the domain transition or construct a new event. They retry the same host request so persistence returns `already_committed` and publication reuses the original event ID.

## Failures

Expected concurrency and identity conflicts are data outcomes, not thrown exceptions. The coordinator accepts only the operation-specific closed conflict shapes above. Mis-correlated, extra-field, unsafe-version, accessor-bearing, or reflection-hostile conflict results become the fixed sanitized commit failure.

Unexpected store and publisher failures become sanitized `HostFailure` values with:

- a stable operation code;
- a safe message;
- the affected object ID;
- the affected event ID when applicable; and
- no raw exception message, stack, path, credentials, query text, or host-private details.

A store failure before a confirmed commit produces `HOST_COMMIT_FAILED`. The result does not claim whether an ambiguous external write succeeded; adapters that cannot determine the outcome must make retry safe through exact replay semantics.

A publisher failure after commit produces `committed_but_unpublished` with `HOST_PUBLICATION_FAILED`.

Invalid records and internally inconsistent commit requests fail before host invocation with a stable SDK domain error.

## Recovery Semantics

The minimum recovery operation is retrying the identical transition request:

1. the store returns `already_committed`;
2. the coordinator republishes the original event with the original event ID;
3. the publisher returns `published` or `already_published`; and
4. the coordinator returns `committed`.

Hosts that need crash recovery independent of the caller may scan their durable event journal and implement an outbox, queue, or scheduler. Those mechanisms are implementation choices and are not required by the core port.

The SDK promises retry-safe at-least-once publication attempts, not exactly-once downstream effects. Consumers use the event ID for deduplication.

## Reference Implementation

The packaged in-memory implementation provides:

- immutable object revisions keyed by object ID and version;
- the latest object revision per object ID;
- immutable cognition events keyed by event ID;
- exact canonical replay detection;
- optimistic version conflicts;
- atomic transition commit behavior within one process;
- an idempotent collecting publisher.

It is a reference and test fixture, not a production persistence recommendation.

## Conformance Harness

Adapter authors supply fresh `CognitionStore` and `CognitionEventPublisher` instances. The harness verifies:

- initial commit and read-back;
- exact initial replay;
- conflicting initial replay;
- atomic transition commit and ordered event read-back;
- stale expected-version rejection;
- object-revision collision rejection;
- event-ID collision rejection;
- unchanged latest, revision, and event reads after every returned conflict;
- exact replay, object collision, event collision, and stale-version overlap precedence;
- exact transition replay;
- no partial visibility after failed commits;
- detached and deeply frozen read results;
- input mutation resistance;
- malformed and SourceRecord-shaped runtime rejection without SourceRecord in the port types;
- rejection of reused store or publisher factory instances across all cases;
- exact publisher replay;
- publisher idempotency-key collision rejection;
- `committed_but_unpublished` behavior;
- successful retry after publication failure; and
- absence of SourceRecord or connector-specific requirements.

Conformance proves behavior against the test cases. It does not certify durability, availability, security, or production capacity.

## Packaging and Compatibility

The slice adds:

- root exports for host port types, coordinator functions, outcomes, and stable host error codes;
- a stable package subpath for Host Integration Contract `0.1.0` prose;
- a stable package subpath for the host conformance harness;
- a separate stable package subpath for the in-memory reference host;
- package `0.3.0`;
- compatibility baseline `0.3.0`; and
- clean-consumer tests for runtime, declarations, subpaths, package contents, the package `0.2.0` generic error-code assignment, and the supported package `0.3.0` narrowing migration.

SourceRecord, ingestion, promotion, cognition, transition, CLI, and serialized Portable Cognition `0.1.0` behaviors remain unchanged. Package `0.3.0` is not purely additive: `PortableDomainError.code` is narrowed from the package-wide `DomainErrorCode` exposed by package `0.2.0` to the immutable Portable Cognition `0.1.0` allowlist. The private, unpublished package keeps version `0.3.0` and classifies the correction as `breaking` with `minor-before-1.0` under `COMP-012`.

## Security and Trust Boundaries

- The SDK validates and snapshots records before calling host code.
- Host code is untrusted extension code and cannot weaken portable record validation.
- Known failures are sanitized before crossing back into SDK results.
- Publishers must not infer authentication from actor or confirmation fields.
- Storage adapters operate only on explicitly supplied targets.
- No implementation may discover a personal vault, source ledger, database, or credentials implicitly.
- Source records and cognition records remain logically and operationally separate even when one host stores both in the same physical database.

## Documentation

The implementation includes:

- `README.md` with the host/application/adapter boundary and a minimal example;
- `ROADMAP.md` with verified Phase 3 completion evidence and remaining Phase 4 adapters;
- `spec/host-integration.md` as normative prose;
- an RFC recording the separation of persistence and publication;
- package and compatibility documentation; and
- API examples for an in-memory host and a third-party adapter conformance run.

Documentation must continue to state that the repository is an unpublished public reference SDK, not a hosted platform or production database.

## Acceptance Criteria

The slice is complete when:

1. invalid or inconsistent requests never reach host code;
2. initial objects are retry-safe and conflict-safe;
3. transitions atomically persist the next object and matching event;
4. optimistic concurrency prevents lost updates;
5. exact retries do not create duplicate revisions, events, or publications;
6. publication failure returns `committed_but_unpublished`;
7. retrying that result can reach `committed` without rerunning the domain transition;
8. host exceptions cannot leak raw private details;
9. the in-memory reference host passes the reusable conformance harness;
10. a deliberately broken host fails the relevant conformance cases;
11. source stores remain outside the cognition host interfaces;
12. package, compatibility, schema, source, CLI, and example checks pass; and
13. scoped re-review confirms the final-review correction with no unresolved Critical or Important issue; this verification remains pending.

## Final Review Correction Evidence

- Focused Host Integration, reference-host, conformance, and Portable Cognition suites pass `81` tests.
- `npm test` passes `249` source, `10` schema, `14` compatibility, and `8` package tests (`281` total).
- `npx tsc --noEmit`, `npm run check`, `npm run example`, `npm run example:portable`, `npm run example:host`, the read-only team-memory example, `npm run pack:check`, and `git diff --check` exit successfully.
- Compatibility hashes: baseline `0.1.0` `4e0c857ad8d115735aa8df99e9d524af55d3a6efae8ead7473b97c5201f5f89b`; change cases `0.1.0` `3337f8e2ca7aaa0769a18ad8ce724c621d94d01528980b6d30feec9e8626bd6b`; baseline `0.2.0` `3da00ab49c1f3b02bfc19226545dce68379546641f418993f632851b8c49ddc4`; change cases `0.2.0` `e0229b0436827bc71456e839e852f96d8d075da8fd65c32342fd6089c995e5f5`; baseline `0.3.0` `02991abb5133a4aef2b6a2fc736567fbbde9e29859909f806f08822fcd40d3d4`; change cases `0.3.0` `1f1ff3822de318806640357bb11804a0213d7084f05350035f8bb8d519dd95f2`.
- Host Integration prose hash: `41d2094f60a096540983bdeb9be5320d43136a8519b9e3ce2336c20f788f7bd7`.
- Public declaration closure hashes: root `7f9e352c9adf8a48d433d280c8040ddad57240726276a15d690133b3dfcf7333`; host-conformance `4cb58d68d6796cc77a8dfdb5a31013e441c99142bbb5bc62a91e5e71d64db94b`; reference-host `1447986d26b53d77a083fe414da8d744056df30db4e0094bb28a656d0f8965b2`.
- Independent byte comparisons confirm historical baseline/artifact `0.1.0` and `0.2.0` files are unchanged. The Portable Cognition runtime allowlist and its focused tests are untouched by this correction pass.
- Final review correction implemented; scoped re-review pending.

## Delivery Sequence

1. Add normative prose, RFC, and contract version.
2. Add failing coordinator and port tests.
3. Implement validation, outcomes, and coordinator behavior.
4. Add the in-memory store and collecting publisher.
5. Extract and package the reusable conformance harness.
6. Add package `0.3.0` compatibility artifacts.
7. Update README, roadmap, examples, and package verification. Completed in package `0.3.0`.
8. Run focused tests, full local checks, independent review, and final verification. Final-review corrections and the complete local matrix are implemented; scoped re-review remains pending.
