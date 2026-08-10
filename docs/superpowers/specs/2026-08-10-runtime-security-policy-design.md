# Runtime and Security Policy Design

**Status:** Approved for implementation

**Date:** 2026-08-10

## Problem

The SDK already enforces several security-relevant boundaries, but users must
currently reconstruct them from implementation notes, adapter guides, and
README caveats. That makes it difficult for a public adopter to distinguish:

- behavior enforced by the SDK;
- behavior demonstrated only by a conformance test;
- controls that every production host must provide; and
- capabilities the project deliberately does not claim.

The missing Phase 3 runtime and security policy must make those boundaries
portable and reviewable without selecting a mandatory identity provider,
database, network, deployment platform, or secrets system.

## Decision

Add a versioned Runtime and Security Profile `0.1.0` with two synchronized
artifacts:

1. normative prose in `spec/runtime-security.md`; and
2. a machine-readable control inventory in
   `spec/runtime-security/0.1.0/profile.json`.

Every control has a stable `RSP-*` identifier and exactly one enforcement
class:

- `sdk-enforced`: the reference SDK rejects or constrains the unsafe behavior;
- `conformance-verified`: repository checks demonstrate a property without
  turning it into a universal runtime guarantee;
- `host-required`: a production host must supply and document the control; or
- `out-of-scope`: the SDK explicitly makes no claim or guarantee.

The machine-readable profile is published through the versioned package
subpath `collective-cognition-sdk/runtime-security/0.1.0`. It is data, not a
programmable authorization engine. Package version `0.7.0` remains private and
unpublished.

## Alternatives

### Prose-Only Guidance

Rejected because prose alone cannot prove complete control coverage, stable
identifiers, valid evidence links, or package inclusion. It would preserve the
current ambiguity in a different file.

### Programmable Universal Security Policy

Rejected because authentication, encryption, tenant isolation, retention,
key management, backups, and incident response are host and deployment
responsibilities. A generic evaluator would either be too weak to protect a
real system or falsely imply production security.

### Deployment Certification

Rejected because this project cannot certify an adopter's infrastructure,
identity records, operational practices, connector configuration, or threat
model. Conformance evidence remains narrower than certification.

## Scope

### Included

- A normative Runtime and Security Profile `0.1.0` with stable `RSP-*` rules.
- A closed machine-readable control inventory with exact enforcement classes.
- Explicit rules for untrusted input, resource bounds, immutable snapshots,
  explicit targets, source/cognition separation, raw-content privacy,
  secret-safe diagnostics, authorization boundaries, and package execution.
- Explicit host requirements for authentication, authorization records,
  encryption, access isolation, retention, backup and recovery, durable event
  delivery, monitoring, dependency response, and incident handling.
- Explicit non-claims for content truth, content-hash verification,
  exactly-once delivery, production certification, and secure deployment.
- Tests that pin the profile shape, rule inventory, classifications, normative
  anchors, evidence references, package export, tarball inclusion, and clean
  consumer import.
- RFC 0008, specification and RFC index updates, README guidance, roadmap
  status, changelog entry, and compatibility baseline `0.7.0`.

### Excluded

- Authentication providers, identity proofing, or credential storage.
- Encryption libraries, key management, transport security, or network
  protocols.
- Tenant models, role models, policy languages, or permission databases.
- A durable outbox, retry worker, scheduler, hosted service, or remote API.
- Vulnerability scanning as an SDK runtime feature.
- Automatic trust, truth, confidence, evidence-quality, or authority scoring.
- Removal of `"private": true` or npm publication.

## Control Model

The profile JSON is a closed JSON object with:

- `profile`: the stable identifier `collective-cognition-runtime-security`;
- `version`: `0.1.0`;
- `status`: `normative-stable`;
- `enforcementClasses`: the exact four-class inventory;
- `controls`: an ordered array of closed control objects; and
- `nonClaims`: an ordered array of closed non-claim objects.

Each control contains:

- a unique `RSP-*` identifier;
- a concise title;
- one enforcement class;
- one normative requirement;
- one normative Markdown anchor; and
- zero or more implementation-evidence references.

Evidence references identify repository artifacts, not external services.
Tests require each referenced path and anchor to exist. A `host-required` or
`out-of-scope` item may rely only on its normative anchor because this SDK
cannot execute the adopter's control.

The profile does not contain environment-specific paths, vendor names,
credentials, repository secrets, or a claim that passing tests secures a host.

The ordered control inventory is fixed for `0.1.0`:

| ID | Class | Control |
| --- | --- | --- |
| `RSP-001` | `sdk-enforced` | Explicit external source and target selection |
| `RSP-002` | `sdk-enforced` | Logical separation of source and cognition stores |
| `RSP-003` | `sdk-enforced` | Bounded own-data snapshots for untrusted values |
| `RSP-004` | `sdk-enforced` | Detached and deeply frozen accepted boundaries |
| `RSP-005` | `sdk-enforced` | Documented ingestion resource limits |
| `RSP-006` | `sdk-enforced` | Raw source content omitted by default |
| `RSP-007` | `sdk-enforced` | Collection, promotion, persistence, and authorization remain explicit operations |
| `RSP-008` | `sdk-enforced` | Authorization policy failures and malformed decisions fail closed |
| `RSP-009` | `sdk-enforced` | Fixed secret-safe boundary diagnostics |
| `RSP-010` | `conformance-verified` | No production dependencies or install lifecycle hooks |
| `RSP-011` | `conformance-verified` | Exact package and tarball content allowlists |
| `RSP-012` | `conformance-verified` | Documented runtime and operating-system matrix |
| `RSP-013` | `conformance-verified` | Maintained team-memory connector read-only behavior |
| `RSP-014` | `conformance-verified` | Deterministic reference contracts and adapters |
| `RSP-015` | `host-required` | Authenticated actors and trusted human approvals |
| `RSP-016` | `host-required` | Access control and tenant or workspace isolation |
| `RSP-017` | `host-required` | Encryption, secret storage, rotation, and revocation |
| `RSP-018` | `host-required` | Data minimization, retention, deletion, and policy handling |
| `RSP-019` | `host-required` | Backup, restore, corruption detection, and disaster recovery |
| `RSP-020` | `host-required` | Durable cognition-event publication recovery |
| `RSP-021` | `host-required` | Monitoring, abuse limits, dependency response, and incident response |
| `RSP-022` | `host-required` | Connector-specific review before sensitive-content enablement |

