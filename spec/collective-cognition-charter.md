# Collective Cognition Charter 1.0.0

## Status and Scope

This Charter defines the language-neutral Collective Cognition core. It composes
the immutable [SourceRecord `0.1.0` contract](source-record.md), [Portable
Cognition `0.1.0` contract](portable-cognition.md), [Host Integration `0.1.0`
contract](host-integration.md), [Runtime and Security Profile `0.1.0`](runtime-security.md),
and [compatibility policy](compatibility.md). It does not alter the bytes or
meaning of those versioned resources.

The Charter version, contract versions, schema versions, cognitive-object
revisions, policy identities, and package versions are separate domains. Its
rules use the RFC 2119 requirement keywords in their ordinary normative sense.

## Normative Rules

### CCC-001 — Version Domains

The Charter version is `1.0.0`. Implementations MUST preserve the independent
version domains defined by the compatibility policy: the SourceRecord,
Portable Cognition, and Host Integration `0.1.0` contracts; each schema
artifact; a cognitive object's revision; a policy identity; and the package.
An implementation MUST NOT treat a package release or Charter version as a
replacement for an existing record or schema version.

### CCC-002 — JSON and Lexical Profile

Serialized Charter records MUST use the JSON, finite IEEE 754 binary64 number,
Unicode-scalar string, duplicate-member rejection, and lone-surrogate rejection
profiles defined by Portable Cognition and SourceRecord. A full implementation
MUST apply the lexical checks before ordinary parsing loses that information,
and MUST enforce the applicable bounded JSON-container depth before recursive
processing.

### CCC-003 — Source Observation Boundary

A SourceRecord MUST remain a neutral observation at the source boundary.
Collection MUST NOT imply Evidence, Decision, Principle, truth, belief,
confidence, organizational acceptance, authorization, or human confirmation.
SourceRecord validation and ingestion remain governed by the SourceRecord
contract; this Charter adds no source-system discovery or semantic inference.

### CCC-004 — Cognitive-Object Envelope

A portable cognitive object MUST be carried in the `cognitive-object` family of
the Portable Cognition `0.1.0` envelope and satisfy its closed discriminator,
version, common fields, type-state correlation, isolation, and immutability
requirements. A standalone projection, when supplied, MUST accept a payload if
and only if its implicit canonical Portable Cognition envelope conforms.

### CCC-005 — Attribution Roles

A cognitive object, transition context, authorization decision, and cognition
event MUST preserve distinct non-empty initiator, executor, and accountable
attribution roles as required by Portable Cognition. Matching identifiers do
not collapse these roles. Attribution records an assertion of responsibility;
it MUST NOT be treated as authentication or proof of authority.

### CCC-006 — Provenance References

A cognitive object and consequential cognition event MUST preserve the
non-empty provenance references required by Portable Cognition. A provenance
reference MUST identify its declared source and capture time without silently
rewriting source material. Provenance MUST NOT be treated as proof of source
quality, truth, consent, authorization, or organizational acceptance.

### CCC-007 — Identity Semantics

An `identity` cognitive object MUST use the Portable Cognition identity type
and its permitted state/data shape. It represents a cognition-relevant subject
or actor reference in a declared context; it MUST NOT establish a global,
authenticated, or authorized identity.

### CCC-008 — Goal Semantics

A `goal` cognitive object MUST use the Portable Cognition goal type and its
permitted state/data shape. It represents an explicit intended outcome in its
declared context; it MUST NOT be inferred from collected activity or treated as
an approved organizational commitment.

### CCC-009 — Hypothesis Semantics

A `hypothesis` cognitive object MUST use the Portable Cognition hypothesis type
and its permitted state/data shape. It MUST declare its required
`supports-goal` relationship and MUST remain an explicit proposition subject to
testing rather than a statement of truth.

### CCC-010 — Experiment Semantics

An `experiment` cognitive object MUST use the Portable Cognition experiment
type and its permitted state/data shape. It MUST declare its required
`tests-hypothesis` relationship and MUST NOT be represented as a completed
claim before its lifecycle state and attributed evidence support that status.

