# Host Integration Contract 0.1.0

## Status and Scope

This document defines the Normative Stable host integration contract for cognition persistence and event publication. Contract version: `0.1.0`.

It applies to a host that implements the public `CognitionStore` and, when it publishes cognition events, `CognitionEventPublisher` ports. It defines observable commit, publication, replay, collision, read, and failure behavior without selecting a database, transaction manager, queue, transport, retry scheduler, or delivery architecture.

The [Portable Cognition Contract](portable-cognition.md) defines the serialized records exchanged at this boundary. This contract does not authenticate identities, execute authorization policy, establish source access, or make a publication recipient's side effects exactly once.

## Terminology

- **Initial commit:** Persistence of a version-one `cognitive-object` record.
- **Transition commit:** One optimistic-concurrency write of a successor `cognitive-object` record and its matching `cognition-event` record.
- **Exact replay:** The same canonical Portable Cognition record or coherent transition request is submitted again.
- **Collision:** An existing object revision or event ID is submitted with non-identical record content.
- **Publication attempt:** One call to publish a persisted cognition event using its event ID as the idempotency key.
- **Committed but unpublished:** Persistence succeeded, but the required publication attempt did not produce a valid publication status.
- **Explicit target:** A store or publisher instance supplied directly by the host application; it is not discovered from ambient configuration, local files, or a source system.

## Normative Rules

| Rule | Normative requirement |
| --- | --- |
| `HIC-001` | A conforming host integration MUST implement Contract version `0.1.0` and MUST expose only the port behavior defined by this document for that version. A later incompatible host contract MUST use a new contract version rather than silently repurposing these outcomes. |
| `HIC-002` | A `CognitionStore` and `CognitionEventPublisher` MUST accept only validated Portable Cognition `cognitive-object` and `cognition-event` records for this contract. A SourceRecord MUST NOT be submitted as a cognition object or event, persisted through these cognition ports, or published through the cognition-event port. |
| `HIC-003` | Before validation, persistence, publication, or return, an implementation MUST create detached snapshots of accepted Portable Cognition records. It MUST NOT retain caller-owned mutable references, and returned records, conflicts, and outcome values MUST be detached and deeply immutable. |
| `HIC-004` | An initial commit MUST contain one valid `cognitive-object` record with `payload.version` equal to `1`. Its `payload.id` identifies the logical object, while its object revision is identified by the ordered pair of object ID and version. Implementations MUST reject another initial shape before it can change host state. |
| `HIC-005` | If an initial commit replays the exact already stored object revision, the store MUST report `already_committed` and MUST NOT create another object revision. A non-identical record for that object ID and version MUST follow the collision behavior. |
| `HIC-006` | A transition commit MUST use a positive expected version and a target object at exactly expected version plus one. Its event MUST name the target object's ID, type, version, state, and update time exactly through `objectId`, `objectType`, `objectVersion`, `nextState`, and `occurredAt`; incoherent requests MUST be rejected before host mutation. |
| `HIC-007` | A successful transition commit MUST make its target object revision and matching event observable together. A rejected, failed, or colliding transition MUST NOT expose either newly requested record as committed state. |
| `HIC-008` | A transition commit MUST compare its expected version with the object's current latest version at commit time. A mismatch MUST return a machine-readable `version_conflict` and MUST NOT advance the latest version or add the requested object or event. |
| `HIC-009` | A store MUST treat object revisions and event IDs as immutable identities. It MUST report `object_revision_collision` for a changed record at an existing object ID and version, and `event_id_collision` for a changed record at an existing event ID. It MUST NOT overwrite either existing record; exact coherent replays MUST report `already_committed`. |
| `HIC-010` | The coordinator MUST persist a coherent transition before it attempts event publication. It MUST NOT invoke publication after a persistence conflict or failure. A host MAY implement this ordering with any storage mechanism that preserves the observable outcomes in this contract. |
| `HIC-011` | The coordinator MUST use the cognition event ID as the publisher idempotency key. A publisher MUST return `already_published` for an exact replay of an accepted key and event, and MUST NOT treat changed event content under that key as a successful new publication. |
| `HIC-012` | When persistence succeeds but the required publication attempt throws or returns an invalid status, the coordinator MUST return `committed_but_unpublished` with the detached committed object, event, and sanitized publication failure. At-least-once publication attempts do not guarantee exactly-once downstream effects. |
| `HIC-013` | A later identical transition request after `committed_but_unpublished` MUST be recoverable: persistence MAY report `already_committed`, and the coordinator MUST attempt publication again with the same event-ID idempotency key. Recovery MUST NOT create a new object revision or event. |
| `HIC-014` | Invalid host requests MUST fail before invoking an adapter. Adapter exceptions, malformed adapter results, and invalid publication statuses MUST fail closed with the stable sanitized host failure outcomes; implementations MUST NOT expose adapter exception text, secrets, paths, or operational details through those outcomes. |
| `HIC-015` | A store MUST return the current latest object, an exact requested object version, and its events as detached deeply immutable values. `listObjectEvents` MUST order events by ascending object version and then lexical event ID; semantically identical object-key order is not a distinct record. |
| `HIC-016` | A cognition host MUST keep source storage logically separate from cognition persistence and publication. It MUST operate only on explicit store and publisher targets and MUST NOT discover, inspect, mutate, or depend on a SourceRecord store or its private schema. A host MAY retain explicit provenance references without treating source records as cognition-port values. |

