# Compatibility Status

This page records the stability classes of the shipped contracts and the
per-version compatibility classification of every package release so far. The
normative rules live in the [compatibility policy](../spec/compatibility.md) and
[RFC 0002](../rfcs/0002-compatibility-versioning-and-deprecation.md).

Every release on this page records `packagePolicyVersion` `0.1.0`; the policy
`1.0.0` section of the [compatibility policy](../spec/compatibility.md) takes
effect only when a compatibility baseline records `packagePolicyVersion`
`1.0.0`.

## Stability classes

- Charter `1.0.0`, SourceRecord `0.1.0`, Portable Cognition `0.1.0`, the standalone cognitive-object and cognition-event resources `0.1.0`, Host Integration `0.1.0`, Runtime and Security Profile `0.1.0`, Distribution Readiness Profile `0.1.0`, Interoperability Profile `0.1.0`, and compatibility baselines `0.1.0` through `0.11.0` are **Normative Stable** contracts.
- Before `1.0.0`, the package root, installed CLIs, and declared non-normative package subpaths are **Supported Experimental**.
- Unexported connector modules and repository-only examples remain **Internal** and create no public compatibility promise.

## What the baseline locks

The baseline locks runtime and type exports, selected package metadata,
independent declaration closures and literal digests for public TypeScript
entrypoints, CLI behavior, domain error codes, policy identities, and normative
artifact hashes. Compatibility tests detect exact baseline drift and declared
process consequences; they do not automatically determine semantic
compatibility.

Consumers can resolve the baselines at
`collective-cognition-sdk/compatibility/0.1.0` through
`collective-cognition-sdk/compatibility/0.11.0`.

## Per-version classification

- Package `0.3.0` is classified as a `minor-before-1.0` breaking correction: the Host Integration additions are optional, while `PortableDomainError.code` is narrowed from package `0.2.0`'s package-wide `DomainErrorCode` to the immutable Portable Cognition `0.1.0` allowlist under `COMP-012`.
- Package `0.4.0` is an additive minor release before `1.0`: it adds the optional SQLite subpath and its compatibility baseline without changing root exports or the generic CLI contract.
- Package `0.5.0` is an additive minor release before `1.0`: it adds source-neutral connector conformance, one maintained connector subpath, and a dedicated executable while preserving the root API and generic CLI.
- Private package `0.6.0` is an additive minor release before `1.0`: it adds the Supported Experimental `adapters/markdown/0.1.0` subpath and `collective-cognition-markdown` executable without changing root exports, existing CLIs, or prior Normative Stable contracts.
- Historical private package `0.7.0` is an additive minor release before `1.0`: it adds the Normative Stable `collective-cognition-sdk/runtime-security/0.1.0` JSON profile without changing root exports, existing CLIs, historical `v0.6.0` records, or prior Normative Stable contracts.
- Historical private package `0.8.0` is additive before `1.0`: it adds the Normative Stable `collective-cognition-sdk/distribution-readiness/0.1.0` JSON profile, checked public API documentation, RFC 0009, and baseline `0.8.0` without changing root runtime or type exports, executable behavior, or historical artifacts.
- Historical private package `0.9.0` is additive before `1.0`: it adds the Supported Experimental durable workflow and SQLite workflow-store subpaths, installed workflow executable, RFC 0010, guide, and baseline `0.9.0` while preserving root runtime and type export names and all historical package entrypoints.
- Historical private package `0.10.0` is additive before `1.0`: it adds the maintained Git connector subpath, Interoperability Profile `0.1.0` resources, RFC 0011, reference exchange, guide, and baseline `0.10.0` without changing root exports, existing subpaths, or executables. There is no Git CLI.
- Current private package `0.11.0` is additive before `1.0`: it adds Charter `1.0.0`, exact standalone projection schemas and fixtures, seven projection root exports, eight stable resource subpaths, and baseline `0.11.0` while preserving every historical versioned resource and all four executable contracts.

## Open items

npm publication, registry confirmation, a runtime policy engine, broader
schemas, and production readiness remain open. The manifest retains
`"private": true`, and the package is unpublished. Conformance is not
certification, does not imply endorsement, and is not an LTS commitment.

Read the [public API reference](public-api.md), [compatibility
policy](../spec/compatibility.md), [Distribution Readiness
Profile](../spec/distribution-readiness.md), [RFC
0002](../rfcs/0002-compatibility-versioning-and-deprecation.md), and [RFC
0009](../rfcs/0009-public-api-and-distribution-readiness.md).
