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
| `HIC-005` | If an initial commit replays the exact already stored object revision, the store MUST report `already_committed` and MUST NOT create another object revision. A non-identical record for that object ID and version MUST return only `{ code: "object_revision_collision", objectId }`, where `objectId` exactly equals the requested object ID; it MUST NOT include expected-version or actual-version claims. |
| `HIC-006` | A transition commit MUST use a positive expected version and a target object at exactly expected version plus one. Its event MUST name the target object's ID, type, version, state, and update time exactly through `objectId`, `objectType`, `objectVersion`, `nextState`, and `occurredAt`; incoherent requests MUST be rejected before host mutation. |
| `HIC-007` | A successful transition commit MUST make its target object revision and matching event observable together. A returned conflict MUST mean that neither newly requested record became committed state. When an adapter throws or returns an invalid result, the coordinator MUST return a failed outcome but MUST NOT claim rollback or that no write occurred: persistence may be externally ambiguous. Callers MUST retry the identical request to resolve that ambiguity through exact replay behavior. |
| `HIC-008` | A transition store MUST resolve overlapping outcomes in this exact order: exact canonical replay first; then a changed target object revision; then a changed record at the requested event ID; then a stale expected version only when the target object revision and event ID are unused. The stale result MUST be exactly `{ code: "version_conflict", objectId, expectedVersion, actualVersion }`; `objectId` and `expectedVersion` MUST equal the request, and `actualVersion` MUST be a positive safe integer different from `expectedVersion`. No returned conflict may advance latest, add or overwrite a revision, or add or overwrite an event. |
| `HIC-009` | A store MUST treat object revisions and event IDs as immutable identities. A changed target object revision MUST return only `{ code: "object_revision_collision", objectId }` with the requested object ID. A changed record at the requested event ID MUST return only `{ code: "event_id_collision", objectId, eventId }` with the requested object and event IDs. Exact coherent replays MUST report `already_committed`; neither collision may overwrite existing state. |
| `HIC-010` | The coordinator MUST persist a coherent transition before it attempts event publication. It MUST NOT invoke publication after a persistence conflict or failure. A host MAY implement this ordering with any storage mechanism that preserves the observable outcomes in this contract. |
| `HIC-011` | The coordinator MUST use the cognition event ID as the publisher idempotency key. A publisher MUST return `already_published` for an exact replay of an accepted key and event, and MUST NOT treat changed event content under that key as a successful new publication. |
| `HIC-012` | When persistence succeeds but the required publication attempt throws or returns an invalid status, the coordinator MUST return `committed_but_unpublished` with the detached committed object, event, and sanitized publication failure. At-least-once publication attempts do not guarantee exactly-once downstream effects. |
| `HIC-013` | A later identical transition request after `committed_but_unpublished` MUST be recoverable: persistence MAY report `already_committed`, and the coordinator MUST attempt publication again with the same event-ID idempotency key. Recovery MUST NOT create a new object revision or event. |
| `HIC-014` | Invalid host requests MUST fail before invoking an adapter. Coordinator conflict results MUST be captured from own data-property descriptors and validated against the operation-specific closed shapes and request correlations in `HIC-005`, `HIC-008`, and `HIC-009`; malformed, mis-correlated, extra-field, accessor-bearing, or reflection-hostile results MUST become the fixed sanitized commit failure. For coordinator-driven initial or transition commits and publication attempts, coordinator-generated `HostFailure` values for adapter exceptions, malformed commit results, and invalid publication statuses MUST use the stable sanitized commit or publication failure outcome and MUST NOT expose adapter exception text, secrets, paths, or operational details. Conformance reports MUST use their fixed sanitized failure message. This rule does not standardize thrown or rejected raw read-port operations. |
| `HIC-015` | A store MUST return the current latest object, an exact requested object version, and its events as detached deeply immutable values. `listObjectEvents` MUST order events by ascending object version and then lexical event ID; semantically identical object-key order is not a distinct record. |
| `HIC-016` | A cognition host MUST keep source storage logically separate from cognition persistence and publication. It MUST operate only on explicit store and publisher targets and MUST NOT discover, inspect, mutate, or depend on a SourceRecord store or its private schema. A host MAY retain explicit provenance references without treating source records as cognition-port values. |

## Conformance

A host claiming conformance to this contract MUST implement every rule applicable to the ports it exposes. A persistence-only host MUST satisfy the persistence and read rules but MUST NOT claim publication conformance. A complete host that exposes both ports MUST pass the reusable host conformance runner with fresh host instances for each case. A factory that reuses a store or publisher singleton does not satisfy the runner's isolation requirement.