### CCC-011 — Evidence Semantics

An `evidence` cognitive object MUST use the Portable Cognition evidence type
and its permitted state/data shape. It MUST preserve its declared provenance
and evidence relationship. Evidence MAY support or challenge a hypothesis or
be observed in an experiment, but it MUST NOT itself establish truth, a
Decision, or a Principle.

### CCC-012 — Decision Semantics

A `decision` cognitive object MUST use the Portable Cognition decision type and
its permitted state/data shape. It MUST declare the required goal, justification,
option, and accountable-identity relationships. A Decision MUST be created
explicitly and MUST NOT be inferred from source collection, evidence, or an
automation result.

### CCC-013 — Principle Semantics

A `principle` cognitive object MUST use the Portable Cognition principle type
and its permitted state/data shape. It MUST declare a Decision or Evidence
justification relationship. A Principle MUST NOT be treated as an organizational
truth, universal policy, or authority outside the declared context.

### CCC-014 — Relationships and Reference Integrity

Relationships MUST use Portable Cognition's closed relationship shape,
enumeration, duplicate handling, and each object family's required groups.
When a target is a cognitive object, a conforming linked corpus or host MUST
resolve it to the required compatible target type; an opaque external option
symbol is permitted only for `considers-option`. A relationship MUST NOT create
or mutate a missing target object.

| Relationship | Declaring object family | Required target |
| --- | --- | --- |
| `parent-goal` | Goal | Goal |
| `supports-goal` | Hypothesis, Decision | Goal |
| `tests-hypothesis` | Experiment | Hypothesis |
| `supports-hypothesis` | Evidence | Hypothesis |
| `challenges-hypothesis` | Evidence | Hypothesis |
| `relates-to-hypothesis` | Evidence | Hypothesis |
| `observed-in-experiment` | Evidence | Experiment |
| `informs-decision` | Decision | Decision |
| `considers-option` | Decision | Opaque external option symbol, not a cognitive object |
| `accountable-identity` | Decision | Identity |
| `justified-by-decision` | Principle | Decision |
| `justified-by-evidence` | Decision, Principle | Evidence |

### CCC-015 — Lifecycle Transitions

An object state change MUST use an allowed Portable Cognition lifecycle edge and
create a successor revision rather than mutating historical state. A conforming
implementation MUST reject a same-state, forbidden, or mismatched transition
with the applicable stable domain error. The linked transition corpus defines
the cross-record evidence for this rule.

| Object family | Allowed state transitions |
| --- | --- |
| Identity | `active → inactive`, `inactive → active` |
| Goal | `draft → active`; `active → at_risk`, `paused`, `achieved`, `abandoned`, or `revised` |
| Hypothesis | `proposed → under_review`; `under_review → testing`; `testing → supported`, `refuted`, or `inconclusive` |
| Experiment | `planned → active` or `cancelled`; `active → completed` or `cancelled` |
| Evidence | `collected → assessed`; `assessed → accepted`, `disputed`, `rejected`, or `expired` |
| Decision | `draft → proposed`; `proposed → approved` or `rejected`; `approved → active`; `active → superseded`; `superseded → archived` |
| Principle | `proposed → trial` or `rejected`; `trial → adopted` or `rejected`; `adopted → revised` or `retired` |

### CCC-016 — Cognition Events

A cognition event MUST use the Portable Cognition `cognition-event` family and
its closed correlation, event-type, automation-mode, consequence-level,
rationale, attribution, provenance, and timestamp rules. It MUST bind to the
resulting object ID, type, version, state, and update time, and MUST remain an
append-only historical record.

### CCC-017 — Authorization Decisions

An authorization decision MUST use the Portable Cognition
`authorization-decision` family and the applicable transition context. A
protected transition MUST fail closed unless an exact allowed decision applies;
an implementation MUST NOT infer authorization from attribution, provenance,
source access, or a prior event. Policy selection and execution remain
host-owned.

### CCC-018 — Human Confirmation

