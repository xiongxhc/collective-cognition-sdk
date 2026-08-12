# Public API and Distribution Readiness — Design

**Date:** 2026-08-12

**Status:** Approved for implementation by the user's instruction to continue the previously selected Phase 3 public-API and publication-readiness slice while keeping npm publication blocked

## Problem

The repository has a verified package surface, compatibility baselines, security boundaries, and an experimental GitHub prerelease, but an external adopter still has to reconstruct the supported API and release state from `package.json`, declarations, multiple specifications, and the roadmap. That makes two important questions unnecessarily difficult:

1. Which imports and executables are public, and what stability applies to them?
2. Which distribution channels are usable today, and what still blocks npm publication or a production-readiness claim?

The SDK must answer those questions without silently turning a private prerelease package into a published or production-certified product.

## Considered Approaches

### Documentation only

Add a prose API reference and publication checklist. This is easy to read but can drift from package exports, declarations, executables, and compatibility baselines.

### Checked documentation plus a versioned machine profile

Add a public API reference whose inventory is verified against the current compatibility baseline and package manifest. Add a versioned Distribution Readiness Profile with closed statuses, evidence links, blockers, and explicit non-claims. Expose the profile through a JSON package subpath and preserve `"private": true`.

This is the selected approach because it gives humans a usable reference and automation a closed status artifact without adding runtime behavior or authorizing publication.

### Automated npm publication

Add registry authentication and a publication workflow. This is rejected because registry-name confirmation, external review, and explicit human publication approval remain unresolved consequential decisions. It would also expand the trusted release surface before the package contract is ready.

## Scope

This slice adds:

- a complete public API reference for the package root, versioned subpaths, and installed executables;
- Normative Stable Distribution Readiness Profile `0.1.0` prose with stable rule identifiers;
- a closed machine-readable profile at `spec/distribution-readiness/0.1.0/profile.json`;
- a package subpath at `collective-cognition-sdk/distribution-readiness/0.1.0`;
- tests that reconcile the reference, profile, package manifest, compatibility baseline, and package contents;
- additive private package `0.8.0` compatibility evidence;
- RFC 0009 and current README, specification index, RFC index, compatibility policy, and roadmap updates.

This slice does not:

- remove `"private": true`;
- confirm npm registry-name availability;
- add registry credentials, npm publication commands, or a publishing workflow;
- describe the package as production-ready, certified, endorsed, or LTS;
- change the root runtime or type API, CLIs, schemas, connectors, adapters, persistence, or host behavior;
- rewrite any historical compatibility, conformance, prerelease, or normative artifact.

## Public API Reference

`docs/public-api.md` is the human entrypoint. It groups the root API by responsibility and lists every root runtime export, root type export, package subpath, and executable recorded by compatibility baseline `0.8.0`.

The reference distinguishes:

- **Normative Stable artifacts:** immutable versioned semantic and policy artifacts;
- **Supported Experimental surfaces:** tested package runtime, declarations, adapters, connectors, stores, and executables that remain subject to the pre-1.0 compatibility policy;
- **Internal surfaces:** repository paths absent from the package export map.

An automated test reads the current baseline and package manifest, then requires every recorded root export, subpath, and executable to appear as a code-formatted token in the reference. The test also requires the documented stability and non-claim language. Documentation can add explanation, but it cannot omit an exported surface.

## Distribution Readiness Profile

The JSON profile is a closed descriptive policy record with:

- `profileVersion` and the package version it describes;
- one overall status from `ready`, `blocked`, or `not-claimed`;
- channel statuses for source, GitHub prerelease, npm registry, and production use;
- release gates with stable IDs, closed states, rationale, and repository evidence paths;
- explicit blockers for registry-name verification and human publication approval;
- explicit non-claims covering publication authority, security certification, production readiness, endorsement, and LTS.

The current profile reports:

- public source: `available`;
- experimental GitHub prerelease: `available` for immutable historical `v0.6.0` only;
- npm registry: `blocked`;
- production readiness: `not-claimed`;
- overall status: `blocked`.

Importing or reading the profile has no side effects and grants no authority. A future status change requires a new versioned profile and compatibility baseline; `0.1.0` is never edited in place after distribution.

## Normative Rules

- `DRP-001`: The profile version and described package version MUST be explicit.
- `DRP-002`: Status values and object members MUST use the closed profile vocabulary.
- `DRP-003`: npm publication MUST remain blocked while `package.json` is private or any mandatory npm gate is not satisfied.
- `DRP-004`: Registry-name availability MUST remain unverified until checked against the registry at release time.
- `DRP-005`: Explicit accountable-human approval MUST be a mandatory npm publication gate.
- `DRP-006`: Production readiness MUST be reported separately from package or prerelease availability.
- `DRP-007`: Every satisfied repository-controlled gate MUST point to existing evidence; external gates MUST NOT be represented as repository-verified.
- `DRP-008`: The public API reference MUST enumerate every baseline root export, package subpath, and executable.
- `DRP-009`: Stability labels MUST match the compatibility policy and MUST NOT upgrade Supported Experimental surfaces implicitly.
- `DRP-010`: Reading or importing the profile MUST NOT publish, authenticate, certify, endorse, or configure a host.
- `DRP-011`: Profile replacement MUST use a new version and preserve previously distributed bytes.
- `DRP-012`: Package contents MUST include the public reference, normative prose, machine profile, RFC, and compatibility evidence while excluding implementation plans.

## Failure and Drift Handling

Tests fail closed when:

- the profile contains an unknown member, status, gate ID, or non-claim ID;
- a required blocker is marked satisfied without a new profile version and reviewed compatibility change;
- `"private": true` is removed while the profile remains blocked;
- a profile evidence path is missing;
- a package export, executable, runtime export, or type export is missing from the public reference;
- the package subpath or tarball artifact is absent;
- the `0.8.0` compatibility baseline does not classify the change as additive.

The checks do not query npm or infer production fitness. Registry and deployment evidence is time-sensitive and remains an explicit release-time or host-owned responsibility.

## Compatibility

Private package `0.8.0` is additive before `1.0.0`. It adds one JSON package subpath and public documentation without changing existing root exports, executable behavior, schemas, policy identities, or historical artifacts.

Baseline `0.8.0` records the new package version, subpath, files, profile digest, and additive change case. Historical baselines and versioned artifacts remain byte-identical.

## Acceptance

The slice is accepted when:

1. focused profile and documentation tests pass;
2. compatibility and package tests pass from a clean build and consumer install;
3. the profile imports through the packed package and reports npm `blocked` plus production `not-claimed`;
4. all current source, schema, typecheck, syntax, example, and package checks pass;
5. historical versioned artifacts are byte-identical to `main`;
6. an independent whole-branch review finds no unresolved Critical or Important issue;
7. package `0.8.0` remains private and unpublished.

