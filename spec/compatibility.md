# Compatibility, Versioning, and Deprecation

## Policy Versions

Every compatibility baseline records the `packagePolicyVersion` that governed its release. This document publishes two policy versions.

| `packagePolicyVersion` | Delimited section | Recorded by |
| --- | --- | --- |
| `0.1.0` | Policy `0.1.0` (Retained) | Compatibility baselines `0.1.0` through `0.11.0`. |
| `1.0.0` | Policy `1.0.0` | Compatibility baseline `1.0.0-rc.1` and every later baseline. |

Policy `1.0.0` does not rewrite policy `0.1.0`. The retained section keeps the rules that governed baselines `0.1.0` through `0.11.0` exactly as they were published, so a reader of an immutable historical baseline can still recover the policy that applied to it. A release is governed by policy `1.0.0` only when its own compatibility baseline records `packagePolicyVersion` `1.0.0`.

## Status and Scope

This document defines the normative compatibility policy for the Collective Cognition SDK. It separates portable serialized contracts from the installable package, public experimental APIs, and repository internals.

The historical compatibility baseline `0.1.0` records the inaugural surface of the unpublished package `0.1.0`; it does not represent a migration from an earlier published release. Baseline `0.2.0` records the additive Portable Cognition package surface. Historical baseline `0.3.0` records the additive Host Integration package surface plus the source-breaking correction that narrows `PortableDomainError.code` to the already-normative Portable Cognition `0.1.0` allowlist, while retaining prior baselines and serialized artifacts byte-for-byte. Historical baseline `0.4.0` adds the optional SQLite cognition-store subpath and its packaged RFC. Historical baseline `0.5.0` adds source-neutral connector conformance, one maintained compatible connector subpath, and a dedicated connector CLI without changing root exports or the generic CLI contract. Historical baseline `0.6.0` adds the independent Supported Experimental `adapters/markdown/0.1.0` subpath, dedicated Markdown CLI, explicit eight-digit object-version ceiling, documentation, and package artifacts while preserving all prior exports, executables, contracts, and baselines. Historical baseline `0.7.0` packages Runtime and Security Profile `0.1.0` as normative prose and a versioned machine-readable JSON subpath. Historical baseline `0.8.0` adds the checked [public API reference](../docs/public-api.md), Distribution Readiness Profile `0.1.0` [prose](distribution-readiness.md) and [JSON](distribution-readiness/0.1.0/profile.json), and [RFC 0009](../rfcs/0009-public-api-and-distribution-readiness.md). Historical baseline `0.9.0` adds the source-neutral Durable Cognition Workflow `0.1.0`, SQLite workflow-store `0.1.0`, installed workflow executable, [operator guide](../docs/durable-cognition-workflow-guide.md), and [RFC 0010](../rfcs/0010-durable-cognition-workflow.md). The current additive private baseline `0.10.0` adds the maintained Git connector, Cross-Connector Interoperability Profile `0.1.0` resources, [Git connector guide](../docs/git-connector-guide.md), owned reference exchange, and [RFC 0011](../rfcs/0011-cross-connector-interoperability.md) while preserving root runtime and type export names and every historical subpath, executable, and artifact. Package `0.10.0` remains private and unpublished, and production use is not claimed.

The terms **MUST**, **MUST NOT**, **SHOULD**, and **MAY** express normative requirements.

## Policy `0.1.0` (Retained)

Everything from this heading through the end of Explicit Non-Guarantees is `packagePolicyVersion` `0.1.0` as it was published for compatibility baselines `0.1.0` through `0.11.0`. It is retained unedited and remains the governing text for those baselines. Policy `1.0.0` begins at Policy `1.0.0` below.

## Stability Levels

| Level | Meaning | Current surfaces |
| --- | --- | --- |
| Normative Stable | Portable behavior and immutable versioned artifacts on which implementations and stored data can rely. | SourceRecord `0.1.0`, Portable Cognition `0.1.0`, Host Integration `0.1.0`, Runtime and Security Profile `0.1.0`, Distribution Readiness Profile `0.1.0`, and Cross-Connector Interoperability Profile `0.1.0` prose, schemas or conformance fixtures where applicable, stable contract error codes, versioned artifact package subpaths, this policy, versioned compatibility baselines, change cases, and compatibility package subpaths. |
| Supported Experimental | Public and tested package behavior that can evolve under this policy before `1.0.0`. | Root runtime exports, root TypeScript declarations, declared non-normative package subpaths, the `collective-cognition`, `collective-cognition-teammem`, `collective-cognition-markdown`, and `collective-cognition-workflow` executables, generic and dedicated CLI behavior, and non-SourceRecord domain error codes. |
| Internal | Repository implementation details with no compatibility promise. | Unexported source modules and connectors, examples, tests, scripts, plans, repository utilities, and generated layout beyond declared package entrypoints. |

