# RFC 0003: Portable Cognition Contract

**Status:** Implemented; final review pending Task 6

**Created:** 2026-07-28
**Decision owner:** Project maintainer

## Problem

The reference implementation can create cognitive objects, transition events, authorization decisions, and serializable domain errors, but a host outside the TypeScript runtime has no closed, versioned way to identify or validate those values. A host cannot reliably distinguish an object from a transition context or error, determine the versioned shape it received, or round-trip a record without relying on implementation-specific types.

The SDK needs one exchange boundary that preserves the existing model while leaving storage, delivery, identity, and organizational policy under host control.

## Decision

This RFC adopts the [Portable Cognition Contract `0.1.0`](../spec/portable-cognition.md): a closed JSON envelope with `schemaVersion`, `recordType`, and the selected payload. The five record families are `cognitive-object`, `cognition-event`, `transition-context`, `authorization-decision`, and `domain-error`.

The contract is Normative Stable. Its schema, prose, valid and invalid fixtures, cognitive-loop fixture, stable portable error code, and versioned package subpaths are immutable `0.1.0` artifacts. The TypeScript runtime creates one own-descriptor JSON snapshot per validation, creation, or serialization operation, validates and serializes only that snapshot, and deeply freezes created records without invoking caller accessors or inherited `toJSON` hooks.

Package `0.2.0` adds this surface without removing or redirecting a prior surface. The package remains `"private": true` and unpublished; this is an additive compatibility effect in the private package inventory, not a published release or a production-readiness claim.

## Alternatives

### Stabilize Existing Objects Directly

Rejected because an existing `CognitiveObject` has neither an exchange discriminator nor a contract version, and it cannot carry events, contexts, authorization decisions, or errors through one boundary without changing the current object API.

### Publish a Schema Only

Rejected because a schema alone cannot ensure the reference runtime accepts, serializes, and deserializes the same values. The selected approach links schema validation to a runtime boundary and differential conformance evidence.

### Include Persistence or Event Publication

Rejected for this slice. Storage atomicity, queries, transaction boundaries, delivery, retries, subscriptions, and remote endpoints are host concerns. The contract defines records a host may store or publish; it does not define either operation.

## Compatibility and Migration

There is no migration from an earlier published Portable Cognition contract. `0.2.0` preserves SourceRecord `0.1.0`, compatibility baseline `0.1.0`, and their package subpaths. The new [`0.2.0` baseline](../spec/compatibility/0.2.0/baseline.json) records the added runtime and type exports, portable schema and fixture subpaths, rule and artifact hashes, and package inventory.

The [compatibility policy](../spec/compatibility.md) classifies the addition as additive. Future changes to the accepted `0.1.0` record shape require a new contract version while preserving the existing versioned artifacts.

## Security and Human Authority

Portable attribution and confirmation metadata are assertions, not authentication. A conforming record does not prove actor identity, consent, approval provenance, authorization, source access, or delivery. The authorization-decision family records a decision value; it neither identifies nor trusts the policy that produced it.

Hosts remain responsible for trusted identity, authorization, access control, secret filtering, retention, deletion, persistence, and publication. The portable error shape has no dedicated stack, cause, exception-name, or host-path fields, and runtime boundary failures do not automatically project caught exceptions. Error `message` and `details` remain caller supplied, so hosts must filter secrets, paths, and operational details before creating records.

## Evidence

