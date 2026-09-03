# RFC 0012: Phase 3 Charter and Stable Package

**Status:** Accepted; Slice A integrated on `main` with post-merge CI evidence
**Created:** 2026-08-25

The private, unpublished `0.11.0` Slice A is integrated on `main` at merge commit `669b3ed3a30cccee098730fe6cf558bc37e18ac5` via PR #15; its PR checks all passed. Post-merge CI run `32950251966` passed all eight jobs, including Node `24.14.0` Ubuntu job `98119822963`, which passed "runs a fictional external host through an explicit source fixture and SQLite target". This records supported-runtime CI acceptance only; real-device acceptance, public RC/stable publication, npm OIDC/bootstrap work, production readiness, adoption, certification, SLA, and LTS remain pending or unclaimed.

## Problem

The SDK has immutable SourceRecord, Portable Cognition, Host Integration,
Runtime and Security, and compatibility contracts, but no single
language-neutral Charter connects their cognitive semantics. Consumers therefore
cannot distinguish the portable core from host-owned behavior or know which
future resources form the stable package boundary.

## Decision

Phase 3 adopts a contract-first architecture led by the [Collective Cognition
Charter `1.0.0`](../spec/collective-cognition-charter.md). The Charter composes
the existing [SourceRecord](../spec/source-record.md), [Portable
Cognition](../spec/portable-cognition.md), [Host Integration](../spec/host-integration.md),
[Runtime and Security](../spec/runtime-security.md), and
[compatibility](../spec/compatibility.md) contracts without changing any
historical versioned resource.

Portable Cognition `0.1.0` remains immutable and authoritative. Standalone
cognitive-object and cognition-event resources are projections of its existing
payload definitions: a standalone payload conforms if and only if its implicit
canonical Portable Cognition `0.1.0` envelope conforms. They do not create a
Portable Cognition `1.0.0`, change existing event versions, widen acceptance,
or reinterpret historical fixtures.

## Maturity and Compatibility

The Charter, its versioned schemas, fixtures, profiles, and compatibility
baselines are Normative Stable when released. The stable package boundary will
be SemVer protected at `1.0.0`. Connectors, adapters, stores, reference hosts,
conformance harnesses, and durable workflows can remain Supported Experimental
in operational maturity; that label does not permit incompatible changes in a
`1.x` package.

The root twelve-code `DomainErrorCode` catalog remains distinct from Portable
Cognition's immutable eleven-code portable error allowlist. The host-only
`INVALID_HOST_INTEGRATION_REQUEST` remains root-only.

## Compatibility Policy Version `1.0.0`

The stability matrix changes the compatibility policy itself. `spec/compatibility.md`
is Normative Stable, and `COMP-002` forbids a behavior-changing in-place edit to
a Normative Stable resource, so the revision is published through the policy's
existing version mechanism rather than as an unversioned amendment. Every
compatibility baseline records a `packagePolicyVersion`. The revised rules are
published as `packagePolicyVersion` `1.0.0` in a delimited section of the same
document, the policy `0.1.0` rules are retained unedited beside them, and
baselines `0.1.0` through `0.11.0` keep recording policy `0.1.0`. The rules that
governed those releases therefore remain recoverable from the immutable
baselines and from this RFC.

Compatibility baseline `1.0.0-rc.1` and every later baseline record
`packagePolicyVersion` `1.0.0`.

### Stable `1.0.0` classification