The versioned baseline records these three identifiers and definitions machine-readably.

### COMP-001 — Overlapping Stability

When a surface has more than one classification, the more stable classification MUST control.

### COMP-002 — Normative Stable Immutability

Normative Stable behavior MUST NOT change in place. A change to accepted or rejected serialized values, canonical identity, required error classification, or a versioned machine artifact MUST create a new contract or artifact version and preserve the prior version.

An editorial correction MAY update prose without a contract-version change only when it preserves behavior and restores agreement with an already-normative requirement.

### COMP-003 — Supported Experimental Evolution

Supported Experimental patch releases MUST remain backward compatible. Before `1.0.0`, a minor release MAY make a breaking Supported Experimental change only through an accepted RFC, migration notes, deprecation, a new compatibility baseline, and a non-patch release. A `COMP-012` correctness correction MAY mark deprecation as not applicable only when retaining the old declaration or behavior would continue contradicting an already-normative contract; the RFC MUST explain that conflict, and migration notes, a new baseline, and a non-patch release remain mandatory.

The Supported Experimental classification does not make cognitive-object, authorization, transition, event, or other unfinished semantics Normative Stable.

### COMP-004 — Internal Paths

Internal paths create no compatibility promise. They MAY change without deprecation when public behavior and normative artifacts remain compatible. Importing an internal repository path MUST NOT promote that path to a public contract.

## Independent Version Domains

| Domain | Meaning | Independence |
| --- | --- | --- |
| Package version | The installable SDK version in `package.json`. | It does not automatically equal a schema, policy, baseline, or object revision. |
| Normative contract version | The version in a schema path, schema `$id`, conformance path, or serialized `schemaVersion`. | A package can distribute multiple contract versions. |
| CognitiveObject revision | The `version` counter on one object instance. | It is not a package, schema, policy, or baseline version. |
| Policy identifier | A named policy identity such as `neutral-evidence-v1` and its SDK ID/version pair. | Existing identities retain their meaning independently of package releases. |
| Compatibility baseline version | The version under `spec/compatibility/<baseline-version>/`. | It identifies one policy and inventory snapshot, not permission for a release by itself. |

### COMP-005 — Package Version Meanings

The package version MUST follow this policy:

- `PATCH` MUST contain only backward-compatible corrections, documentation, or metadata changes.
- `MINOR` MAY contain backward-compatible public additions or new normative contract versions that preserve prior versions.
- Before `1.0.0`, `MINOR` MAY contain a reviewed breaking Supported Experimental change only through the full process in `COMP-003`.
- At and after `1.0.0`, a breaking public-package change MUST use `MAJOR`.

The pre-`1.0.0` process is a project policy layered on Semantic Versioning; it is not attributed to Semantic Versioning itself.

### COMP-006 — Normative Contract Versions

Normative contract versions MUST remain independent of package versions. A new contract version MAY ship in a backward-compatible package release when the previous contract remains available and existing behavior is unchanged. Replacing or removing an existing contract version is breaking.

### COMP-007 — CognitiveObject Revision

A CognitiveObject `version` value MUST be treated only as an instance revision counter. It MUST NOT be interpreted as a package version, schema version, policy version, or compatibility-baseline version.

### COMP-008 — Policy Identity

An existing policy identifier MUST NOT change meaning. Changed policy behavior MUST receive a new identity while the previous supported identity remains available for the applicable deprecation window.

### COMP-009 — Compatibility Baselines

An existing compatibility baseline MUST remain byte-immutable. Any changed inventory or policy snapshot MUST use a new baseline version and preserve the prior baseline. A new baseline does not by itself authorize a breaking change; the applicable release process MUST also be satisfied.

## Change Classification

Compatibility is evaluated from the perspective of an existing conforming consumer, serialized value, or automation.

### COMP-010 — Additive Changes

A change is additive only when every previous conforming use preserves its meaning and outcome.

Examples include a new independent root export, a new independent CLI command, a new optional capability whose absence preserves current behavior, a supported namespaced extension, or a new normative contract version published beside the previous version.

