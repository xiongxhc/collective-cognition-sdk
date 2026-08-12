# Distribution Readiness Profile 0.1.0

## Status and Scope

This document defines profile version `0.1.0` for private package version
`0.8.0`. Private package `0.8.0` already packages the read-only
`./distribution-readiness/0.1.0` JSON subpath. Reading or importing it is
side-effect-free and grants no publication, authentication, certification,
endorsement, host-configuration, or production authority. It is descriptive
policy data, not an operational release workflow.

## Closed Vocabulary

The profile uses a closed top-level shape:

- `profileVersion`
- `describesPackageVersion`
- `overallStatus`
- `channels`
- `gates`
- `npmBlockers`
- `nonClaims`

The closed status vocabularies are:

- overall status: `ready`, `blocked`, `not-claimed`
- channel status: `available`, `blocked`, `not-claimed`
- gate status: `satisfied`, `blocked`, `not-claimed`
- npm blocker status: `blocked`
- non-claim status: `not-claimed`

## Channels

The four channels are separated on purpose.

- `public-source` reports whether the repository source and attribution
  evidence are present.
- `github-prerelease` reports the immutable historical GitHub prerelease
  release tag `v0.6.0`, package version `0.6.0`, and commit
  `76f289b7f1514f4bc490d0de6dbffbb61a4c9f0e`.
- `npm-registry` reports whether registry publication is blocked.
- `production-use` reports whether production use is claimed.

The current profile sets public source and GitHub prerelease to `available`,
npm registry to `blocked`, production use to `not-claimed`, and overall status
to `blocked`.

The GitHub prerelease evidence bytes at `docs/github-prerelease.md` must name
the same historical tag, package version, and commit so the profile is tied to
an immutable release identity rather than a generic file presence check.

## Release Gates

Each gate has a stable `DRP-GATE-*` identifier, a closed status, a short
rationale, and repository evidence paths.

- `DRP-GATE-001` records that public source and Apache-2.0 attribution
  evidence are present.
- `DRP-GATE-002` records that the GitHub prerelease evidence is immutable and
  historical.
- `DRP-GATE-003` records that npm registry readiness remains blocked while the
  package stays private and registry-name verification remains unresolved.
- `DRP-GATE-004` records that publication requires a separate accountable
  human approval.
- `DRP-GATE-005` records that production use is not claimed by this
  repository.

## Npm Blockers

The npm blockers are distinct from the channels so the profile can say what is
blocked without pretending to publish.

- `DRP-NPM-001` — registry-name verification is not complete.
- `DRP-NPM-002` — accountable human publication approval is not recorded.

These blockers are repository policy statements only. They do not perform
registry lookups or grant release authority.

## Explicit Non-Claims

The profile also carries a closed set of non-claims:

- `DRP-NC-001` — publication authority
- `DRP-NC-002` — security certification
- `DRP-NC-003` — production readiness
- `DRP-NC-004` — endorsement
- `DRP-NC-005` — long-term support

These non-claims are explicit boundaries, not omissions.

## DRP-001

The profile version and described package version MUST be explicit.

## DRP-002

Status values and object members MUST use the closed profile vocabulary.

## DRP-003

npm publication MUST remain blocked while `package.json` is private or any
mandatory npm gate is not satisfied.

## DRP-004

Registry-name availability MUST remain unverified until checked against the
registry at release time.

## DRP-005

Explicit accountable-human approval MUST be a mandatory npm publication gate.

## DRP-006

Production readiness MUST be reported separately from package or prerelease
availability.

## DRP-007

Every satisfied repository-controlled gate MUST point to existing evidence;
external gates MUST NOT be represented as repository-verified.

## DRP-008

The public API reference MUST enumerate every baseline root export, package
subpath, and executable.

## DRP-009

Stability labels MUST match the compatibility policy and MUST NOT upgrade
Supported Experimental surfaces implicitly.

## DRP-010

Reading or importing the profile MUST NOT publish, authenticate, certify,
endorse, or configure a host.

## DRP-011

Profile replacement MUST use a new version and preserve previously distributed
bytes.

## DRP-012

Package contents MUST include the public reference, normative prose, machine
profile, RFC, and compatibility evidence while excluding implementation plans.

## Rule-to-Check Mapping

| Rule | Primary check |
| --- | --- |
| DRP-001 | `tests/distribution-readiness-profile.test.ts` compares the explicit profile and package versions. |
| DRP-002 | `tests/distribution-readiness-profile.test.ts` rejects unknown keys and unknown states. |
| DRP-003 | `tests/distribution-readiness-profile.test.ts` requires a blocked npm channel while the package is private and blockers remain. |
| DRP-004 | `tests/distribution-readiness-profile.test.ts` requires the registry-name blocker to remain unresolved without external release-time evidence. |
| DRP-005 | `tests/distribution-readiness-profile.test.ts` requires a distinct accountable-human approval blocker. |
| DRP-006 | `tests/distribution-readiness-profile.test.ts` verifies production readiness separately as `not-claimed`. |
| DRP-007 | `tests/distribution-readiness-profile.test.ts` validates satisfied gate evidence with repository containment and keeps external gates blocked. |
| DRP-008 | `tests/distribution-readiness-profile.test.ts` reconciles the public reference with baseline root exports, subpaths, and executables. |
| DRP-009 | `tests/distribution-readiness-profile.test.ts` verifies Supported Experimental labels without implicit stability upgrades. |
| DRP-010 | `tests/distribution-readiness-profile.test.ts` and `tests/package.test.mjs` verify read-only import plus the non-authority boundary. |
| DRP-011 | `tests/compatibility.test.mjs` pins historical baselines and previously distributed artifact digests. |
| DRP-012 | `tests/package.test.mjs` checks exact package contents and excludes `docs/superpowers/plans/`. |

## Versioning and Replacement

This profile is closed and versioned. A semantic change requires a new profile
version and a new reviewed artifact. The previously distributed `0.1.0` bytes
remain preserved as history.

## Non-Authority

This profile does not grant publication authority, security certification,
endorsement, or production approval. It is checked policy data, not an
operational decision record.

## Explicit Deferrals

This document does not add npm credentials, registry authentication,
publication workflows, or production deployment authority. Those decisions
remain deferred to later package and host work.
