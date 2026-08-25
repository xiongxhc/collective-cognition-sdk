# RFC 0012: Phase 3 Charter and Stable Package

**Status:** Accepted for Phase 3 implementation
**Created:** 2026-08-25

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

- The Charter inventory test proves one mapped definition for each `CCC-001`
  through `CCC-025` rule and checks its core non-claims.
- Later Slice A tasks add standalone-schema, fixture, runtime, and linked
  conformance checks without changing immutable Portable Cognition resources.
- The complete repository suite, type check, syntax check, package checks, and
  diff check provide the implementation gate before a later package decision.

## Explicit Deferrals

This RFC does not authorize npm publication, removal of `"private": true`, a
hosted service, scheduler, network API, connector registry, plugin runtime,
mandatory database, transaction protocol, queue, event transport, outbox,
automatic cognition, organizational truth, consensus, a global identity
provider, authorization-policy engine, authentication, encryption, production
certification, endorsement, or LTS commitment.
