# RFC 0004: Host Integration Contract

**Status:** Implemented and final-review verified

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
- Documentation acceptance and final verification require the focused host suites, the complete local matrix, scoped re-review, and `git diff --check`; all have passed for this slice.

## Final Verification Evidence

- Fresh controller verification at head `26aa692a3e82b1aed8d69c9cfa797258cddcc3d7` passes all `56` focused Host Integration, reference-host, and conformance tests.
- `npm test` passes `250` source, `10` combined SourceRecord and Portable Cognition schema, `14` compatibility, and `8` package tests (`282` total), all with zero failures.
- `npx tsc --noEmit`, `npm run check`, `npm run example`, `npm run example:portable`, `npm run example:host`, `npm run pack:check`, and `git diff --check` exit successfully.
- The host example reports initial `committed`, first transition `committed_but_unpublished`, retry transition `committed`, latest version `2`, one stored event, and one published event.
- The final broad review findings are corrected, and the residual scoped re-review reports no Critical or Important blocker.
- Compatibility hashes: baseline `0.1.0` `4e0c857ad8d115735aa8df99e9d524af55d3a6efae8ead7473b97c5201f5f89b`; baseline `0.2.0` `3da00ab49c1f3b02bfc19226545dce68379546641f418993f632851b8c49ddc4`; baseline `0.3.0` `02991abb5133a4aef2b6a2fc736567fbbde9e29859909f806f08822fcd40d3d4`; change cases `0.3.0` `1f1ff3822de318806640357bb11804a0213d7084f05350035f8bb8d519dd95f2`.
- Host Integration prose hash: `41d2094f60a096540983bdeb9be5320d43136a8519b9e3ce2336c20f788f7bd7`.
- Public declaration closure hashes: root `7f9e352c9adf8a48d433d280c8040ddad57240726276a15d690133b3dfcf7333`; host-conformance `4cb58d68d6796cc77a8dfdb5a31013e441c99142bbb5bc62a91e5e71d64db94b`; reference-host `1447986d26b53d77a083fe414da8d744056df30db4e0094bb28a656d0f8965b2`.

## Explicit Deferrals

- A mandatory persistence engine, transaction protocol, queue, broker, subscriber API, retry scheduler, dead-letter mechanism, or exactly-once delivery guarantee.
- A production persistence adapter, remote service, connector marketplace, source-system discovery, or SourceRecord storage integration.
- Authentication, authorization-policy execution, trusted human confirmation, tenant governance, privacy operations, retention/deletion policy, security-runtime policy, or incident response.
- Package publication, removal of `"private": true`, external interoperability certification, and production-readiness claims.