An addition is not additive when it creates a name collision, changes overload selection or defaults, changes an existing output or exit status, or makes previously invalid input valid under an existing normative contract.

### COMP-011 — Breaking Changes

A change is breaking when an existing conforming consumer, serialized value, or automation can fail or receive different meaning.

Breaking examples include:

- removing or renaming a package export or export subpath;
- narrowing a public TypeScript type;
- changing an existing CLI command, option, exit status, structured output field, or stable diagnostic code;
- changing which values an existing schema version accepts or rejects;
- changing canonicalization or revision-collision behavior;
- changing the meaning of an existing policy identifier; or
- removing a previously distributed normative artifact.

Human-readable error message wording, JSON object member order, and diagnostic ordering across independent rejected records are not compatibility guarantees unless another normative rule explicitly makes them so.

### COMP-012 — Corrections

A correction is patch-compatible only when it restores behavior to a normative requirement or documented public contract that predates the correction. A regression test MUST demonstrate the mismatch.

When prose and implementation were both ambiguous, selecting one interpretation MUST be classified through the additive or breaking process rather than as a correction.

A correction that narrows a Supported Experimental TypeScript type is still source-breaking when a previously compiling generic consumer can fail. Before `1.0.0`, such a correction MUST use `minor-before-1.0`, an accepted RFC, migration evidence, and a new compatibility baseline. Deprecation MAY be recorded as not applicable only under the contradiction condition in `COMP-003`.

## Change Matrix

| Surface | Additive example | Breaking example | Required control |
| --- | --- | --- | --- |
| Normative schema | Publish `0.2.0` beside `0.1.0`. | Change `0.1.0` acceptance. | Create a new contract version and preserve the old artifact. |
| Root SDK | Add a new named export. | Remove or narrow an export. | Update a new baseline; apply RFC and migration controls when breaking. |
| Package exports | Add a new subpath. | Remove or incompatibly redirect a subpath. | Verify installed consumers; apply the breaking process when required. |
| CLI | Add an independent command. | Change existing JSON shape or exit behavior. | Update a new baseline and CLI checks; apply the breaking process. |
| Error behavior | Add an error for a new operation. | Reclassify an existing failure. | Retain stable-code checks; apply the breaking process. |
| Extension behavior | Support a new namespace explicitly. | Reinterpret existing namespaced data. | Use a new behavior identity or the breaking process. |

## Deprecation Lifecycle

### COMP-013 — Deprecation Requirements

A Supported Experimental surface MUST be deprecated only when all of the following exist:

1. an accepted RFC identifies the affected consumers and reason;
2. documentation names the replacement;
3. migration notes show old and new usage;
4. retained tests keep the deprecated behavior operational;
5. the public declaration or CLI documentation marks the deprecation; and
6. a new compatibility baseline records the deprecation and earliest removal version.

### COMP-014 — Pre-1.0 Retention

Before `1.0.0`, deprecated behavior MUST remain functional through at least one subsequent minor package release after the release that first marks it deprecated. Removal MUST occur only in a later minor release and MUST NOT occur in a patch release.

### COMP-015 — Breaking Replacement

A breaking replacement MUST introduce a parallel supported path before the old path is removed. When a parallel path is impossible, an accepted RFC MUST explain why, provide an equivalent migration window, and record explicit human approval.

### COMP-016 — Post-1.0 and Normative Retirement

At and after `1.0.0`, removal of a public package surface MUST use a major package release.

A Normative Stable artifact MUST NOT be rewritten or deprecated in place. Its replacement MUST receive a new version. A decision to stop distributing an older versioned artifact MUST have its own accepted RFC, migration path, support window, and breaking package release.

### COMP-017 — Deprecation Signals

This slice MUST use normative documentation and declarations rather than runtime warning output for deprecation signals. Applicable TypeScript declarations, CLI documentation when a help contract exists, migration notes, and the machine-readable baseline SHOULD expose the deprecation.

Runtime warnings MAY be proposed in a later RFC that protects structured CLI consumers and host logs.

## Baseline Enforcement

The versioned baseline records exact normative artifact digests, stable rule identifiers, package metadata, the emitted-file inventory, runtime and type exports, independent declaration closures and literal digests for every public TypeScript entrypoint, domain errors, CLI behavior, policy identities, and deprecations.

Baseline `0.2.0` classifies the package change as additive with a minor package-version effect. It adds Portable Cognition `0.1.0` runtime, type, schema, and conformance entrypoints without removing or redirecting an existing package surface.

