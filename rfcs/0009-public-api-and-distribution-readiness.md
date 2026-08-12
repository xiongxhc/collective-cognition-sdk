# RFC 0009: Public API and Distribution Readiness

**Status:** Implemented
**Created:** 2026-08-12

## Problem

Adopters need one checked policy artifact that explains what is publicly
available, what is still blocked, and what the repository does not claim. A
docs-only summary would drift from the repository evidence. An automated
publication workflow would overstep the remaining human and registry decisions.

## Proposed Semantics

This slice adds a checked Distribution Readiness Profile `0.1.0` at
`spec/distribution-readiness/0.1.0/profile.json` and normative prose at
`spec/distribution-readiness.md`. The profile is closed descriptive policy
data for package version `0.8.0`.

The profile records:

- a blocked overall status;
- four separated channels for public source, GitHub prerelease, npm registry,
  and production use;
- stable `DRP-GATE-*` release gates with rationales and repository evidence;
- separate npm blockers for registry-name verification and human publication
  approval; and
- explicit non-claims for publication authority, security certification,
  production readiness, endorsement, and long-term support.

The profile is not publication authority. Reading it does not publish,
authenticate, certify, endorse, or configure a host.

## Alternatives

### Docs-only guidance

Rejected because it would not remain mechanically synchronized with the
profile, the package manifest, and the repository evidence.

### Automated publication

Rejected because registry-name verification and accountable human publication
approval are still unresolved decisions. Automating publication now would
confuse descriptive readiness with release authority.

## Compatibility and Migration

This slice is additive and does not change the root runtime, CLI behavior, or
existing historical artifacts. The package remains private. The new profile and
prose are closed policy artifacts that later packaging work can consume without
changing the runtime contract.

## Security and Human Authority

The profile preserves the boundary between repository evidence and human
authority. It does not claim security certification, production readiness, or
publication authority. Those decisions remain accountable human and host
responsibilities.

## Acceptance Checks

- The profile test validates the closed top-level keys, status vocabularies,
  gate IDs, npm blockers, non-claims, and repository evidence paths.
- The prose document states `DRP-001` through `DRP-012`, rule-to-check
  mappings, version replacement behavior, channel separation, and
  non-authority.
- The repository keeps `package.json.private === true`.

## Explicit Deferrals

This RFC does not add a package subpath, npm registry credentials, a
publication workflow, a production certification claim, or a change to the
existing runtime surface. Those belong to later packaging and release work.