When Portable Cognition requires human confirmation for a consequential
transition, the event MUST contain confirmation bound to the same object,
target state, event, and timeline. Confirmation metadata is an assertion and
MUST NOT be treated as authentication, verified consent, or proof that a host
enforced an approval policy.

### CCC-019 — Explicit Promotion

Promotion from accepted SourceRecords to Evidence MUST be an explicit,
attributed policy action with preserved source provenance, policy identity, and
rationale. A promotion failure MUST preserve the observable ingestion result.
Neither collection nor promotion MUST infer a Decision or Principle.

### CCC-020 — Stable Domain Errors

Conforming root implementations MUST expose exactly this twelve-code stable
`DomainErrorCode` catalog for applicable failures:

| Root code | Condition boundary |
| --- | --- |
| `INVALID_OBJECT` | Cognitive-object validation failure |
| `INVALID_SOURCE_RECORD` | SourceRecord structural failure |
| `INVALID_RELATIONSHIP` | Relationship validation failure |
| `INVALID_TRANSITION` | Lifecycle transition failure |
| `CONFIRMATION_REQUIRED` | Required human confirmation is absent or invalid |
| `AUTHORIZATION_DENIED` | Closed authorization decision denies an operation |
| `SERIALIZATION_ERROR` | JSON text cannot be safely serialized or parsed |
| `SOURCE_REVISION_COLLISION` | A source revision key has changed canonical content |
| `INGESTION_LIMIT_EXCEEDED` | Configured ingestion resource limit is exceeded |
| `PROMOTION_FAILED` | Explicit promotion policy or mapping fails |
| `INVALID_PORTABLE_COGNITION_RECORD` | Portable Cognition record is invalid |
| `INVALID_HOST_INTEGRATION_REQUEST` | Host Integration request is invalid |

Portable Cognition retains its immutable eleven-code domain-error allowlist:

| Portable Cognition code | Condition boundary |
| --- | --- |
| `INVALID_OBJECT` | Cognitive-object validation failure |
| `INVALID_SOURCE_RECORD` | SourceRecord structural failure |
| `INVALID_RELATIONSHIP` | Relationship validation failure |
| `INVALID_TRANSITION` | Lifecycle transition failure |
| `CONFIRMATION_REQUIRED` | Required human confirmation is absent or invalid |
| `AUTHORIZATION_DENIED` | Closed authorization decision denies an operation |
| `SERIALIZATION_ERROR` | JSON text cannot be safely serialized or parsed |
| `SOURCE_REVISION_COLLISION` | A source revision key has changed canonical content |
| `INGESTION_LIMIT_EXCEEDED` | Configured ingestion resource limit is exceeded |
| `PROMOTION_FAILED` | Explicit promotion policy or mapping fails |
| `INVALID_PORTABLE_COGNITION_RECORD` | Portable Cognition record is invalid |

The root-only `INVALID_HOST_INTEGRATION_REQUEST` code MUST NOT be added to the
immutable Portable Cognition allowlist. Messages and details MUST remain
secret-safe at the applicable boundary; their presentation is not portable API
unless a composed contract says otherwise.

### CCC-021 — Host Security Boundary

Hosts MUST supply authentication, access control, workspace or tenant
isolation, encryption, secret management, retention, recovery, monitoring, and
incident response where their deployment requires them. The SDK MUST NOT claim
to supply those controls merely because records conform to this Charter or its
composed Runtime and Security Profile.

### CCC-022 — Persistence and Publication Boundary

Persistence and publication MUST use only explicit Host Integration targets
when a host elects to provide them. A host MUST persist a coherent transition
before publication, use the event ID as the publication idempotency key, and
preserve `committed_but_unpublished` recovery semantics. This Charter MUST NOT
select a database, queue, transport, transaction manager, retry scheduler, or
exactly-once delivery mechanism.

### CCC-023 — Namespaced Extensions

Extensions MUST use the namespaced extension constraints of the composed
SourceRecord and Portable Cognition contracts. An implementation MUST reject
unnamespaced extension keys and MUST preserve valid extension values exactly or
reject them explicitly; it MUST NOT silently reinterpret, discard, or promote
them into core semantics.

### CCC-024 — Conformance Claims

