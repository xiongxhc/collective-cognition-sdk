# RFC 0008: Runtime and Security Profile

**Status:** Implemented
**Created:** 2026-08-10

## Problem

Adopters need one source-neutral, reviewable inventory that distinguishes SDK
enforcement from repository evidence, host responsibilities, and deliberate
non-claims. Reconstructing that distinction from implementation and guides is
not an interoperable or auditable boundary.

## Proposed Semantics

Runtime and Security Profile `0.1.0` is normative prose at
`spec/runtime-security.md` with synchronized machine-readable data at
`spec/runtime-security/0.1.0/profile.json`. The profile is available from the
versioned package subpath
`collective-cognition-sdk/runtime-security/0.1.0`.

The profile is descriptive data. It does not add a runtime policy engine,
authorization evaluator, production dependency, root export, type export,
binary, or CLI behavior.

## Enforcement Classes

- `sdk-enforced`: the reference SDK rejects or constrains unsafe behavior.
- `conformance-verified`: repository checks demonstrate a property without a
  universal runtime guarantee.
- `host-required`: a production host must supply and document the control.
- `out-of-scope`: the SDK explicitly makes no claim or guarantee.

## Machine-Readable Profile

The closed profile records the stable identifier, version, enforcement classes,
ordered `RSP-001` through `RSP-022` controls, and `RSP-NC-001` through
`RSP-NC-005` non-claims. Its evidence names repository artifacts only; it
contains no deployment secrets, vendor choices, or host configuration.

## Alternatives

Prose-only guidance was rejected because it cannot reliably prove inventory
coverage or package inclusion. A universal programmable security policy was
rejected because authentication, encryption, isolation, retention, recovery,
and incident response are deployment-specific host duties. Deployment
certification was rejected because repository conformance is not certification
of an adopter's infrastructure or operations.

## Compatibility and Migration

Private package `0.7.0` classifies this addition as `additive` with a `minor`
package-version effect. Existing runtime and type exports, declaration
closures, binaries, CLI contracts, connectors, adapters, host contracts, and
all historical artifacts remain unchanged. No migration or deprecation is
required.

## Security and Human Authority

The profile preserves explicit collection, promotion, persistence, and
authorization boundaries. It requires production hosts to authenticate actors
and trusted human approvals where protected operations need them. Passing SDK
or repository checks does not certify a host as secure, compliant, or
production-ready.

## Acceptance Checks

- Profile tests validate the closed rule and non-claim inventory, anchors, and
  repository evidence references.
- Package checks verify the JSON subpath, tarball inclusion, no install hooks,
  and clean-consumer JSON import.
- Compatibility checks pin `0.7.0`, its change case, digests, and unchanged
  existing package surfaces against baseline `0.6.0`.

## Explicit Deferrals

This RFC does not authorize an identity provider, encryption or key-management
implementation, tenant model, policy language, durable outbox, hosted service,
network API, vulnerability-scanning runtime feature, or production
certification.
