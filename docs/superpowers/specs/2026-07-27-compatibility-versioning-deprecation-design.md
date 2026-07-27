# Compatibility, Versioning, and Deprecation Design

**Architecture direction:** Approved.

**Implementation status:** Implemented; final verification pending.

**Date:** 2026-07-27

## Problem

The SDK now has a distributable package shape and a normative SourceRecord `0.1.0` contract, but contributors and adopters cannot yet tell which changes are safe, which require migration, or how long deprecated behavior remains available. Without an explicit compatibility policy, a patch could silently alter schema acceptance, a package export could disappear without notice, or an object revision could be confused with a package or contract version.

The user need is predictable adoption: a team must be able to upgrade the SDK, exchange a versioned SourceRecord, and automate the CLI without reverse-engineering repository history.

## Decision

Add a language-neutral compatibility contract with three stability levels, independent version domains, explicit additive and breaking change rules, a deprecation lifecycle, and a versioned machine-readable baseline.

This slice stabilizes the boundaries already delivered. It does not freeze unfinished CognitiveObject schemas, promise a `1.0.0` API, select persistence technology, publish the package, or claim universal interoperability.

## Design Principles

1. Normative serialized contracts are independent of the TypeScript implementation.
2. Versioned machine-readable normative artifacts are byte-immutable once committed to the default branch; normative prose is semantically immutable.
3. Package compatibility and serialized-data compatibility are related but independently versioned.
4. Existing consumers, not implementation convenience, determine whether a change is breaking.
5. Pre-`1.0.0` development remains possible, but breaking changes require an explicit process.
6. Deprecation must name a replacement, migration path, and removal window.
7. Machines can enforce declared baselines and process metadata, but semantic classification still requires human review.

## Stability Levels

### Normative Stable

Normative Stable surfaces define portable behavior that implementations and stored data may rely on:

- `spec/source-record.md` rules for SourceRecord `0.1.0`;
- `spec/schemas/0.1.0/source-record.schema.json`, including its `$id`;
- SourceRecord `0.1.0` valid and invalid conformance fixtures;
- the `./schemas/source-record/0.1.0` package subpath;
- SourceRecord canonicalization and canonical `mediaType` plus `content` revision-equality behavior;
- stable SourceRecord error codes `INVALID_SOURCE_RECORD` and `SOURCE_REVISION_COLLISION`; and
- after this slice is implemented, `spec/compatibility.md`, each versioned compatibility baseline and change-case corpus, and its matching package subpath.

Normative Stable behavior MUST NOT change in place. A change to accepted or rejected serialized values, canonical identity, or required error classification creates a new contract version and preserves the previous artifact.

Editorial corrections MAY update prose without a contract-version change only when they do not change behavior and bring the text into agreement with the already-normative artifacts.

### Supported Experimental

Supported Experimental surfaces are public and tested, but may evolve before `1.0.0`:

- root package runtime exports;
- root package TypeScript declarations;
- package export subpaths not explicitly classified as Normative Stable, plus the `collective-cognition` executable;
- generic CLI commands, options, exit behavior, and structured output;
- non-SourceRecord domain error codes exposed from the package root.

When a surface appears in more than one category, the more stable classification controls.

This classification intentionally gives the current cognitive-object, authorization, transition, and event exports patch-level compatibility while they remain public at the package root. It does not make their semantics Normative Stable, publish language-neutral schemas for them, or prevent an RFC-backed breaking change in a pre-`1.0.0` minor release.

Patch releases MUST remain backward compatible. Before `1.0.0`, a minor release MAY make a breaking Supported Experimental change only through an accepted RFC, migration notes, a new compatibility-baseline version, and the deprecation rules in this document.

### Internal

Internal surfaces have no compatibility promise:

- source modules not reachable through the package exports map;
- connector implementations and source-specific CLI entrypoints;
- examples, tests, scripts, plans, and repository-only utilities;
- generated build layout beyond declared package entrypoints.