## Conformance

A host claiming conformance to this contract MUST implement every rule applicable to the ports it exposes. A persistence-only host MUST satisfy the persistence and read rules but MUST NOT claim publication conformance. A complete host that exposes both ports MUST pass the reusable host conformance runner with fresh host instances for each case.

The reference runtime separates request preparation from host adapters, provides an in-memory conformance reference, and exposes `runCognitionHostConformance`. Those components are implementation evidence, not a mandatory storage or delivery design.

## Rule-to-Check Mapping

| Rule | Enforcement |
| --- | --- |
| `HIC-001` | Source check: `tests/host-conformance.test.ts` pins the contract version and exact rule inventory; `src/host-integration.ts` exports the same runtime contract version. |
| `HIC-002` | Runtime and conformance: typed public ports accept Portable Cognition record families; `HIC-CONF-011` verifies only cognitive-object and cognition-event records reach ports. |
| `HIC-003` | Runtime and conformance: request/outcome snapshots and `HIC-CONF-006` prove caller isolation, detached reads, and recursive freezing. |
| `HIC-004` | Runtime: `prepareInitialCognitionCommit` validates a version-one cognitive object before an adapter call; `tests/host-integration.test.ts` and `tests/reference-host.test.ts` cover rejection. |
| `HIC-005` | Runtime and conformance: `InMemoryCognitionStore.commitInitial` classifies exact replays, with the initial replay case in `tests/reference-host.test.ts`. |
| `HIC-006` | Runtime: `prepareTransitionCognitionCommit` validates expected-version and object-event bindings before adapter invocation; focused host and reference-host tests cover malformed requests. |
| `HIC-007` | Conformance: `HIC-CONF-007` requires object-and-event read-back after success and no partial visibility after a rejected event collision. |
| `HIC-008` | Runtime and conformance: store conflict handling and `HIC-CONF-004` verify stale-version rejection without new state. |
| `HIC-009` | Runtime and conformance: reference-store collision checks plus `HIC-CONF-003`, `HIC-CONF-005`, and `HIC-CONF-007` cover replay and immutable identities. |
| `HIC-010` | Runtime: `commitCognitionTransition` commits before publisher invocation; `tests/host-integration.test.ts` verifies conflicts and commit failures do not publish. |
| `HIC-011` | Runtime and conformance: the coordinator derives the key from the event ID, while `HIC-CONF-008` verifies publisher replay and changed-key rejection. |
| `HIC-012` | Runtime and conformance: `committed_but_unpublished` is a fixed sanitized outcome, and `HIC-CONF-010` requires persisted object-and-event read-back after partial success. |
| `HIC-013` | Runtime and conformance: repeat coordination preserves the event-ID key; `HIC-CONF-011` verifies recovery after an earlier publication failure. |
| `HIC-014` | Runtime and conformance: descriptor-safe boundary validation and sanitized catches are covered by focused host tests and conformance-case isolation. |
| `HIC-015` | Runtime and conformance: reference-host ordered reads and `HIC-CONF-006` verify deep detachment; reordered semantically identical reads remain conforming. |
| `HIC-016` | Prose-only rationale: target selection and source-store separation depend on deployment topology and cannot be established by a generic host port without inspecting a host's private environment. |

## Explicit Deferrals

- A required database, transaction protocol, queue, event transport, retry schedule, dead-letter policy, or distributed exactly-once guarantee.
- Authentication, authorization-policy execution, tenant isolation, secret management, retention, deletion, backup, recovery, observability, or incident-response policy.
- Source-store discovery, SourceRecord persistence adapters, source-schema coupling, automatic promotion, or semantic interpretation of collected material.
- Connector packaging, registry publication, hosted services, production-readiness claims, interoperability certification, and final-review verification.