The ordered non-claim inventory is also fixed, and every non-claim uses
enforcement class `out-of-scope`:

- `RSP-NC-001`: source truth, evidence quality, and semantic correctness;
- `RSP-NC-002`: authenticity of caller-supplied `contentHash` values;
- `RSP-NC-003`: exactly-once end-to-end delivery;
- `RSP-NC-004`: encryption, authentication, or tenant isolation supplied by
  the SDK; and
- `RSP-NC-005`: production security certification or secure-deployment proof.

## Normative Policy Areas

### SDK-Enforced Boundaries

The prose consolidates existing guarantees without broadening them:

- external sources and adapter targets are caller supplied explicitly;
- source stores and cognition stores remain logically distinct;
- untrusted values are captured through bounded own-data snapshots;
- accepted records and host requests are detached and deeply frozen;
- SourceRecord and CLI ingestion enforce documented byte, record, and depth
  limits;
- raw team-memory content is omitted unless explicitly requested;
- authorization policy errors, mutation, and malformed decisions fail closed;
- top-level CLI and adapter failures use fixed secret-safe diagnostics; and
- source collection does not automatically promote, persist, or authorize
  cognition.

### Conformance-Verified Properties

Repository evidence demonstrates, but does not universally certify:

- no production dependency fields or package install lifecycle hooks;
- exact package and tarball allowlists;
- tested behavior on the documented Node and operating-system matrix;
- read-only behavior of the maintained team-memory connector;
- deterministic connector, Portable Cognition, host, SQLite, and Markdown
  reference behavior; and
- immutable compatibility and normative artifact digests.

### Host-Required Controls

A production host must provide and document:

- authenticated actor and human-confirmation identity;
- trusted authorization and approval records;
- access control and tenant or workspace isolation;
- encryption in transit and at rest where required;
- secret storage, key rotation, and credential revocation;
- data minimization, retention, deletion, and legal-policy handling;
- backup, restore, corruption detection, and disaster recovery;
- durable publication recovery when event delivery matters;
- observability, audit review, abuse limits, dependency response, and incident
  response; and
- connector-specific review before enabling raw or sensitive content.

### Explicit Non-Claims

The profile states that the SDK does not prove source truth, authenticate
people, verify caller-supplied `contentHash`, guarantee exactly-once delivery,
encrypt storage, isolate tenants, secure a deployment, or certify production
readiness.

## Packaging and Compatibility

The machine profile is additive package data under a new versioned subpath.
No root runtime or type export changes. Existing `0.1.0` through `0.6.0`
compatibility artifacts remain byte-identical.

The private package advances to `0.7.0` and records one additive compatibility
case. Package tests require:

- the exact export target;
- JSON-module import from the packed clean consumer;
- the profile and normative prose in the tarball allowlist; and
- continued absence of production dependency fields and install lifecycle
  hooks.

The npm publication guard remains unchanged.

## Failure and Misuse Handling

The profile is descriptive data and does not execute. Invalid or internally
inconsistent profile bytes fail repository conformance and package checks.
Consumers must not interpret a missing host-required control as SDK approval;
the enforcement class is authoritative.

Documentation must use `MUST`, `MUST NOT`, `SHOULD`, and `MAY` only within the
defined normative scope. Security examples use fictional identifiers and no
live paths, credentials, or private source content.

## Verification

Acceptance requires:

- exact profile JSON shape and ordered rule inventory tests;
- unique IDs and exact enforcement-class validation;
- every normative anchor and evidence path resolving;
- each SDK-enforced claim mapping to existing or added executable tests;
- package export, tarball allowlist, and clean-consumer JSON import checks;
- compatibility baseline `0.7.0` and additive change-case checks;
- full `npm test`, typecheck, syntax, examples, package, audit, and diff gates;
  and
- independent final review with no unresolved Critical or Important finding.

## Documentation Reconciliation

Implementation updates:

- `README.md`;
- `CHANGELOG.md`;
- `docs/ROADMAP.md`;
- `rfcs/README.md` and RFC 0008;
- `spec/README.md`;
- compatibility prose and `0.7.0` artifacts; and
- package-development and security-boundary guidance.

Historical release records remain unchanged. The new source state must not be
described as the immutable `v0.6.0` prerelease artifact.

## Success Criteria

A public adopter can inspect one versioned artifact and answer, for every
listed security control: what the SDK enforces, what repository evidence only
demonstrates, what the host must implement, and what the project does not
claim. All answers remain source-neutral and backend-neutral.
