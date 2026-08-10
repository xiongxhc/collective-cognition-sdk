# Runtime and Security Profile 0.1.0

## Status and Scope

This document defines profile version `0.1.0` for the normative runtime and
security boundary carried by private package version `0.7.0`. It states what
the SDK enforces, what repository conformance demonstrates, what a production
host must supply, and what the project explicitly does not claim. The profile
is source-neutral, backend-neutral, and deployment-neutral. Host-required
controls remain unsatisfied until a host implements and verifies them in its
own environment.

## Terms

A **host** is the application or service that embeds this SDK and provides its
identity, policy, infrastructure, and operations. **Conformance evidence** is a
repository artifact that demonstrates a documented property of the reference
source tree. **Certification** is a deployment or organizational assurance
claim and is outside the scope of this profile.

## Enforcement Classes

- `sdk-enforced`: the reference SDK rejects or constrains the unsafe behavior.
- `conformance-verified`: repository checks demonstrate a property without
  turning it into a universal runtime guarantee.
- `host-required`: a production host must supply and document the control.
- `out-of-scope`: the SDK explicitly makes no claim or guarantee.

## SDK-Enforced Controls

### RSP-001 — Explicit External Selection

The SDK MUST require callers to select external sources, connectors, and target
adapters explicitly and MUST NOT infer a hidden upstream or downstream system.
This boundary is limited to explicit runtime API and CLI selection and does not
choose an identity provider, database, network, or deployment platform.

### RSP-002 — Logical Store Separation

The SDK MUST preserve a logical separation between source stores and cognition
stores and MUST NOT merge raw source persistence with cognition persistence into
one implicit state boundary. This boundary describes contract separation and
does not claim physical isolation, encryption, or tenant partitioning.

### RSP-003 — Bounded Own-Data Snapshots

The SDK MUST capture untrusted values through bounded own-data snapshots and
MUST NOT traverse arbitrary inherited or cyclic structures as trusted input.
This boundary applies to accepted untrusted values and does not authenticate
the caller that supplied them.

### RSP-004 — Detached Frozen Accepted Boundaries

The SDK MUST detach and deeply freeze accepted boundary records before
downstream use and MUST NOT expose mutable accepted structures for later
mutation. This boundary covers accepted records and requests inside the SDK and
does not secure storage or transport after the host persists them elsewhere.

### RSP-005 — Documented Ingestion Resource Limits

The SDK MUST enforce documented byte, record, and depth limits during
ingestion and MUST NOT accept unbounded source payload expansion. This
boundary covers reference ingestion paths only and does not replace host-wide
capacity planning or rate limiting.

### RSP-006 — Raw Source Content Omitted by Default

The SDK MUST omit raw team-memory source content by default and MUST NOT expose
raw source content unless a caller chooses an explicit content-bearing path.
This boundary covers default SDK behavior and does not approve host access
policy for sensitive content.

### RSP-007 — Explicit Collection Promotion Persistence and Authorization

The SDK MUST require collection, promotion, persistence, and authorization to
remain explicit operations and MUST NOT auto-promote raw source material into
authorized cognition. This boundary excludes background schedulers, policy
records, and approval workflows that a host may add separately.

### RSP-008 — Fail-Closed Authorization Decisions

The SDK MUST fail closed when authorization policy evaluation is malformed,
mutated, or erroneous and MUST NOT treat ambiguous authorization input as an
approval. This boundary covers the reference authorization contract and does
not supply the host's identity records or approval authority.

### RSP-009 — Secret-Safe Boundary Diagnostics

The SDK MUST emit fixed secret-safe boundary diagnostics for documented top
level failures and MUST NOT include live credentials or private source content
in those diagnostics. This boundary covers SDK-controlled error surfaces and
does not sanitize arbitrary host logging pipelines.

## Conformance-Verified Controls

### RSP-010 — Package Install Surface

Repository conformance MUST verify that the package declares no production
dependency fields and no install lifecycle hooks. This boundary describes the
reviewed package surface of this source tree and does not certify third-party
mirrors or repackaged distributions.