Baseline `0.3.0` records two changes. The Host Integration `0.1.0` runtime, type, contract, conformance, and reference-host subpaths are additive. The `PortableDomainError.code` declaration narrowing is a `COMP-012` correctness correction but is source-breaking for a generic package `0.2.0` TypeScript assignment, so the package change is classified `breaking` with `minor-before-1.0`. Migration narrows a package-wide `DomainErrorCode` with a guard returning `code is PortableDomainError["code"]`. Deprecation is not applicable because retaining the wider portable payload declaration would continue contradicting the immutable Portable Cognition `0.1.0` allowlist.

Baseline `0.4.0` adds the optional
`collective-cognition-sdk/stores/sqlite/0.1.0` reference adapter without
changing the source-neutral root exports or generic CLI.

Baseline `0.5.0` adds
`collective-cognition-sdk/connector-conformance/0.1.0`,
`collective-cognition-sdk/connectors/team-memory/0.1.0`, and
`collective-cognition-teammem`. The conformance subpath is source-neutral.
Team-memory is one maintained compatible connector, not root SDK behavior.
External connectors may live in independent repositories and packages.
Collection does not imply interpretation, promotion, or persistence.

Baseline `0.6.0` remains historical. Baseline `0.7.0` adds Runtime and
Security Profile `0.1.0` prose and the
`collective-cognition-sdk/runtime-security/0.1.0` JSON subpath without
changing existing runtime, type, CLI, connector, adapter, or host contracts.
The machine profile is data, not certification or a host security
implementation.

Baseline `0.8.0` adds the checked public API reference, Distribution Readiness
Profile `0.1.0` prose and the
`collective-cognition-sdk/distribution-readiness/0.1.0` JSON subpath, and RFC
0009 without changing existing runtime, type, CLI, connector, adapter, or host
contracts. The profile is descriptive data: npm publication remains blocked,
production readiness is not claimed, and accountable-human publication
approval remains mandatory.

Baseline `0.9.0` adds the Supported Experimental
`collective-cognition-sdk/workflows/durable/0.1.0` and
`collective-cognition-sdk/stores/sqlite-workflow/0.1.0` subpaths plus the
`collective-cognition-workflow` executable. The addition is source-neutral and
does not change root export names, root domain-error values, or any historical
package entrypoint and keeps the historical SQLite declaration closure exact.
The package contains no shared `sqlite-internal` module. The SQLite workflow
store requires a new explicitly selected schema-version-`2` database; the CLI
has no publisher; Markdown is non-authoritative. No scheduler, automatic
cognition, Obsidian discovery, authentication, encryption, durable outbox,
publication authority, or production certification is added.

Baseline `0.10.0` additively adds
`collective-cognition-sdk/connectors/git/0.1.0` and the four
`collective-cognition-sdk/interoperability/0.1.0/*` resource subpaths. Package
`0.10.0` therefore has two maintained connectors while retaining the exact
root runtime/type API, every existing subpath, and all four existing
executables; there is no Git CLI. The connector performs read-only bounded
collection from an explicit local repository through a local Git executable,
follows first-parent history from the exact tip, and keeps message and author
email behind disabled-by-default privacy options. The profile is owned by
`collective-cognition-sdk-maintainers` and does not add a connector registry,
plugin discovery or runtime, network access, scheduling, or automatic
cognition.

### COMP-018 — Deliberate Baseline Updates

A baseline failure MUST receive human classification. Contributors MUST NOT update a baseline snapshot automatically. A deliberate change MUST identify the affected consumer, classify the change, follow the required RFC, migration, deprecation, and release process, and create a new baseline version when the inventory or policy snapshot changes.

Automated checks MAY prove exact drift and declared process consequences. They MUST NOT claim to infer the semantic compatibility of arbitrary changes.

## Explicit Non-Guarantees

This policy does not:

- freeze unversioned runtime CognitiveObject, relationship, transition, authorization, event, persistence, or connector schemas outside an explicit versioned normative contract;
- promise package `1.0.0`, long-term support, or npm publication;
- confirm registry-name availability or remove the package publication guard;
- select a persistence technology, hosted service, database, source connector, or runtime architecture;
- provide an automated migration engine or universal semantic-diff classifier;
- stabilize repository source paths, examples, tests, scripts, plans, or generated files beyond declared package entrypoints;
- claim that all TypeScript declaration digest changes are semantically breaking;
- claim cross-language interoperability without conformance evidence; or
- make this repository a standards body.

