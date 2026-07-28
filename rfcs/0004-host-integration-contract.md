# RFC 0004: Host Integration Contract

**Status:** Accepted; final review correction implemented, scoped re-review pending

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
- overlapping transition outcomes use one deterministic precedence: exact canonical replay, target object-revision collision, event-ID collision, then stale expected-version conflict only when the target identities are unused;
- conflict values use closed operation-specific shapes correlated to the requested object, expected version, actual version, and event ID as applicable; malformed or hostile adapter values fail closed;
- transition publication follows persistence and uses the event ID as the idempotency key;
- a persistence success followed by publication failure remains observable as `committed_but_unpublished` and can be retried with the same request; and
- reads are detached, deeply immutable, and deterministically ordered, while hosts use explicit cognition targets and preserve source-store separation.

Only a returned conflict establishes that a transition did not commit either requested record. If a store adapter throws or returns an invalid result, the coordinator returns a sanitized failed outcome without claiming rollback or no write; callers retry the identical request to resolve the potentially ambiguous persistence result through exact replay. Coordinator-generated commit and publication `HostFailure` values and conformance report failures are sanitized, while raw read-port failures have no standardized `HostFailure` outcome.

The accepted semantics are testable through the public host ports and reusable conformance runner. They do not establish exactly-once downstream effects: a publisher may receive at-least-once attempts, and recipients remain responsible for their own idempotency and side-effect controls.

## Rejected Alternatives

### Combined Transactional Host

Rejected because most persistence and delivery systems do not share one transaction. Requiring combined database-and-publisher atomicity would exclude local files, Git, SQLite plus webhooks, relational stores plus third-party queues, and in-process consumers. The contract requires observable object-event atomicity and store-first recovery, not a shared transaction manager.

### Event-Sourcing-Only Host

Rejected because it selects a persistence model. Event sourcing may implement the contract, but snapshot stores, document databases, relational databases, Git-backed stores, and in-memory hosts remain equally valid.

### Adapter-Specific Integration

Rejected because embedding team-memory, Obsidian, or another adapter's source schema in the root contract would recreate source-system coupling. Source connectors emit SourceRecords; cognition hosts persist Portable Cognition records through explicit targets.

### Publish Before Persistence

Rejected because consumers could observe an event whose matching cognitive object is not durable or readable. Persistence-before-publication leaves a recoverable `committed_but_unpublished` state instead of an untraceable publication-first failure.

### Treat a Successful Publish Call as Exactly-Once Delivery

Rejected because a local call result cannot prove broker durability, recipient processing, or downstream side effects. Event-ID idempotency bounds repeated publication attempts but does not transfer exactly-once responsibility to arbitrary consumers.

## Compatibility Impact

Package `0.3.0` adds the Host Integration `0.1.0` root exports and versioned contract, conformance, and reference-host subpaths. Those host capabilities are additive, but the package release as a whole is classified as a breaking correction because `PortableDomainError.code` is narrowed from the package-wide `DomainErrorCode` union exposed by package `0.2.0` to the fixed Portable Cognition `0.1.0` error-code allowlist.

The Portable Cognition contract version, package version, cognitive-object revision number, and host integration contract version remain independent. A future incompatible host outcome, port shape, replay identity, or conformance rule requires a new host contract version and retained evidence for this version.

The narrowing restores the TypeScript declaration to the already-normative Portable Cognition `0.1.0` runtime and schema behavior under `COMP-012`, but it is still source-breaking for a generic package `0.2.0` TypeScript consumer. Package `0.3.0` therefore uses the reviewed `minor-before-1.0` path. The package is private and unpublished; retaining the wider declaration as a deprecated parallel type would continue to misrepresent the normative allowlist, so deprecation is not applicable to this correction. Existing SourceRecord and Portable Cognition `0.1.0` serialized artifacts remain byte-identical.

### Portable Domain Error Migration

A package `0.2.0` consumer could assign any package-wide domain code:

```ts
declare const code: DomainErrorCode;
const portableError: PortableDomainError = { code, message, details: {} };
```

In package `0.3.0`, narrow the package-wide code before constructing a Portable Cognition domain-error payload. Consumers can use `PortableDomainError["code"]` without another public API:

```ts
declare const code: DomainErrorCode;
const portableCodes: readonly PortableDomainError["code"][] = [
  "INVALID_OBJECT",
  "INVALID_SOURCE_RECORD",
  "INVALID_RELATIONSHIP",
  "INVALID_TRANSITION",
  "CONFIRMATION_REQUIRED",
  "AUTHORIZATION_DENIED",
  "SERIALIZATION_ERROR",
  "SOURCE_REVISION_COLLISION",
  "INGESTION_LIMIT_EXCEEDED",
  "PROMOTION_FAILED",
  "INVALID_PORTABLE_COGNITION_RECORD",
];

function isPortableCode(
  code: DomainErrorCode,
): code is PortableDomainError["code"] {
  return portableCodes.includes(code as PortableDomainError["code"]);
}

if (isPortableCode(code)) {
  const portableError: PortableDomainError = {
    code,
    message,
    details: {},
  };
}
```

## Security Boundaries and Human Authority

Host integration validates Portable Cognition shapes and isolates mutable values; it does not authenticate actors, establish authorization provenance, prove a confirmation, or authorize a consequential transition. Hosts remain responsible for identity, authorization, access control, tenancy, secret filtering, retention, deletion, backups, operational monitoring, and downstream delivery controls.

The contract requires sanitized host failure outcomes so adapter exception text, secrets, paths, and operational details do not cross the portable host boundary. It also forbids ambient source-store discovery and SourceRecord use through cognition ports. Explicit provenance remains an assertion and does not prove source access, integrity, consent, truth, or organizational authority.

## Acceptance Checks

- `tests/host-conformance.test.ts` pins the exact contract rule inventory, contract version, required status semantics, source-store boundary, and final documentation links.
- `tests/host-integration.test.ts` verifies request validation, operation-specific conflict correlation, descriptor-hostile result rejection, persistence-before-publication coordination, safe failures, partial-success reporting, and identical-request recovery.
- `tests/reference-host.test.ts` exercises exact conflict precedence, unchanged reads after every returned conflict, canonical replay, atomicity, ordering, detached reads, and publisher idempotency.
- `runCognitionHostConformance` provides isolated public-port checks for complete host implementations, including malformed and SourceRecord-shaped runtime rejection, conflict-state immutability, precedence overlaps, canonical replay, and fresh factory instances; a host claiming complete conformance must pass its applicable cases.
- Compatibility and clean-consumer tests classify the `PortableDomainError.code` narrowing under `COMP-012`, compile both the rejected package `0.2.0` generic assignment and the supported package `0.3.0` narrowing pattern, and independently pin declaration closures for every public TypeScript entrypoint.
- Documentation acceptance requires the focused host suites and `git diff --check`; broader final review remains a separate gate.

## Explicit Deferrals

- A mandatory persistence engine, transaction protocol, queue, broker, subscriber API, retry scheduler, dead-letter mechanism, or exactly-once delivery guarantee.
- A production persistence adapter, remote service, connector marketplace, source-system discovery, or SourceRecord storage integration.
- Authentication, authorization-policy execution, trusted human confirmation, tenant governance, privacy operations, retention/deletion policy, security-runtime policy, or incident response.
- Package publication, removal of `"private": true`, external interoperability certification, production-readiness claims, and final-review verification.
