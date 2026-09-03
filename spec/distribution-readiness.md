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

## Candidate Profile Extension 0.2.0-rc.N

Profile versions matching `0.2.0-rc.N`, where `N` is a positive integer without
leading zeros, describe one release-candidate package artifact before
publication. Final profile `0.2.0` describes the stable package before
publication. Both keep every member and closed status vocabulary of profile
`0.1.0`, supersede only the descriptive status of `0.1.0`, and never modify its
distributed bytes.

A candidate profile adds exactly three top-level members after the historical
ones:

- `supportedRuntime` — the exact `engines.node` range the described package
  declares;
- `supportBoundaries` — the recorded stable and experimental support
  boundaries;
- `plannedPublication` — the expected publication identity of an artifact that
  is not published.

The candidate top-level shape is therefore `profileVersion`,
`describesPackageVersion`, `supportedRuntime`, `overallStatus`, `channels`,
`gates`, `npmBlockers`, `supportBoundaries`, `plannedPublication`, and
`nonClaims`.

`supportBoundaries` is a closed array. Each entry has a unique
`DRP-SUPPORT-NNN` identifier, a `stability` value from the closed vocabulary
`normative-stable` and `supported-experimental`, and repository evidence paths.
Both stability values MUST appear so the profile records the stable and the
experimental boundary rather than one of them.

`plannedPublication` is a closed object:

- `registryName` — the exact package name the registry entry is expected to
  use;
- `provenanceMechanism` — the approved provenance mechanism,
  `github-actions-oidc-trusted-publishing`;
- `intendedTag` — the intended immutable annotated Git tag, which is `v`
  followed by the described package version;
- `workflow` — a closed object whose `path` is `.github/workflows/npm-publish.yml`
  and whose `environment` is `npm-production`.

`describesPackageVersion` MUST name one exact Semantic Versioning prerelease
version. `plannedPublication` records intent. Its members are expected identity
rather than repository-verified evidence, so the release workflow file is not
required to exist while the candidate artifact remains unbuilt.

A candidate profile keeps the `npm-registry` channel `blocked`, keeps
`DRP-NPM-001` registry-name verification and `DRP-NPM-002` accountable-human
approval as two distinct blockers, and keeps `overallStatus` `blocked`. The
extension introduces no new status value. `pending` and every other value
outside the closed vocabulary is rejected.

## Release Evidence Record

Facts that cannot exist before the package bytes are published belong to a
separate, non-packaged Release Evidence Record rather than to a packaged
profile. Each record uses the repository path
`docs/acceptance/releases/<version>/release-evidence.json` and the release asset
name `collective-cognition-sdk-<version>-release-evidence.json`. The repository
copy and the downloaded asset MUST be byte-identical. The SHA-256 of the record
bytes is recorded in the GitHub release notes and in
`docs/acceptance/releases/<version>/SHA256SUMS`, which carries one
`<digest>  <file name>` line per record file.

Each record uses a closed shape:

- `evidenceRecordVersion` — the record contract version `0.1.0`;
- `packageVersion` — the exact published version, which MUST equal the
  directory name;
- `registryPublication` — `publishedAt`, `archiveDigest`, and `distTags`;
- `npmProvenance` — `identity` and `verified`;
- `gitTag` — `name`, `tagObjectSha`, and `commitSha`;
- `githubRelease` — `tag`, `workflowPath`, and `workflowRunId`;
- `cleanConsumer` — `status` and `nodeVersion`.

A record file is named `release-evidence.json` or
`release-evidence-amendment-N.json`, where `N` is a positive integer without
leading zeros. An amendment adds the closed members `amendsRecord` and
`amendmentNumber`, references the original file, and never replaces its bytes.
Any other record file name is a replacement rather than an amendment and is
rejected.

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

## DRP-013

A candidate profile MUST use a `0.2.0-rc.N` profile version and MUST describe
one exact package prerelease version.

## DRP-014

A candidate profile MUST record the supported runtime, both support
boundaries, the expected registry publication identity, the approved
provenance mechanism, the intended immutable Git tag, and the release workflow
identity as intent rather than repository-verified publication evidence.

## DRP-015

Observed publication facts MUST live only in a separate non-packaged Release
Evidence Record whose repository copy and release asset are byte-identical and
digest-bound, are never replaced, and are corrected only by append-only
numbered amendments.

## DRP-016

A release archive MUST be verified from its own bytes against the declared
package contents, package version, exports, executables, and inspection rules
that exclude credentials and local absolute paths before it is treated as a
release candidate. Verification MUST install the archive with
`--ignore-scripts` into a clean temporary consumer and execute the installed
exports and executables there, so the archive's own code is exercised rather
than the repository's.

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
| DRP-013 | `tests/distribution-readiness-profile.test.ts` accepts `0.2.0-rc.N` candidate versions describing exact package prereleases and rejects every other version series. |
| DRP-014 | `tests/distribution-readiness-profile.test.ts` validates the candidate runtime, support boundaries, and planned publication identity and rejects `pending` or unknown members. |
| DRP-015 | `tests/release-evidence.test.ts` runs `scripts/verify-release-evidence.mjs` over record paths, asset names, byte identity, digests, replacement rejection, and amendment naming. |
| DRP-016 | `tests/package-archive.test.ts` runs `scripts/verify-package-archive.mjs` over exact archive contents, package version, exports, executables, and secret exclusion. |

## Versioning and Replacement

This profile is closed and versioned. A semantic change requires a new profile
version and a new reviewed artifact. The previously distributed `0.1.0` bytes
remain preserved as history. Candidate `0.2.0-rc.N` and final `0.2.0`
are separate immutable packaged resources that supersede the descriptive status
of `0.1.0` without rewriting it. A Release Evidence Record is never replaced;
a correction is an append-only numbered amendment that retains and references
the original bytes.

## Non-Authority

This profile does not grant publication authority, security certification,
endorsement, or production approval. It is checked policy data, not an
operational decision record.

## Explicit Deferrals

This document does not add npm credentials, registry authentication,
publication workflows, or production deployment authority. Those decisions
remain deferred to later package and host work.