Package `0.10.0` is private and unpublished. The Runtime and Security Profile
and Distribution Readiness Profile machine data are not certification, a host
security implementation, or publication authority. Connector conformance is not
certification, does not imply endorsement, and is not an LTS commitment.

## Policy `1.0.0`

`packagePolicyVersion` `1.0.0` is the compatibility policy for the stable package. It is published as a new policy version rather than as an amendment, because this document is Normative Stable and `COMP-002` forbids a behavior-changing in-place edit to a Normative Stable resource.

### Stable `1.0.0` Boundary

Package `1.0.0` establishes the first stable public package baseline. Semantic Versioning protects every package surface shipped in `1.0.0`. An experimental maturity label is not a compatibility exemption.

| Surface | `1.0.0` classification | Compatibility rule |
| --- | --- | --- |
| Root runtime and type exports recorded by the `1.0.0` baseline | Stable Public API | Removal or an incompatible behavior or type change requires package `2.0.0`. |
| `DomainErrorCode` twelve-code root catalog | Stable Public API | Removal or changed meaning requires package `2.0.0`; Portable Cognition keeps its separate immutable eleven-code allowlist. |
| Generic `collective-cognition` executable | Stable Public API | Command names, machine-readable success output, diagnostics, and exit behavior are SemVer protected. |
| Charter, historical contracts, schemas, fixtures, profiles, compatibility baselines, and new normative resource subpaths | Normative Stable | Published versioned bytes and meanings are immutable; a changed contract uses a new resource version. |
| Markdown adapter; connector conformance; Team Memory and Git connectors; host conformance; reference host; SQLite stores; durable workflow | Supported Experimental maturity, SemVer protected | Existing versioned subpaths remain import-compatible through package `1.x`; an incompatible replacement uses a new versioned subpath or package `2.0.0`. |
| `collective-cognition-teammem`, `collective-cognition-markdown`, and `collective-cognition-workflow` executables | Supported Experimental maturity, SemVer protected | Installed names and documented behavior remain compatible through package `1.x`; an incompatible replacement requires package `2.0.0`. |
| `./package.json` export and selected package metadata | Stable introspection surface | Baseline-selected fields follow this policy. |
| Repository source, tests, examples, generated file paths, and unexported modules | Internal | No compatibility promise. |

### STAB-001 — Policy Version Selection

Every compatibility baseline MUST record the `packagePolicyVersion` that governs its release. Compatibility baseline `1.0.0-rc.1` and every later baseline MUST record `packagePolicyVersion` `1.0.0`. Baselines `0.1.0` through `0.11.0` MUST continue to record `packagePolicyVersion` `0.1.0`, and the retained section above remains their governing text.

Publishing this policy version does not change any historical baseline, contract, artifact, or serialized record.

### STAB-002 — Stable Surface Classification

The classification below assigns exactly one `1.0.0` classification to every root runtime export, root type export, root `DomainErrorCode` value, declared package subpath, installed executable, and selected `package.json` metadata field recorded by the compatibility baseline. A surface MUST NOT appear more than once. A declared package surface that is absent from this list has no `1.0.0` classification and MUST NOT be treated as stable.

Each line reads `<classification> | <surface kind> | <surface>`. The classification identifiers are `stable-public-api`, `normative-stable`, `supported-experimental`, and `stable-introspection`. Baseline `1.0.0-rc.1` MUST record these identifiers and their definitions machine-readably.