- Normative contract: [`spec/portable-cognition.md`](../spec/portable-cognition.md) and [Draft 2020-12 schema](../spec/schemas/0.1.0/portable-cognition.schema.json).
- Conformance corpus: [valid records](../spec/conformance/0.1.0/portable-cognition/valid.jsonl), [invalid records](../spec/conformance/0.1.0/portable-cognition/invalid.jsonl), and the [complete cognitive loop](../spec/conformance/0.1.0/portable-cognition/cognitive-loop.jsonl).
- Reference runtime: [`src/portable-cognition.ts`](../src/portable-cognition.ts), re-exported by [`src/index.ts`](../src/index.ts), with a runnable [round-trip example](../examples/portable-cognition.ts).
- Differential and package evidence: [`tests/portable-cognition-conformance.test.ts`](../tests/portable-cognition-conformance.test.ts), [`tests/portable-cognition.test.ts`](../tests/portable-cognition.test.ts), [`tests/portable-cognition-schema.test.mjs`](../tests/portable-cognition-schema.test.mjs), [`tests/compatibility.test.mjs`](../tests/compatibility.test.mjs), and [`tests/package.test.mjs`](../tests/package.test.mjs).
- Package and compatibility metadata: [`package.json`](../package.json), [baseline `0.2.0`](../spec/compatibility/0.2.0/baseline.json), and [change cases](../spec/compatibility/0.2.0/change-cases.jsonl).

### Task 6 Correction-Wave Snapshot

Independent final re-review remains pending. The complete local matrix passes: `npm test` reports 194 source, 10 combined SourceRecord and Portable Cognition schema, 14 compatibility, and 6 package tests; TypeScript checking, syntax checking, both examples, `pack:check`, and `git diff --check` also exit successfully.

Package version `0.2.0` retains `"private": true`. Host integration contracts and persistence or connector adapters remain deferred.

- Compatibility hashes: baseline `0.1.0` `4e0c857ad8d115735aa8df99e9d524af55d3a6efae8ead7473b97c5201f5f89b`; change cases `0.1.0` `3337f8e2ca7aaa0769a18ad8ce724c621d94d01528980b6d30feec9e8626bd6b`; baseline `0.2.0` `3da00ab49c1f3b02bfc19226545dce68379546641f418993f632851b8c49ddc4`; change cases `0.2.0` `e0229b0436827bc71456e839e852f96d8d075da8fd65c32342fd6089c995e5f5`.
- SourceRecord artifact hashes remain byte-identical: schema `56cf53c5da98dfbec19a021fbb90673beab8248c7a77df44989b535a0e155648`; valid fixtures `f52c212026b70bf2b339e1132b2895c91be509f250dde841319dbbb4edd3f74a`; invalid fixtures `4705f32eb5ea48ddd693759728294d2557b0a6f4a5cc666843b2e03bb03e99c0`.
- Portable Cognition artifact hashes: prose `d73a6de049c7408715d7e717dd326e79830d99fe84ff85cb5936dfb8a757be89`; schema `6dec3f942ca88994fef588a2ffb93240d716e116dbec7ded46a1f362446f6bdd`; valid fixtures `cc3854706ace472b0d5335ecb9596c7ea3bf2b48c04fd9dd950f9683e8b203f4`; invalid fixtures `0f8e21f7379824223482e26ae26ec0b7b5031077ab63f6dac4558239b4908ba4`; cognitive-loop fixtures `1693d97e207cfeee63d370ba23d07ffd9023e8b087e5dbd3c0ad53e945184053`.
- The root-reachable declaration digest remains `75a3f931f18ba6dae205b5c8da41aadc1a0f68245fc8b237eb216e17febde766`.

## Acceptance Checks

- `npm run example:portable` prints one Portable Cognition `0.1.0` envelope after a runtime round trip.
- `npm run check` syntax-checks the example and reference sources.
- `npm run test:schema` runs both the SourceRecord and Portable Cognition schema suites; `pack:check` and npm prepack inherit that combined gate.
- The portable runtime, differential conformance, compatibility, and package suites provide the detailed contract evidence listed above.
- Markdown status reconciliation and `git diff --check` are required before this documentation slice is accepted.

## Explicit Deferrals

- Host integration contracts for persistence and event publication; this is the next active Phase 3 slice.
- Persistence adapters, connectors, connector packaging, marketplaces, or source-system discovery.
- Authentication, trusted confirmation records, authorization-policy execution, runtime policy, and security policy.
- Registry publication, removal of `"private": true`, a `1.0.0` promise, production readiness, hosted services, or delivery guarantees.
