# Compatibility, Versioning, and Deprecation

## Status and Scope

This document defines the normative compatibility policy for the Collective Cognition SDK. It separates portable serialized contracts from the installable package, public experimental APIs, and repository internals.

The initial compatibility baseline is `0.1.0`. It records the inaugural surface of the unpublished package `0.1.0`; it does not represent a migration from an earlier published release.

The terms **MUST**, **MUST NOT**, **SHOULD**, and **MAY** express normative requirements.

## Stability Levels

| Level | Meaning | Current surfaces |
| --- | --- | --- |
| Normative Stable | Portable behavior and immutable versioned artifacts on which implementations and stored data can rely. | SourceRecord `0.1.0` prose, schema, conformance fixtures, canonicalization and revision equality, stable SourceRecord error codes, schema package subpath, this policy, versioned compatibility baselines, change cases, and compatibility package subpaths. |
| Supported Experimental | Public and tested package behavior that can evolve under this policy before `1.0.0`. | Root runtime exports, root TypeScript declarations, non-normative package subpaths, the `collective-cognition` executable, generic CLI behavior, and non-SourceRecord domain error codes. |
| Internal | Repository implementation details with no compatibility promise. | Unexported source modules, source-specific connectors and entrypoints, examples, tests, scripts, plans, repository utilities, and generated layout beyond declared package entrypoints. |

The versioned baseline records these three identifiers and definitions machine-readably.

### COMP-001 — Overlapping Stability

When a surface has more than one classification, the more stable classification MUST control.

### COMP-002 — Normative Stable Immutability

Normative Stable behavior MUST NOT change in place. A change to accepted or rejected serialized values, canonical identity, required error classification, or a versioned machine artifact MUST create a new contract or artifact version and preserve the prior version.

An editorial correction MAY update prose without a contract-version change only when it preserves behavior and restores agreement with an already-normative requirement.

### COMP-003 — Supported Experimental Evolution

Supported Experimental patch releases MUST remain backward compatible. Before `1.0.0`, a minor release MAY make a breaking Supported Experimental change only through an accepted RFC, migration notes, deprecation, a new compatibility baseline, and a non-patch release.

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

The versioned baseline records exact normative artifact digests, stable rule identifiers, package metadata, the emitted-file inventory, runtime and type exports, declaration closure, domain errors, CLI behavior, policy identities, and deprecations.

### COMP-018 — Deliberate Baseline Updates

A baseline failure MUST receive human classification. Contributors MUST NOT update a baseline snapshot automatically. A deliberate change MUST identify the affected consumer, classify the change, follow the required RFC, migration, deprecation, and release process, and create a new baseline version when the inventory or policy snapshot changes.

Automated checks MAY prove exact drift and declared process consequences. They MUST NOT claim to infer the semantic compatibility of arbitrary changes.

## Explicit Non-Guarantees

This policy does not:

- freeze CognitiveObject, relationship, transition, authorization, event, persistence, or connector schemas;
- promise package `1.0.0`, long-term support, or npm publication;
- confirm registry-name availability or remove the package publication guard;
- select a persistence technology, hosted service, database, source connector, or runtime architecture;
- provide an automated migration engine or universal semantic-diff classifier;
- stabilize repository source paths, examples, tests, scripts, plans, or generated files beyond declared package entrypoints;
- claim that all TypeScript declaration digest changes are semantically breaking;
- claim cross-language interoperability without conformance evidence; or
- make this repository a standards body.