```text
stable-public-api | executable | collective-cognition
supported-experimental | executable | collective-cognition-markdown
supported-experimental | executable | collective-cognition-teammem
supported-experimental | executable | collective-cognition-workflow
stable-introspection | package-field | bin
stable-introspection | package-field | engines
stable-introspection | package-field | exports
stable-introspection | package-field | license
stable-introspection | package-field | main
stable-introspection | package-field | name
stable-introspection | package-field | private
stable-introspection | package-field | productionDependencyFields
stable-introspection | package-field | type
stable-introspection | package-field | types
stable-introspection | package-field | version
stable-public-api | package-subpath | .
supported-experimental | package-subpath | ./adapters/markdown/0.1.0
normative-stable | package-subpath | ./charter/1.0.0
normative-stable | package-subpath | ./compatibility/0.1.0
normative-stable | package-subpath | ./compatibility/0.10.0
normative-stable | package-subpath | ./compatibility/0.11.0
normative-stable | package-subpath | ./compatibility/0.2.0
normative-stable | package-subpath | ./compatibility/0.3.0
normative-stable | package-subpath | ./compatibility/0.4.0
normative-stable | package-subpath | ./compatibility/0.5.0
normative-stable | package-subpath | ./compatibility/0.6.0
normative-stable | package-subpath | ./compatibility/0.7.0
normative-stable | package-subpath | ./compatibility/0.8.0
normative-stable | package-subpath | ./compatibility/0.9.0
normative-stable | package-subpath | ./conformance/cognition-event/0.1.0/invalid
normative-stable | package-subpath | ./conformance/cognition-event/0.1.0/lifecycle
normative-stable | package-subpath | ./conformance/cognition-event/0.1.0/valid
normative-stable | package-subpath | ./conformance/cognitive-object/0.1.0/invalid
normative-stable | package-subpath | ./conformance/cognitive-object/0.1.0/valid
normative-stable | package-subpath | ./conformance/portable-cognition/0.1.0/cognitive-loop
normative-stable | package-subpath | ./conformance/portable-cognition/0.1.0/invalid
normative-stable | package-subpath | ./conformance/portable-cognition/0.1.0/valid
supported-experimental | package-subpath | ./connector-conformance/0.1.0
supported-experimental | package-subpath | ./connectors/git/0.1.0
supported-experimental | package-subpath | ./connectors/team-memory/0.1.0
normative-stable | package-subpath | ./contracts/host-integration/0.1.0
normative-stable | package-subpath | ./distribution-readiness/0.1.0
supported-experimental | package-subpath | ./host-conformance/0.1.0
normative-stable | package-subpath | ./interoperability/0.1.0/errors
normative-stable | package-subpath | ./interoperability/0.1.0/portable-cognition
normative-stable | package-subpath | ./interoperability/0.1.0/profile
normative-stable | package-subpath | ./interoperability/0.1.0/source-records
stable-introspection | package-subpath | ./package.json
supported-experimental | package-subpath | ./reference-host/0.1.0
normative-stable | package-subpath | ./runtime-security/0.1.0
normative-stable | package-subpath | ./schemas/cognition-event/0.1.0
normative-stable | package-subpath | ./schemas/cognitive-object/0.1.0
normative-stable | package-subpath | ./schemas/portable-cognition/0.1.0
normative-stable | package-subpath | ./schemas/source-record/0.1.0
supported-experimental | package-subpath | ./stores/sqlite-workflow/0.1.0
supported-experimental | package-subpath | ./stores/sqlite/0.1.0
supported-experimental | package-subpath | ./workflows/durable/0.1.0
stable-public-api | root-error-code | AUTHORIZATION_DENIED
stable-public-api | root-error-code | CONFIRMATION_REQUIRED
stable-public-api | root-error-code | INGESTION_LIMIT_EXCEEDED
stable-public-api | root-error-code | INVALID_HOST_INTEGRATION_REQUEST
stable-public-api | root-error-code | INVALID_OBJECT
stable-public-api | root-error-code | INVALID_PORTABLE_COGNITION_RECORD
stable-public-api | root-error-code | INVALID_RELATIONSHIP
stable-public-api | root-error-code | INVALID_SOURCE_RECORD
stable-public-api | root-error-code | INVALID_TRANSITION
stable-public-api | root-error-code | PROMOTION_FAILED
stable-public-api | root-error-code | SERIALIZATION_ERROR
stable-public-api | root-error-code | SOURCE_REVISION_COLLISION
stable-public-api | root-runtime-export | canonicalizeJson
stable-public-api | root-runtime-export | COGNITION_EVENT_PROJECTION_VERSION
stable-public-api | root-runtime-export | COGNITION_PROJECTION_MAX_JSON_DEPTH
stable-public-api | root-runtime-export | COGNITIVE_OBJECT_PROJECTION_VERSION
stable-public-api | root-runtime-export | commitCognitionTransition
stable-public-api | root-runtime-export | commitInitialCognition
stable-public-api | root-runtime-export | createObject
stable-public-api | root-runtime-export | createPortableCognitionRecord
stable-public-api | root-runtime-export | createSourceRecord
stable-public-api | root-runtime-export | deserializeCognitionEventProjection
stable-public-api | root-runtime-export | deserializeCognitiveObjectProjection
stable-public-api | root-runtime-export | deserializeObject
stable-public-api | root-runtime-export | deserializePortableCognitionRecord
stable-public-api | root-runtime-export | deserializeSourceRecord
stable-public-api | root-runtime-export | DomainError
stable-public-api | root-runtime-export | DomainErrorCode
stable-public-api | root-runtime-export | evaluateAuthorization
stable-public-api | root-runtime-export | HOST_INTEGRATION_CONTRACT_VERSION
stable-public-api | root-runtime-export | HostFailureCode
stable-public-api | root-runtime-export | ingestAndPromoteEvidence
stable-public-api | root-runtime-export | ingestSourceRecords
stable-public-api | root-runtime-export | ingestSourceRecordText
stable-public-api | root-runtime-export | neutralEvidencePolicyV1
stable-public-api | root-runtime-export | PORTABLE_COGNITION_MAX_JSON_DEPTH
stable-public-api | root-runtime-export | PORTABLE_COGNITION_SCHEMA_VERSION
stable-public-api | root-runtime-export | promoteSourceRecordsToEvidence
stable-public-api | root-runtime-export | serializeObject
stable-public-api | root-runtime-export | serializePortableCognitionRecord
stable-public-api | root-runtime-export | serializeSourceRecord
stable-public-api | root-runtime-export | SOURCE_RECORD_MAX_JSON_DEPTH
stable-public-api | root-runtime-export | SOURCE_RECORD_SCHEMA_VERSION
stable-public-api | root-runtime-export | sourceRevisionKey
stable-public-api | root-runtime-export | transitionObject
stable-public-api | root-runtime-export | validateCognitionEventProjection
stable-public-api | root-runtime-export | validateCognitiveObjectProjection
stable-public-api | root-runtime-export | validatePortableCognitionRecord
stable-public-api | root-runtime-export | validateSourceRecord
stable-public-api | root-type-export | ActorKind
stable-public-api | root-type-export | Attribution
stable-public-api | root-type-export | AuthorizationDecision
stable-public-api | root-type-export | AuthorizationPolicy
stable-public-api | root-type-export | AutomationMode
stable-public-api | root-type-export | CognitionEvent
stable-public-api | root-type-export | CognitionEventPublisher
stable-public-api | root-type-export | CognitionHost
stable-public-api | root-type-export | CognitionPersistenceStatus
stable-public-api | root-type-export | CognitionPublicationStatus
stable-public-api | root-type-export | CognitionStore
stable-public-api | root-type-export | CognitionStoreCommitResult
stable-public-api | root-type-export | CognitiveObject
stable-public-api | root-type-export | CognitiveObjectFor
stable-public-api | root-type-export | ConsequenceLevel
stable-public-api | root-type-export | CreateObjectInput
stable-public-api | root-type-export | CreateObjectInputFor
stable-public-api | root-type-export | CreatePortableCognitionRecordInput
stable-public-api | root-type-export | CreateSourceRecordInput
stable-public-api | root-type-export | DataByType
stable-public-api | root-type-export | DecisionData
stable-public-api | root-type-export | DecisionState
stable-public-api | root-type-export | EvidenceData
stable-public-api | root-type-export | EvidencePromotionContext
stable-public-api | root-type-export | EvidencePromotionMapping
stable-public-api | root-type-export | EvidencePromotionPolicy
stable-public-api | root-type-export | EvidencePromotionRequest
stable-public-api | root-type-export | EvidencePromotionResult
stable-public-api | root-type-export | EvidenceState
stable-public-api | root-type-export | ExperimentData
stable-public-api | root-type-export | ExperimentState
stable-public-api | root-type-export | GoalData
stable-public-api | root-type-export | GoalState
stable-public-api | root-type-export | HostConflict
stable-public-api | root-type-export | HostConflictCode
stable-public-api | root-type-export | HostFailure
stable-public-api | root-type-export | HumanConfirmation
stable-public-api | root-type-export | HypothesisData
stable-public-api | root-type-export | HypothesisState
stable-public-api | root-type-export | IdentityData
stable-public-api | root-type-export | IdentityState
stable-public-api | root-type-export | IngestAndPromoteEvidenceResult
stable-public-api | root-type-export | IngestionBatchResult
stable-public-api | root-type-export | IngestionItemResult
stable-public-api | root-type-export | IngestionMode
stable-public-api | root-type-export | IngestionOptions
stable-public-api | root-type-export | IngestionTextOptions
stable-public-api | root-type-export | InitialCognitionCommit
stable-public-api | root-type-export | InitialCommitOutcome
stable-public-api | root-type-export | JsonArray
stable-public-api | root-type-export | JsonObject
stable-public-api | root-type-export | JsonPrimitive
stable-public-api | root-type-export | JsonValue
stable-public-api | root-type-export | ObjectType
stable-public-api | root-type-export | PortableCognitionEventRecord
stable-public-api | root-type-export | PortableCognitionPayloadByType
stable-public-api | root-type-export | PortableCognitionRecord
stable-public-api | root-type-export | PortableCognitionRecordType
stable-public-api | root-type-export | PortableCognitiveObjectRecord
stable-public-api | root-type-export | PortableDomainError
stable-public-api | root-type-export | PrincipleData
stable-public-api | root-type-export | PrincipleState
stable-public-api | root-type-export | PromotionFailure
stable-public-api | root-type-export | ProvenanceRef
stable-public-api | root-type-export | Relationship
stable-public-api | root-type-export | RelationshipType
stable-public-api | root-type-export | SourceRecord
stable-public-api | root-type-export | SourceRecordSource
stable-public-api | root-type-export | StateByType
stable-public-api | root-type-export | TransitionActor
stable-public-api | root-type-export | TransitionCognitionCommit
stable-public-api | root-type-export | TransitionCommitOutcome
stable-public-api | root-type-export | TransitionContext
stable-public-api | root-type-export | TransitionResult
```