### RSP-011 — Package Content Allowlists

Repository conformance MUST verify that the packaged artifact contains only the
documented allowlisted runtime, specification, and documentation files for the
published contract surface. This boundary covers artifact composition and does
not certify how a downstream registry or mirror serves that artifact.

### RSP-012 — Documented Runtime Matrix

Repository conformance MUST document and verify the supported Node and
operating-system matrix for the reference source tree. This boundary is a
tested compatibility statement and does not certify a host deployment or its
local environment.

### RSP-013 — Maintained Read-Only Team-Memory Connector

Repository conformance MUST verify that the maintained team-memory connector
preserves documented read-only behavior. This boundary applies only to the
maintained connector in this repository and does not certify external
connectors or host-side wrapper code.

### RSP-014 — Deterministic Reference Behavior

Repository conformance MUST verify deterministic behavior for the documented
reference adapters, conformance fixtures, and contract examples. This boundary
applies to the reference behavior exercised by repository checks and does not
guarantee exactly-once delivery or deterministic host infrastructure.

## Host-Required Controls

### RSP-015 — Authenticated Human Authority

A production host MUST authenticate actors and trusted human approvals before
using this SDK for protected operations. This profile does not define the
identity provider, credential proofing, or approval workflow a host uses.

### RSP-016 — Access Control and Workspace Isolation

A production host MUST enforce access control and tenant or workspace isolation
where required by its deployment. This profile does not define a role model,
permission database, or network isolation strategy.

### RSP-017 — Encryption and Secret Management

A production host MUST provide encryption, secret storage, rotation, and
revocation where required by its threat model and policy. This profile does not
ship encryption libraries, key management, or credential vaulting.

### RSP-018 — Data Minimization and Retention Handling

A production host MUST implement data minimization, retention, deletion, and
legal-policy handling for the data it collects or persists. This profile does
not decide what the host stores or how long it keeps it.

### RSP-019 — Backup Restore and Recovery

A production host MUST implement backup, restore, corruption detection, and
disaster recovery for the systems that matter to its deployment. This profile
does not provide operational backup tooling or recovery certification.

### RSP-020 — Durable Cognition-Event Publication Recovery

A production host MUST supply durable publication recovery when cognition-event
delivery matters to its application. This profile does not ship an outbox,
retry worker, or scheduler.

### RSP-021 — Monitoring Abuse Limits and Incident Response

A production host MUST provide monitoring, abuse limits, dependency response,
and incident response appropriate to its deployment. This profile does not run
the host's observability stack or operational procedures.

### RSP-022 — Sensitive Connector Review

A production host MUST complete connector-specific review before enabling raw
or sensitive content flows. This profile does not approve a connector for a
host's legal, privacy, or security obligations.

## Explicit Non-Claims

### RSP-NC-001 — Source Truth and Semantic Quality

The SDK does not claim that collected source material is true, complete,
well-evidenced, or semantically correct.

### RSP-NC-002 — Caller-Supplied Content Hash Authenticity

The SDK does not claim that a caller-supplied `contentHash` value is authentic
or independently verified.

### RSP-NC-003 — Exactly-Once End-to-End Delivery

The SDK does not claim exactly-once end-to-end delivery across host queues,
storage, connectors, or downstream systems.

### RSP-NC-004 — SDK-Supplied Deployment Security

The SDK does not claim to supply deployment authentication, encryption, tenant
isolation, or other host security controls by itself.

### RSP-NC-005 — Production Security Certification

The SDK does not claim to certify that a host deployment is secure, compliant,
or production-ready.

## Conformance and Certification Boundary

Passing repository conformance demonstrates that this source tree matches the
documented profile inventory and evidence links. Conformance is not
certification. Host-required controls remain pending until the adopting host
implements and verifies them in its own environment.

## Versioning

This profile is versioned. Any semantic addition, removal, or reclassification
of a control or non-claim MUST create a new versioned profile artifact and an
updated normative document that preserves prior published versions.
