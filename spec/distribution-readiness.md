# Distribution Readiness Profile 0.1.0

## Status and Scope

This document defines profile version `0.1.0` for private package version
`0.8.0`. It is descriptive policy data, not publication authority, production
certification, or an operational release workflow. The profile can be read,
checked, and packaged later, but it does not itself authorize npm publication
or production use.

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

The profile version and the package version it describes MUST both be explicit
and versioned.

## DRP-002

The profile MUST use closed top-level keys and closed state vocabularies.
Unknown keys or unknown states are invalid.

## DRP-003

The `public-source` channel MUST remain separate from registry or production
claims. Source availability does not authorize publication.

## DRP-004

The `github-prerelease` channel MUST describe immutable historical evidence,
not a mutable release target.

## DRP-005

The `npm-registry` channel MUST stay blocked while `package.json` remains
private or any npm blocker remains unresolved.

## DRP-006

The `production-use` channel MUST stay separate from package availability and
MUST remain `not-claimed` until a future profile says otherwise.

## DRP-007

Release gates MUST use stable `DRP-GATE-*` identifiers, a closed status, a
single-line rationale, and repository evidence paths.

## DRP-008

Repository evidence paths MUST be repository-relative, must already exist, and
must not rely on inferred external state.

## DRP-009

Npm blockers MUST capture registry-name verification and accountable human
publication approval as separate concerns.

## DRP-010

The non-claim inventory MUST explicitly cover publication authority, security
certification, production readiness, endorsement, and long-term support.

## DRP-011

Reading or importing the profile MUST NOT publish, authenticate, certify,
endorse, or configure any host.

## DRP-012

Any semantic replacement MUST use a new versioned profile artifact and MUST
preserve previously distributed bytes.

## Rule-to-Check Mapping

| Rule | Primary check |
| --- | --- |
| DRP-001 | `tests/distribution-readiness-profile.test.ts` compares the explicit profile and package versions. |
| DRP-002 | `tests/distribution-readiness-profile.test.ts` rejects unknown keys and unknown states. |
| DRP-003 | `tests/distribution-readiness-profile.test.ts` confirms the public-source channel inventory. |
| DRP-004 | `tests/distribution-readiness-profile.test.ts` confirms the immutable prerelease evidence. |
| DRP-005 | `tests/distribution-readiness-profile.test.ts` confirms the npm registry channel stays blocked while `package.json.private === true`. |
| DRP-006 | `tests/distribution-readiness-profile.test.ts` confirms `production-use` is `not-claimed`. |
| DRP-007 | `tests/distribution-readiness-profile.test.ts` checks unique `DRP-GATE-*` identifiers and required gate fields. |
| DRP-008 | `tests/distribution-readiness-profile.test.ts` validates repository-relative evidence paths and existing files. |
| DRP-009 | `tests/distribution-readiness-profile.test.ts` checks distinct npm blocker entries. |
| DRP-010 | `tests/distribution-readiness-profile.test.ts` checks the explicit non-claim inventory. |
| DRP-011 | `rfcs/0009-public-api-and-distribution-readiness.md` and this document state the non-authority boundary. |
| DRP-012 | Future versioned replacements must add a new profile version and preserve historical bytes. |

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