Internal code MAY change without deprecation when public behavior and normative artifacts remain compatible. Importing an internal repository path does not promote it to a public contract.

## Independent Version Domains

### Package Version

`package.json` uses Semantic Versioning for the installable SDK:

- `PATCH` is for backward-compatible corrections, documentation, and metadata changes.
- `MINOR` is for backward-compatible public additions and new normative contract versions that preserve prior versions.
- Before `1.0.0`, `MINOR` may also include a reviewed breaking change to Supported Experimental surfaces under this project's stricter RFC, deprecation, and migration policy.
- At and after `1.0.0`, breaking public-package changes require `MAJOR`.

This pre-`1.0.0` rule is a project policy layered on Semantic Versioning; it is not a claim that Semantic Versioning itself imposes the RFC or deprecation process.

### Normative Contract Version

The version embedded in a schema path, schema `$id`, conformance path, or serialized `schemaVersion` identifies a language-neutral data contract. It does not automatically equal the package version.

A new normative contract version MAY ship in a backward-compatible package release when the previous contract remains available and existing behavior is unchanged. Replacing or removing an existing contract version is breaking.

### Cognitive Object Revision

The `version` field on a CognitiveObject is an instance revision counter. It is not a package version, schema version, policy version, or compatibility level.

### Policy Identifier

Identifiers such as `neutral-evidence-v1` version a named policy behavior. Changing the meaning of an existing policy identifier is breaking. A behavior change requires a new policy identifier while the previous supported identifier remains available according to the deprecation policy.

### Compatibility Baseline Version

The compatibility baseline is versioned independently under `spec/compatibility/<baseline-version>/`. Its version identifies the policy snapshot used to evaluate a release. An existing baseline is immutable; a changed inventory or policy snapshot requires a new baseline version. Publishing a new baseline does not by itself make a breaking change acceptable; the declared release process must also be satisfied.

## Change Classification

Compatibility is evaluated from the perspective of a conforming existing consumer.

### Additive

A change is additive when every previously valid use keeps the same meaning and outcome. Examples include:

- adding a new root export without changing existing exports;
- adding a new CLI command without changing existing commands, output, or exit behavior;
- adding a new optional capability whose absence preserves current behavior;
- accepting a new namespaced extension without changing core SourceRecord interpretation;
- publishing a new normative contract version while retaining the previous version.

An addition is not automatically safe if it creates a name collision, changes overload selection, alters default behavior, or causes previously invalid input to become valid under an existing normative contract.

### Breaking

A change is breaking when an existing conforming consumer, serialized value, or automation can fail or receive different meaning. Examples include:

- removing or renaming a package export or export subpath;
- narrowing a public TypeScript type;
- changing an existing CLI command, option, exit status, structured output field, or stable diagnostic code;
- changing which values an existing schema version accepts or rejects;
- changing canonicalization or revision-collision behavior;
- changing the meaning of an existing policy identifier;
- removing a previously shipped normative artifact.

Changing human-readable error message wording is not breaking when the stable code, structured fields, stage, and meaning remain unchanged. JSON object member order and diagnostic ordering across independent rejected records are not compatibility guarantees unless a normative document explicitly says otherwise.

### Correction

A correction is patch-compatible only when implementation behavior returns to an already-published normative requirement or documented public contract. The normative source must predate the correction, and a regression test must demonstrate the mismatch.

If prose and implementation were both ambiguous, selecting one interpretation is a compatibility decision rather than a correction and requires the additive or breaking process.

## Compatibility Matrix

| Surface | Additive example | Breaking example | Required control |
| --- | --- | --- | --- |
| Normative schema | Publish `0.2.0` beside `0.1.0` | Change `0.1.0` acceptance | New contract version; preserve old artifact |
| Root SDK | Add a new named export | Remove or narrow an export | Baseline update; breaking changes require RFC and migration |
| Package exports | Add a new subpath | Remove or redirect a subpath incompatibly | Installed-consumer test; breaking process |
| CLI | Add an independent command | Change existing JSON shape or exit behavior | CLI contract tests; breaking process |
| Error behavior | Add an error for a new operation | Reclassify an existing failure | Stable-code tests; breaking process |
| Extension behavior | Support a new namespace explicitly | Reinterpret existing namespaced data | New behavior identifier or breaking process |

