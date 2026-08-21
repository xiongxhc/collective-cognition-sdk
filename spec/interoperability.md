# Cross-Connector Interoperability Profile

## Status and Scope

This normative profile defines Cross-Connector Interoperability Profile `0.1.0`.
Its owner is `collective-cognition-sdk-maintainers`. It supplies closed,
fictional fixtures that demonstrate shared SourceRecord and Portable Cognition
semantics between `git-repository/1` and `teammem-event-ledger/1`.

The profile is reference evidence, not a registry, transport protocol,
certification, endorsement, production-readiness claim, or guarantee about
unlisted connectors.

## Rules

- **CCI-001 Connector independence.** A conforming connector MUST collect
  without importing, configuring, discovering, or invoking another connector.
- **CCI-002 Generic ingestion.** A host MUST be able to submit records from
  the listed connectors to the same generic SourceRecord ingestion boundary;
  collection MUST NOT imply interpretation or promotion.
- **CCI-003 Explicit promotion.** A host MUST create Goals, Hypotheses,
  Evidence, and every transition explicitly. A connector MUST NOT infer a
  Decision, Principle, truth, confidence, readiness, belief, or authorization.
- **CCI-004 Canonical semantic equality.** Two records are semantically equal
  only when their normalized, validated contract values are canonically equal.
  Member order, insignificant JSON formatting, and detached object identity
  MUST NOT affect the comparison.
- **CCI-005 SourceRecord round trip.** Every accepted SourceRecord MUST
  deserialize, normalize, serialize, and deserialize without changing its
  normative meaning or source revision identity.
- **CCI-006 Portable Cognition round trip.** Every valid Portable Cognition
  record MUST deserialize, serialize, and deserialize without changing its
  objects, versions, transitions, events, relationships, attribution, or
  provenance.
- **CCI-007 Source-local identity.** Duplicate and collision classification
  MUST use source-local identity. Identical source IDs or revision IDs from
  distinct source systems or instances MUST NOT become a false collision.
- **CCI-008 Extensions.** A consumer that supports an unknown namespaced
  extension MUST preserve it opaquely and exactly. A consumer that does not
  support it MAY reject it with its declared stable error. A consumer MUST NOT
  silently drop, reinterpret, or partially preserve an extension.
- **CCI-009 Error classification.** Invalid SourceRecord extensions MUST
  report `INVALID_SOURCE_RECORD`; invalid Portable Cognition extensions MUST
  report `INVALID_PORTABLE_COGNITION_RECORD`.
- **CCI-010 Fictional-data hygiene.** Profile fixtures MUST use fictional
  identities, public `example.invalid` source instances, and fixed timestamps.
  They MUST NOT include a filesystem location, email address, credential, or
  production data.
- **CCI-011 Owner duties.** The owner MUST maintain the profile, fixtures,
  conformance test, RFC, and compatibility inventory. Connector owners remain
  responsible for source access, privacy, support, and release policy.
- **CCI-012 Replacement and versioning.** This version is immutable. A
  replacement MUST use a new versioned profile directory and state its
  compatibility effect; it MUST NOT rewrite `0.1.0` artifacts.
- **CCI-013 Non-certification.** Passing these fixtures MAY demonstrate this
  profile's reference outcomes. It MUST NOT certify an external connector,
  authorize publication, or claim production readiness.

## Versioned Artifacts

`0.1.0` consists of `profile.json`, `source-records.jsonl`,
`portable-cognition.jsonl`, and `error-cases.jsonl` in its versioned profile
directory. Every JSONL line is a complete independent JSON record. Consumers
MUST read fixture resources as UTF-8 text and MUST NOT treat JSONL as an ES
module.

The five source fixtures contain an accepted team-memory mapping, a source-local
duplicate, a source-local revision collision, an independent Git mapping, and a
Git mapping that shares the team-memory `commit:<oid>` source ID and `<oid>`
revision ID while retaining its distinct source system and instance. Git OIDs
are lowercase 40-hexadecimal identifiers; team-memory fields follow its
`person:source` and `hash` mapping. The portable fixtures contain an explicit
Goal and Hypothesis, neutral Evidence attributable to both source systems, an
explicit Hypothesis transition and matching Event, and one opaque namespaced
extension. They intentionally contain no Decision or Principle.