`internal` surfaces are not enumerated because they are repository paths rather than declared package surfaces. `COMP-004` continues to govern them.

### STAB-003 — Supported Experimental Maturity

From `packagePolicyVersion` `1.0.0`, Supported Experimental is an operational-maturity label. It records that a surface's host dependencies, behavior, and production suitability are not certified. It MUST NOT be read as permission to break a package `1.x` consumer.

Every surface classified `supported-experimental` in `STAB-002` is SemVer protected. Its installed name, exported subpath, and documented behavior MUST remain compatible through package `1.x`.

### STAB-004 — Post-`1.0.0` Incompatible Change

At and after `1.0.0`, an incompatible change to a root export, to the generic `collective-cognition` executable, or to an existing versioned package subpath MUST use package `2.0.0` or a new retained versioned subpath. When a new versioned subpath is used, the previous subpath MUST remain published and unchanged.

Removal, an incompatible signature change, newly required data, changed normative meaning, invalidation of a previously valid stable record, or changed stable CLI output MUST use a major package version unless an existing versioned contract explicitly defines another migration mechanism.

An additive optional field, an additive stable subpath, an additive object-contract version, and a fix that only rejects input already invalid under the normative contract MAY use a minor or patch release as classified by `COMP-010`.

### STAB-005 — Pre-`1.0.0` Effect Withdrawal