| Surface | `1.0.0` classification | Compatibility rule |
| --- | --- | --- |
| The thirty-seven root runtime exports and seventy-four root type exports recorded by the baseline | Stable Public API | Removal or an incompatible behavior or type change requires package `2.0.0`. |
| The twelve-code root `DomainErrorCode` catalog | Stable Public API | Removal or changed meaning requires package `2.0.0`; the immutable eleven-code Portable Cognition allowlist stays separate. |
| The `.` root export and the generic `collective-cognition` executable | Stable Public API | Command names, machine-readable success output, diagnostics, and exit behavior are SemVer protected. |
| The thirty-one versioned normative resource subpaths: Charter, contracts, schemas, conformance fixtures, profiles, and compatibility baselines | Normative Stable | Published versioned bytes and meanings are immutable; a changed contract uses a new resource version. |
| `./adapters/markdown/0.1.0`, `./connector-conformance/0.1.0`, `./connectors/team-memory/0.1.0`, `./connectors/git/0.1.0`, `./host-conformance/0.1.0`, `./reference-host/0.1.0`, `./stores/sqlite/0.1.0`, `./stores/sqlite-workflow/0.1.0`, `./workflows/durable/0.1.0` | Supported Experimental maturity, SemVer protected | Existing versioned subpaths remain import-compatible through package `1.x`; an incompatible replacement uses a new versioned subpath or package `2.0.0`. |
| `collective-cognition-teammem`, `collective-cognition-markdown`, and `collective-cognition-workflow` | Supported Experimental maturity, SemVer protected | Installed names and documented behavior remain compatible through package `1.x`; an incompatible replacement requires package `2.0.0`. |
| The `./package.json` export and the eleven selected package metadata fields | Stable introspection surface | Baseline-selected fields follow the compatibility policy. |
| Repository source, tests, examples, generated file paths, and unexported modules | Internal | No compatibility promise. |

`STAB-002` of the policy names every one of those surfaces individually, so each
root export, error code, subpath, executable, and selected package field carries
exactly one classification. `STAB-003` redefines Supported Experimental as an
operational-maturity label that is SemVer protected from `1.0.0` onward.
`STAB-004` requires package `2.0.0` or a new retained versioned subpath for an
incompatible root, CLI, or existing-subpath change. `STAB-005` withdraws
`minor-before-1.0`, which applies only under policy `0.1.0`.

Consumer guidance is in [Migrating from package `0.11.0` to `1.0.0`](../docs/migrations/1.0.0.md).
The move changes support guarantees only. Portable Cognition `0.1.0` record
meaning, and every other immutable contract, is unchanged.

## Release Sequence

1. Slice A adds the Charter, standalone projections, fixtures, conformance
   evidence, and private package resources without publication.
2. Slice B verifies the stable package matrix and creates an immutable private
   `1.0.0-rc.1` compatibility baseline and distribution-readiness profile.
3. Slice C releases a verified `1.0.0-rc.1` candidate before a separately
   verified `1.0.0` package release, subject to the required accountable-human
   publication approval.

## Alternatives

Publishing the current package with only documentation was rejected because it
would not establish language-neutral semantics, schemas, fixtures, a stable API
inventory, or release evidence. Rewriting Portable Cognition was rejected
because it would violate the immutable `0.1.0` contract and duplicate its
already-defined payload semantics. Schematizing every adapter and runtime was
rejected because host and behavioral concerns are not universal serialized
contracts.

## Security and Human Authority

Conforming provenance, attribution, authorization-decision, and confirmation
records are portable assertions, not proof of identity, consent, authority, or
source quality. Hosts retain responsibility for authentication, authorization
policy, secrets, tenant or workspace isolation, retention, recovery, and
publication operations. Conformance is not security, interoperability, or
production certification.

## Acceptance Checks

- The Charter inventory test proves one current mapped definition for each
  `CCC-001` through `CCC-025` rule and rejects deferred Slice A evidence.
- The standalone-schema suite proves exact Portable Cognition `$defs`
  equivalence, direct/envelope fixture agreement, depth boundaries, and the
  required object, event, and lifecycle matrix.
- Linked language-neutral fixtures reject wrong relationship declaring
  families, cognitive-object collisions with opaque option symbols, and event
  times that differ from the resulting object update time.
- `npm test`, `test:schema`, `pack:check`, and npm prepack all execute the
  standalone-schema suite; syntax checking covers that suite directly.
- Private package `0.11.0` ships this RFC with the Charter, schemas, fixtures,
  current compatibility baseline, and installed documentation links intact.
- The repository suite, type check, syntax check, examples, package checks,
  audit, public path scan, and diff check form the local automated gate only.

## Explicit Deferrals

This RFC does not authorize npm publication, removal of `"private": true`, a
hosted service, scheduler, network API, connector registry, plugin runtime,
mandatory database, transaction protocol, queue, event transport, outbox,
automatic cognition, organizational truth, consensus, a global identity
provider, authorization-policy engine, authentication, encryption, production
certification, endorsement, or LTS commitment.
