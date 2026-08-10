# Compatibility, Versioning, and Deprecation

## Status and Scope

This document defines the normative compatibility policy for the Collective Cognition SDK. It separates portable serialized contracts from the installable package, public experimental APIs, and repository internals.

The historical compatibility baseline `0.1.0` records the inaugural surface of the unpublished package `0.1.0`; it does not represent a migration from an earlier published release. Baseline `0.2.0` records the additive Portable Cognition package surface. Historical baseline `0.3.0` records the additive Host Integration package surface plus the source-breaking correction that narrows `PortableDomainError.code` to the already-normative Portable Cognition `0.1.0` allowlist, while retaining prior baselines and serialized artifacts byte-for-byte. Historical baseline `0.4.0` adds the optional SQLite cognition-store subpath and its packaged RFC. Historical baseline `0.5.0` adds source-neutral connector conformance, one maintained compatible connector subpath, and a dedicated connector CLI without changing root exports or the generic CLI contract. Historical baseline `0.6.0` adds the independent Supported Experimental `adapters/markdown/0.1.0` subpath, dedicated Markdown CLI, explicit eight-digit object-version ceiling, documentation, and package artifacts while preserving all prior exports, executables, contracts, and baselines. The current additive private baseline `0.7.0` packages Runtime and Security Profile `0.1.0` as normative prose and a versioned machine-readable JSON subpath without changing existing runtime, type, CLI, connector, adapter, or host behavior. Package `0.7.0` remains private, unpublished, and not production-ready.

The terms **MUST**, **MUST NOT**, **SHOULD**, and **MAY** express normative requirements.

## Stability Levels

| Level | Meaning | Current surfaces |
| --- | --- | --- |
| Normative Stable | Portable behavior and immutable versioned artifacts on which implementations and stored data can rely. | SourceRecord `0.1.0`, Portable Cognition `0.1.0`, Host Integration `0.1.0`, and Runtime and Security Profile `0.1.0` prose, schemas or conformance fixtures where applicable, stable contract error codes, versioned artifact package subpaths, this policy, versioned compatibility baselines, change cases, and compatibility package subpaths. |
| Supported Experimental | Public and tested package behavior that can evolve under this policy before `1.0.0`. | Root runtime exports, root TypeScript declarations, declared non-normative package subpaths, the `collective-cognition`, `collective-cognition-teammem`, and `collective-cognition-markdown` executables, generic and dedicated CLI behavior, and non-SourceRecord domain error codes. |
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

Package `0.7.0` is private and unpublished. The Runtime and Security Profile
machine data is not certification or a host security implementation. Connector conformance is not
certification, does not imply endorsement, and is not an LTS commitment.
