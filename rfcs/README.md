# Request for Comments

RFCs are the contribution path for changes that affect collective-cognition semantics, compatibility, governance, or more than one adapter. They turn design discussion into a reviewable decision with alternatives, consequences, and explicit deferrals.

## RFC Index

- [RFC 0001: Universal Source-Record Ingestion](0001-universal-source-record-ingestion.md) — implemented and final-review verified in Phase 2 with closed immutable records, pre-parse limits, full-payload promotion identity, secret-safe diagnostics, privacy-default connectors, fail-closed authorization, canonical fixtures, and two source-specific connector implementations.
- [RFC 0002: Compatibility, Versioning, and Deprecation](0002-compatibility-versioning-and-deprecation.md) — implemented and final-review verified in Phase 3 with a Normative Stable `0.1.0` baseline, explicit stability classes, immutable artifact hashes, compatibility checks, and additive and breaking process examples.
- [RFC 0003: Portable Cognition Contract](0003-portable-cognition-contract.md) — implemented and final-review verified in Phase 3 with a Normative Stable `0.1.0` exchange envelope and a historical private package `0.2.0` surface; the current package is private, unpublished `0.9.0`.
- [RFC 0004: Host Integration Contract](0004-host-integration-contract.md) — implemented and final-review verified in Phase 3 with a Normative Stable `0.1.0` host-owned persistence and publication contract, deterministic conformance evidence, and a private, unpublished package reference surface.
- [RFC 0005: SQLite Cognition Store](0005-sqlite-cognition-store.md) — Implemented and final-review verified. It adds the optional `collective-cognition-sdk/stores/sqlite/0.1.0` reference adapter and private, unpublished package `0.4.0` without changing the root API.
- [RFC 0006: Maintained Source Connectors](0006-maintained-source-connectors.md) — implemented and final-review verified, with source-neutral conformance, one maintained compatible connector, a dedicated CLI, independent-package guidance, real-ledger acceptance, and historical private, unpublished package `0.5.0`.
- [RFC 0007: Markdown Cognition Adapter](0007-markdown-cognition-adapter.md) — implemented and final-review verified in the source checkout and private, unpublished package `0.6.0`, including its compatibility baseline, dedicated executable, and clean-consumer verification. It defines a deterministic read-only projection into an explicitly initialized managed directory without vault or Git discovery.
- [RFC 0008: Runtime and Security Profile](0008-runtime-security-profile.md) — implemented and verified with a versioned JSON inventory at `collective-cognition-sdk/runtime-security/0.1.0`, explicit `sdk-enforced`, `conformance-verified`, `host-required`, and `out-of-scope` classes, and a boundary that leaves authentication, encryption, tenant or workspace isolation, and durable publication recovery host-owned. At that slice boundary, the package was private, unpublished `0.7.0`; historical package `0.8.0` superseded it additively, and current package `0.9.0` preserves both baselines. Conformance is not certification.
- [RFC 0009: Public API and Distribution Readiness](0009-public-api-and-distribution-readiness.md) — implemented for historical private, unpublished package `0.8.0` with a checked [public API reference](../docs/public-api.md), Normative Stable Distribution Readiness Profile `0.1.0` [prose](../spec/distribution-readiness.md) and [JSON](../spec/distribution-readiness/0.1.0/profile.json), and additive compatibility evidence. It reports npm as blocked and production use as not claimed; reading the profile grants no publication authority. Current private package `0.9.0` preserves that historical profile without publication authority.
- [RFC 0010: Durable Cognition Workflow](0010-durable-cognition-workflow.md) — implemented for private, unpublished package `0.9.0` with source-neutral workflow and SQLite workflow-store subpaths plus the closed `collective-cognition-workflow` executable. It requires a new explicit SQLite v2 database, keeps Markdown non-authoritative, gives the CLI no publisher, and makes no scheduler, automatic-cognition, security-certification, publication, or production claim.

## When an RFC Is Required

Write an RFC before changing:

- core object fields, relationships, or lifecycle transitions;
- authorization or human-confirmation boundaries;
- event, serialization, schema, or compatibility contracts;
- source-record, ingestion, promotion, or connector boundaries;
- adapter interoperability requirements;
- extension governance, migrations, or deprecation policy.

Documentation corrections, examples that preserve existing semantics, and implementation bug fixes do not require an RFC. Every accepted RFC must identify all repository Markdown files that need reconciliation.

## Proposal Format

Create `rfcs/0000-short-title.md` for discussion. Assign a stable number when the proposal is accepted for formal review.

Every RFC should contain:

```markdown
# RFC: Short Title

**Status:** Draft
**Authors:** Names or identities
**Created:** YYYY-MM-DD

## Problem
The user or interoperability problem, with concrete evidence.

## Proposed Semantics
Normative behavior and affected objects, transitions, events, or adapters.

## Alternatives
At least one credible alternative and why it was not selected.

## Compatibility and Migration
Impact on existing objects, versions, extensions, and implementations.

## Security and Human Authority
Authorization, consent, provenance, and confirmation consequences.

## Acceptance Checks
Executable fixtures, tests, or observable review criteria.

## Explicit Deferrals
Related work this RFC does not authorize.
```

## Review Lifecycle

1. **Draft:** establish the problem, evidence, alternatives, and acceptance checks.
2. **Review:** resolve contradictions with the core design and existing accepted RFCs.
3. **Accepted or rejected:** record the rationale and accountable human decision.
4. **Implemented:** link conformance fixtures, code, migration notes, and verification output.
5. **Superseded:** retain the historical RFC and link its replacement.

Acceptance means the semantics are approved for implementation. It does not claim implementation, interoperability, or production validation until the linked checks pass.