An implementation claiming Charter conformance MUST identify the versioned
schemas, fixtures, tests, and prose-only requirements applicable to its role.
It MUST pass every applicable valid and invalid fixture and expose the expected
stable errors. Passing a schema, test suite, or reference implementation MUST
NOT imply interoperability with untested systems, certification, endorsement,
or production readiness.

### CCC-025 — Explicit Non-Claims

This Charter does not define organizational truth, consensus, endorsement,
belief, confidence calibration, automatic classification, automatic promotion,
mandatory retention, a global identity provider, universal source quality,
host authentication, policy execution, a persistence technology, a transport,
or a production certification. It MUST NOT be interpreted as a standards body,
an npm publication authorization, an LTS commitment, or a guarantee of
exactly-once downstream effects.

## Rule-to-Evidence Plan

Evidence marked `current` exists in this checkout. Evidence marked `deferred`
is reserved for the named later task and is not current conformance evidence.

| Rule | Evidence type | Evidence status | Evidence target |
| --- | --- | --- | --- |
| CCC-001 | prose-only | current | [Compatibility policy](compatibility.md) |
| CCC-002 | fixture | current | [Portable Cognition fixtures](conformance/0.1.0/portable-cognition/invalid.jsonl) |
| CCC-003 | fixture | current | [SourceRecord fixtures](conformance/0.1.0/source-record/valid.jsonl) |
| CCC-004 | schema | current | [Portable Cognition schema](schemas/0.1.0/portable-cognition.schema.json) |
| CCC-005 | schema | current | [Portable Cognition schema](schemas/0.1.0/portable-cognition.schema.json) |
| CCC-006 | schema | current | [Portable Cognition schema](schemas/0.1.0/portable-cognition.schema.json) |
| CCC-007 | fixture | current | [Portable Cognition fixtures](conformance/0.1.0/portable-cognition/valid.jsonl) |
| CCC-008 | fixture | current | [Portable Cognition fixtures](conformance/0.1.0/portable-cognition/valid.jsonl) |
| CCC-009 | fixture | current | [Portable Cognition fixtures](conformance/0.1.0/portable-cognition/valid.jsonl) |
| CCC-010 | fixture | current | [Portable Cognition fixtures](conformance/0.1.0/portable-cognition/valid.jsonl) |
| CCC-011 | fixture | current | [Portable Cognition fixtures](conformance/0.1.0/portable-cognition/valid.jsonl) |
| CCC-012 | fixture | current | [Portable Cognition fixtures](conformance/0.1.0/portable-cognition/valid.jsonl) |
| CCC-013 | fixture | current | [Portable Cognition fixtures](conformance/0.1.0/portable-cognition/valid.jsonl) |
| CCC-014 | test | deferred | Deferred to Task 4: linked relationship conformance |
| CCC-015 | test | deferred | Deferred to Task 4: linked lifecycle conformance |
| CCC-016 | fixture | current | [Portable Cognition fixtures](conformance/0.1.0/portable-cognition/cognitive-loop.jsonl) |
| CCC-017 | fixture | current | [Portable Cognition fixtures](conformance/0.1.0/portable-cognition/valid.jsonl) |
| CCC-018 | fixture | current | [Portable Cognition fixtures](conformance/0.1.0/portable-cognition/invalid.jsonl) |
| CCC-019 | test | current | [`tests/promotion.test.ts`](../tests/promotion.test.ts) |
| CCC-020 | test | current | [`tests/portable-cognition.test.ts`](../tests/portable-cognition.test.ts) |
| CCC-021 | prose-only | current | [Runtime and Security Profile](runtime-security.md) |
| CCC-022 | test | current | [`tests/host-conformance.test.ts`](../tests/host-conformance.test.ts) |
| CCC-023 | fixture | current | [SourceRecord extension fixtures](conformance/0.1.0/source-record/invalid.jsonl) |
| CCC-024 | test | current | [`tests/charter.test.ts`](../tests/charter.test.ts) |
| CCC-025 | prose-only | current | [Runtime and Security Profile](runtime-security.md) |
