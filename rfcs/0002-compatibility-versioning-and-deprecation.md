# RFC 0002: Compatibility, Versioning, and Deprecation

**Status:** Implemented and final-review verified

**Created:** 2026-07-27
**Decision owner:** Project maintainer

## Problem

The SDK has a distributable package shape and a Normative Stable SourceRecord `0.1.0` contract, but it has no accepted rule for deciding which changes are additive, breaking, or corrective. Consumers cannot determine whether a package upgrade preserves their imports, declarations, CLI automation, stored SourceRecords, error handling, or policy identities.

The repository needs one language-neutral policy and an executable inventory that expose drift without pretending that automation can classify semantic compatibility.

## Proposed Semantics

The repository adopts [`spec/compatibility.md`](../spec/compatibility.md) as its normative compatibility, versioning, and deprecation policy.

The policy defines:

- Normative Stable, Supported Experimental, and Internal stability levels, with the more stable classification controlling overlap;
- independent package, normative-contract, CognitiveObject-revision, policy-identity, and compatibility-baseline version domains;
- additive, breaking, and corrective change classifications;
- package release meanings before and after `1.0.0`;
- an RFC-backed deprecation lifecycle with a replacement, migration, retained tests, public marking, and earliest removal version; and
- human classification of baseline failures.

The inaugural compatibility baseline is `spec/compatibility/0.1.0/baseline.json`. It records the exact stability definitions, Normative Stable artifacts, package metadata, emitted-file inventory, root runtime and type exports, root-reachable declaration closure, domain error codes, internal generic CLI registry, policy identities, and active deprecations for package `0.1.0`.

The package is unpublished. This baseline establishes the initial contract before publication; it does not retroactively stabilize an earlier release.

## Alternatives

### Treat Every Pre-1.0 Surface as Unstable

Rejected because serialized contracts, package imports, and CLI automation cannot be adopted predictably if patch releases may silently repurpose or remove them.

### Freeze the Entire Current SDK as Normative Stable

Rejected because CognitiveObject, relationship, transition, authorization, event, persistence, and connector contracts are not mature enough for a language-neutral stability promise.

### Keep Only a Prose Policy

Rejected because package exports, declarations, schema identity, error codes, CLI behavior, and policy identities can drift without executable exact-inventory checks.

### Automatically Classify Diffs

Rejected because semantic compatibility depends on existing consumer meaning. Automation can expose drift and validate declared process metadata, but accountable humans must classify the change.

## Compatibility and Migration

This RFC removes no existing behavior. There is no fictional published-user migration because package `0.1.0` has not been published.

The SourceRecord `0.1.0` schema, fixtures, canonical equality, source-revision identity, stable errors, and immutable versioned artifacts are Normative Stable. The root package, declarations, executable, generic CLI behavior, and other domain errors remain Supported Experimental.

After publication, future backward-compatible public additions use a minor package release. Future pre-`1.0.0` breaking Supported Experimental changes require an accepted RFC, migration notes, deprecation, a new compatibility baseline, and a non-patch release. Existing Normative Stable artifacts are preserved under their original versions.

The new `./compatibility/0.1.0` package subpath exposes the baseline without exporting the internal `CLI_CONTRACT` from the package root.

## Security and Human Authority

This policy does not change authorization, consent, provenance, source validation, promotion, or human-confirmation behavior.

Baseline checks are review gates, not permission to rewrite snapshots. A human maintainer remains accountable for identifying affected consumers, classifying semantic impact, accepting RFCs, approving migration windows, and authorizing publication or removal.

Runtime deprecation warnings are deferred because they can corrupt structured CLI streams or disclose operational details through host logs. Documentation, declarations, migration notes, and versioned baseline metadata carry deprecation signals in this slice.

## Acceptance Checks

- The baseline file has two-space JSON formatting, one terminal newline, and a hard-coded SHA-256 digest in the compatibility test.
- Normative schema, conformance, and change-case artifacts match exact declared SHA-256 digests.
- SourceRecord and compatibility prose expose exact stable rule-ID inventories.
- Root runtime exports, TypeScript type exports, domain error codes, and the root-reachable declaration closure match exact baseline inventories.
- Compatibility-relevant package metadata and the emitted-file inventory match exactly.
- The built internal `CLI_CONTRACT` matches the baseline exactly without widening the package root.
- CLI selectors and SDK policy identities remain linked.
- Exactly one additive and one breaking change case exercise the declared process consequences and reject unknown enum values.
- Existing SourceRecord validation, ingestion, and promotion evidence remains green.

## Explicit Deferrals

- Package publication, registry-name confirmation, and removal of `"private": true`.
- A `1.0.0` stability promise or long-term-support schedule.
- Normative schemas for CognitiveObject, relationships, transitions, authorization, events, persistence, or connectors.
- An automated migration engine or universal semantic compatibility classifier.
- Runtime deprecation warning output.
- Retirement of any Normative Stable artifact.
- A hosted compatibility service, database, connector marketplace, or mandatory runtime architecture.
