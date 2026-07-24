# Request for Comments

RFCs are the contribution path for changes that affect collective-cognition semantics, compatibility, governance, or more than one adapter. They turn design discussion into a reviewable decision with alternatives, consequences, and explicit deferrals.

## Implemented RFCs

- [RFC 0001: Universal Source-Record Ingestion](0001-universal-source-record-ingestion.md) — implemented in Phase 2 with canonical fixtures, conformance tests, generic CLI operations, a migrated team-memory connector, and a second Git fixture connector.

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
