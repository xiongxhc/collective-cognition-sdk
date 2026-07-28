# RFC 0004: Host Integration Contract

**Status:** Accepted; final-review verification pending

**Created:** 2026-07-28
**Decision owner:** Project maintainer

## Problem

Portable Cognition records define exchange values, but a host still needs predictable behavior when it persists a cognition object, atomically records a transition event, publishes that event, handles retries, and reads history. Without a shared contract, a store can expose partial transitions, replay changed identities, retain caller aliases, or publish before durable state exists.

The repository needs a storage-neutral contract that lets a host demonstrate those observable properties without prescribing a database, message broker, or delivery topology.

## Accepted Semantics

This RFC accepts the [Host Integration Contract 0.1.0](../spec/host-integration.md) as the Normative Stable contract for host-owned cognition persistence and event publication.

The contract establishes that:

- host ports accept only Portable Cognition cognitive-object and cognition-event records, never SourceRecords;
- initial and transition persistence preserve immutable object-revision and event identities, exact replay, optimistic concurrency, and observable object-event atomicity;
- transition publication follows persistence and uses the event ID as the idempotency key;
- a persistence success followed by publication failure remains observable as `committed_but_unpublished` and can be retried with the same request; and
- reads are detached, deeply immutable, and deterministically ordered, while hosts use explicit cognition targets and preserve source-store separation.

The accepted semantics are testable through the public host ports and reusable conformance runner. They do not establish exactly-once downstream effects: a publisher may receive at-least-once attempts, and recipients remain responsible for their own idempotency and side-effect controls.

## Rejected Alternatives

### Require a Shared Database or Transaction Manager

Rejected because storage products, transaction scopes, and fault models differ across hosts. The contract requires observable atomicity and ordering, not a specific implementation mechanism.

### Publish Before Persistence

Rejected because consumers could observe an event whose matching cognitive object is not durable or readable. Persistence-before-publication leaves a recoverable `committed_but_unpublished` state instead of an untraceable publication-first failure.

### Treat a Successful Publish Call as Exactly-Once Delivery

Rejected because a local call result cannot prove broker durability, recipient processing, or downstream side effects. Event-ID idempotency bounds repeated publication attempts but does not transfer exactly-once responsibility to arbitrary consumers.

### Reuse SourceRecord Storage as Cognition Storage

Rejected because collection provenance and cognitive interpretation are separate boundaries. Coupling host commits to a source store's private schema would violate the source-neutral portability direction and encourage implicit interpretation.

## Compatibility Impact

This RFC adds no package version, export, compatibility baseline, schema, or Portable Cognition record-shape change. It specifies the already public host-port behavior under its independent host contract version `0.1.0`.

The Portable Cognition contract version, package version, cognitive-object revision number, and host integration contract version remain independent. A future incompatible host outcome, port shape, replay identity, or conformance rule requires a new host contract version and retained evidence for this version.

Existing SourceRecord and Portable Cognition `0.1.0` artifacts remain unchanged. The package remains private and unpublished; this RFC is neither a registry-release decision nor a production-readiness promise.

## Security Boundaries and Human Authority

Host integration validates Portable Cognition shapes and isolates mutable values; it does not authenticate actors, establish authorization provenance, prove a confirmation, or authorize a consequential transition. Hosts remain responsible for identity, authorization, access control, tenancy, secret filtering, retention, deletion, backups, operational monitoring, and downstream delivery controls.

The contract requires sanitized host failure outcomes so adapter exception text, secrets, paths, and operational details do not cross the portable host boundary. It also forbids ambient source-store discovery and SourceRecord use through cognition ports. Explicit provenance remains an assertion and does not prove source access, integrity, consent, truth, or organizational authority.

## Acceptance Checks

- `tests/host-conformance.test.ts` pins the exact contract rule inventory, contract version, required status semantics, source-store boundary, and final documentation links.
- `tests/host-integration.test.ts` verifies request validation, persistence-before-publication coordination, safe failures, partial-success reporting, and identical-request recovery.
- `tests/reference-host.test.ts` exercises an in-memory reference host for initial and transition replay, conflicts, atomicity, ordering, detached reads, and publisher idempotency.
- `runCognitionHostConformance` provides isolated public-port checks for complete host implementations; a host claiming complete conformance must pass its applicable cases.
- Documentation acceptance requires the focused host suites and `git diff --check`; broader final review remains a separate gate.

## Explicit Deferrals

- A mandatory persistence engine, transaction protocol, queue, broker, subscriber API, retry scheduler, dead-letter mechanism, or exactly-once delivery guarantee.
- A production persistence adapter, remote service, connector marketplace, source-system discovery, or SourceRecord storage integration.
- Authentication, authorization-policy execution, trusted human confirmation, tenant governance, privacy operations, retention/deletion policy, security-runtime policy, or incident response.
- Package publication, removal of `"private": true`, external interoperability certification, production-readiness claims, and final-review verification.