The reference runtime separates request preparation from host adapters, provides an in-memory conformance reference, and exposes `runCognitionHostConformance`. Those components are implementation evidence, not a mandatory storage or delivery design.

## Rule-to-Check Mapping

| Rule | Enforcement |
| --- | --- |
| `HIC-001` | Source check: `tests/host-conformance.test.ts` pins the contract version and exact rule inventory; `src/host-integration.ts` exports the same runtime contract version. |
| `HIC-002` | Runtime and conformance: typed public ports expose only Portable Cognition record families, while `HIC-CONF-014` uses type-erased runtime probes to require rejection of malformed and SourceRecord-shaped values without adding SourceRecord to either port API. |
| `HIC-003` | Runtime and conformance: request/outcome snapshots and `HIC-CONF-006` prove caller isolation, detached reads, and recursive freezing. |
| `HIC-004` | Runtime: `prepareInitialCognitionCommit` validates a version-one cognitive object before an adapter call; `tests/host-integration.test.ts` and `tests/reference-host.test.ts` cover rejection. |
| `HIC-005` | Runtime and conformance: `InMemoryCognitionStore.commitInitial` uses canonical record equality; `HIC-CONF-002` and `HIC-CONF-012` cover exact and reordered initial replay. |
| `HIC-006` | Runtime: `prepareTransitionCognitionCommit` validates expected-version and object-event bindings before adapter invocation; focused host and reference-host tests cover malformed requests. |
| `HIC-007` | Conformance and prose: `HIC-CONF-003`, `HIC-CONF-004`, `HIC-CONF-005`, `HIC-CONF-007`, and `HIC-CONF-013` read latest, revisions, and events after returned conflicts; adversarial overwrite and extra-event stores prove those checks fail on mutation. Ambiguous adapter failure recovery remains governed by identical-request retry. |
| `HIC-008` | Runtime and conformance: reference-store branch order and `HIC-CONF-015` cover canonical replay, object collision, event collision, and stale-version overlaps in the required precedence, with unchanged-state reads after each failed outcome. |
| `HIC-009` | Runtime and conformance: operation-specific collision shapes plus `HIC-CONF-002`, `HIC-CONF-003`, `HIC-CONF-005`, `HIC-CONF-007`, `HIC-CONF-012`, `HIC-CONF-013`, and `HIC-CONF-015` cover replay and immutable identities. |
| `HIC-010` | Runtime: `commitCognitionTransition` commits before publisher invocation; `tests/host-integration.test.ts` verifies conflicts and commit failures do not publish. |
| `HIC-011` | Runtime and conformance: `commitCognitionTransition` derives the key from the event ID; `HIC-CONF-008` verifies exact publisher replay and `HIC-CONF-009` verifies changed-content key rejection. |
| `HIC-012` | Runtime and conformance: `committed_but_unpublished` is a fixed sanitized outcome, and `HIC-CONF-010` requires persisted object-and-event read-back after partial success. |
| `HIC-013` | Runtime and conformance: repeat coordination preserves the event-ID key; `HIC-CONF-011` verifies recovery after an earlier publication failure. |
| `HIC-014` | Runtime and conformance: `tests/host-integration.test.ts` covers operation-specific, cross-object, unsafe-version, extra-field, and descriptor-hostile conflict results; `HIC-CONF-014` covers malformed runtime values; the final conformance test covers the runner's fixed sanitized failure message. Raw read-port errors have no standardized `HostFailure` mapping. |
| `HIC-015` | Runtime and conformance: reference-host ordered reads and `HIC-CONF-006` verify deep detachment; reordered semantically identical reads remain conforming. |
| `HIC-016` | Prose-only rationale: target selection and source-store separation depend on deployment topology and cannot be established by a generic host port without inspecting a host's private environment. |

## Explicit Deferrals

- A required database, transaction protocol, queue, event transport, retry schedule, dead-letter policy, or distributed exactly-once guarantee.
- Authentication, authorization-policy execution, tenant isolation, secret management, retention, deletion, backup, recovery, observability, or incident-response policy.
- Source-store discovery, SourceRecord persistence adapters, source-schema coupling, automatic promotion, or semantic interpretation of collected material.
- Connector packaging, registry publication, hosted services, production-readiness claims, interoperability certification, and final-review verification.