`minor-before-1.0` applies only under `packagePolicyVersion` `0.1.0` and is not available at or after `1.0.0`. A baseline recording `packagePolicyVersion` `1.0.0` MUST NOT classify any change with that package-version effect, and a breaking public-package change MUST use `MAJOR`.

### STAB-006 — Retained Rules Under Policy `1.0.0`

`COMP-001` through `COMP-018` continue to apply under policy `1.0.0` except where a `STAB` rule states otherwise. `STAB-005` supersedes the pre-`1.0.0` allowance in `COMP-003`, the third bullet of `COMP-005`, and the `minor-before-1.0` requirement in `COMP-012`. `COMP-014` no longer applies, because `COMP-016` already governs removal at and after `1.0.0`. Where a `STAB` rule and a retained `COMP` rule conflict for a release governed by policy `1.0.0`, the `STAB` rule controls.

### Explicit Non-Guarantees Under Policy `1.0.0`

The Explicit Non-Guarantees of policy `0.1.0` continue to apply, with two exceptions. Policy `1.0.0` promises Semantic Versioning protection for the surfaces classified in `STAB-002`. It also governs a package that has reached `1.0.0`, so the policy `0.1.0` statement that no package `1.0.0` is promised no longer describes a release under this policy version.

Policy `1.0.0` does not authorize an npm publication, remove the package publication guard, confirm registry-name availability, claim production readiness, or grant certification, endorsement, or long-term support. Package `0.11.0` remains private and unpublished. A release governed by this policy version still requires its own compatibility baseline, distribution-readiness profile, and accountable-human publication approval.

Migration guidance for consumers is in [Migrating from package `0.11.0` to `1.0.0`](../docs/migrations/1.0.0.md). The policy revision is recorded in [RFC 0012](../rfcs/0012-phase-3-charter-and-stable-package.md).