## Deprecation Lifecycle

A Supported Experimental surface may be deprecated only when all of the following exist:

1. an accepted RFC identifies the affected consumers and reason;
2. documentation names the replacement;
3. migration notes show the old and new usage;
4. tests keep the deprecated behavior operational;
5. the public declaration or CLI documentation marks it deprecated;
6. the compatibility baseline records the deprecation and earliest removal version.

Before `1.0.0`, a deprecated surface MUST remain functional through at least one subsequent minor package release after the release that first marks it deprecated. Removal may occur only in a later minor release and is a breaking change. A patch release MUST NOT remove it.

A breaking replacement MUST introduce a parallel supported path before removing the old path. A direct behavior change that cannot provide a compatibility path requires an RFC to explain why deprecation is impossible, provide an equivalent migration window, and obtain explicit human approval.

At and after `1.0.0`, removal requires a major package release.

Normative Stable artifacts are not rewritten or deprecated in place. A replacement receives a new version. Any future decision to stop distributing an older versioned artifact requires its own RFC, migration path, support window, and breaking package release.

Runtime deprecation warnings are not added in this slice. They can disrupt structured CLI consumers and host logs. Deprecations are expressed through normative documentation, TypeScript declarations where applicable, CLI help when a help contract exists, migration notes, and the machine-readable baseline.

## Machine-Readable Artifacts

The implementation will add:

```text
spec/
  compatibility.md
  compatibility/
    0.1.0/
      baseline.json
      change-cases.jsonl
rfcs/
  0002-compatibility-versioning-and-deprecation.md
```

`baseline.json` will record:

- baseline and package-policy versions;
- stability-level definitions;
- root runtime export names;
- public TypeScript declaration names;
- SHA-256 digests for the built declaration files reachable from the package root;
- compatibility-relevant package metadata: `name`, `type`, `main`, `types`, `exports`, `bin`, `license`, and `engines.node`;
- the complete emitted-file inventory used to approve package contents;
- generic CLI command names, allowed and required options, option defaults, output channels and shapes, exit-status rules, diagnostic stages, and stable structured diagnostic codes;
- SourceRecord schema path, `$id`, and SHA-256 digest;
- normative prose paths and stable rule identifiers;
- conformance-fixture and change-case paths with SHA-256 digests;
- every exported `DomainErrorCode` member, with the SourceRecord stable subset identified separately;
- canonicalization and source-revision identity contract identifiers;
- supported CLI policy selectors, including `neutral-evidence-v1`;
- SDK policy identities, including `{ "id": "neutral-evidence", "version": "1" }`;
- active deprecations, initially empty.

The baseline will be available through a stable `./compatibility/0.1.0` package subpath and included in the package allowlist with `spec/compatibility.md` and the change cases.

The compatibility metadata inventory does not freeze `package.json` fields omitted from the list, such as package version, description, repository links, scripts, development dependencies, or the temporary `"private": true` publication guard. Recording `engines.node` protects install compatibility; it does not replace the separate supported-runtime and security policy required before publication.

`change-cases.jsonl` will contain at least:

- one additive example that preserves all existing behavior; and
- one breaking example that requires an RFC, migration notes, deprecation handling, and a non-patch release.

Each case will declare its affected stability level, classification, required package-version effect, RFC requirement, migration requirement, and rationale. Tests will verify these declared consequences against the policy matrix. They will not claim to infer the semantic classification of arbitrary changes.

## Enforcement

Repository tests will compare the implementation and packed package against the baseline:

1. root runtime exports exactly match the declared public runtime names;
2. the lockfile-pinned compiler produces declaration-file digests matching the baseline, and representative installed-consumer programs typecheck against the intended signatures;
3. compatibility-relevant package metadata and the complete emitted-file inventory match the baseline;
4. the internal CLI registry exactly matches the baseline command, option, diagnostic, and policy-selector inventories, and contract tests cover every declared default, output shape, output channel, diagnostic stage and code, and exit-status rule;
5. the SourceRecord schema path, `$id`, and SHA-256 digest match exactly;
6. machine-readable normative artifacts match their declared SHA-256 digests, prose exposes the declared stable rule identifiers, and every declared artifact is packaged;
7. implemented and declared domain error-code inventories match exactly, with Normative Stable SourceRecord codes behaviorally exercised;
8. implemented CLI policy selectors and SDK policy identities exactly match their separate baseline inventories and retain golden behavior tests;
9. additive and breaking change cases satisfy the required process metadata.

The CLI command registry may move to an internal shared module so tests can compare command names without exporting repository internals from the package root. This refactor must not change CLI behavior.

The compatibility test will also contain the expected digest of `baseline.json` itself so accidental in-place edits fail. The baseline records digests for the other machine-readable normative artifacts; normative prose uses stable rule identifiers instead of byte identity so behavior-preserving editorial corrections remain possible.

A declaration digest is deliberately conservative: it may flag an internal emitted-declaration change that does not affect consumers. A failing digest or other baseline test is a review gate, not an instruction to update the snapshot automatically. A contributor must inspect the public impact, classify the change, follow the required process, and publish a new baseline version deliberately.

## RFC and Documentation

RFC 0002 will make this policy an accepted repository decision and include alternatives, migration consequences, and explicit deferrals. `rfcs/README.md`, `spec/README.md`, `README.md`, and `docs/ROADMAP.md` will link the compatibility contract and accurately distinguish:

- repository availability from npm publication;
- normative stability from experimental package support;
- package versions from serialized contract and object revision versions;
- public SDK behavior from source-specific connectors and host applications.

All changed Markdown references will be reconciled in the same implementation slice.

## Alternatives Considered

### Treat all `0.x` behavior as unstable

Rejected because teams cannot safely automate upgrades or exchange persisted records if every change may silently break them.

### Freeze the entire current API as stable

Rejected because CognitiveObject schemas, persistence, events, and governance contracts are not yet mature enough for a long-term stability promise.

### Use only prose

Rejected because export lists, schema identity, package paths, and CLI contracts can drift without executable checks.

### Automatically classify every change

Rejected because semantic compatibility cannot be reliably inferred from a diff. Automation will enforce the declared baseline and process consequences, while accountable reviewers classify meaning.

## Acceptance Criteria

The slice is complete when:

- the normative compatibility prose and RFC agree;
- the versioned baseline records every currently public packaged surface covered by this design;
- the SourceRecord schema digest and `$id` are locked;
- public SDK, package, CLI, and stable error behavior have compatibility tests;
- one additive and one breaking fixture exercise the documented process;
- the package dry run and clean-consumer install include and resolve the compatibility artifacts;
- all repository Markdown reflects the implemented status and boundaries;
- independent review finds no unresolved correctness, compatibility, packaging, security, or documentation findings.

Verification will include:

```text
npm test
npx tsc --noEmit
npm run check
npm run example
npm run pack:check
git diff --check
```

## Explicit Deferrals

- No CognitiveObject, relationship, transition, authorization, event, or persistence schema freeze.
- No `1.0.0` stability promise or long-term-support schedule.
- No automated migration engine or universal semantic diff classifier.
- No connector API stabilization or connector marketplace.
- No registry-name confirmation, npm publication, or removal of `"private": true`.
- No hosted compatibility service, database, or mandatory runtime architecture.
- No claim that this repository is a standards body or that untested implementations interoperate.

## Reference

- [Semantic Versioning 2.0.0](https://semver.org/)
