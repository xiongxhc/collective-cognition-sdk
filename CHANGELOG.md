# Changelog

All notable changes to this experimental SDK are documented here. Versioning and compatibility follow [the compatibility policy](spec/compatibility.md), [RFC 0002](rfcs/0002-compatibility-versioning-and-deprecation.md), and the immutable [compatibility baselines](spec/compatibility/).

## Unreleased

- Adds private package `0.10.0` with the maintained
  `collective-cognition-sdk/connectors/git/0.1.0` subpath, Cross-Connector
  Interoperability Profile `0.1.0` resources, RFC 0011, an owned reference
  exchange, Git connector guide, and additive compatibility baseline.
- The Git connector performs read-only collection from an explicit local
  repository through a local Git executable, follows first-parent history
  from the exact tip, and keeps full messages and author email behind disabled
  privacy defaults. Package `0.10.0` has two maintained connectors and no Git
  CLI.
- The profile and fixtures are owned by `collective-cognition-sdk-maintainers`.
  They add no connector registry, plugin discovery or runtime, network Git,
  scheduling, or automatic cognition. Package `0.10.0` remains private and
  unpublished; interoperability evidence is not production certification,
  does not imply endorsement, and is not an LTS commitment.
- Records Phase 5 completion after clean independent reviews, the full
  Linux/macOS/Windows pull-request matrix, merge, and the equivalent green
  post-merge `main` CI matrix.
- Adds source-neutral Durable Cognition Workflow `0.1.0`, atomic SQLite workflow schema version `2`, the `collective-cognition-sdk/workflows/durable/0.1.0` and `collective-cognition-sdk/stores/sqlite-workflow/0.1.0` subpaths, the `collective-cognition-workflow` executable, RFC 0010, an operator guide, and additive private package `0.9.0` compatibility baseline.
- Records fresh [read-only durable-workflow acceptance](docs/acceptance/durable-cognition-workflow-0.1.0.md) over `12` bounded canonical SourceRecords: exact commit/replay and Markdown statuses, `3` object rows, `1` event, `1` workflow receipt, neutral Evidence with `12` provenance records, `0` Decisions, `0` Principles, equal before/after source identity and SHA-256 values, and no live-vault access. Whole-branch specification, code, and security reviews are complete with no unresolved Critical, Important, or Minor findings.
- Records the Supported Experimental workflow runtime as Node.js `>=24.14.0` with `DatabaseSync.prototype.enableDefensive`, while the root package engine remains Node.js `>=24`. Node.js `24.9.0` is a package/core compatibility lane with honest workflow and SQLite capability skips, not a full workflow runtime; `npm run example:workflow` emits one fixed `unsupported_runtime` skip summary and creates no temporary files when the capability is absent.
- Preserves every historical root export, domain-error inventory, subpath, executable, SQLite declaration closure, and compatibility artifact; the package contains no shared `sqlite-internal` module.
- Reports npm publication as blocked and production use as not claimed; current package `0.10.0` remains private and unpublished. The workflow CLI has no publisher, Markdown remains non-authoritative, and the workflow slice supplies no scheduler, automatic cognition, Obsidian discovery, authentication, encryption, durable outbox, or production certification.
- Records historical private package `0.8.0` as the additive checked public API and Distribution Readiness Profile `0.1.0` delivery, including its read-only `collective-cognition-sdk/distribution-readiness/0.1.0` JSON subpath and RFC 0009.
- Records historical private package `0.7.0` as the additive Runtime and Security Profile `0.1.0` delivery, including its `collective-cognition-sdk/runtime-security/0.1.0` JSON subpath.
- Clarifies the public runtime/security boundary: the profile tells hosts what remains unimplemented, importing it does not enforce host-required controls, and conformance is not certification.
- Clarifies that the source-neutral core consumes portable contracts while optional connectors and adapters operate only on explicit sources or managed targets.
- Updates active repository links and release checks for the `main` default branch.
- Updates development dependencies to remove the `fast-uri` security advisory and refresh Node.js declarations.
- Repins the official artifact-download and build-provenance actions to reviewed commits.

## 0.6.0

- Adds the supported experimental Markdown adapter subpath, dedicated CLI, object-version ceiling, and related package artifacts.
- Accepts native Windows absolute team-memory database paths without changing the public API, schema, compatibility surface, or package inventory.
- Is available as the experimental [`v0.6.0` GitHub prerelease](https://github.com/xiongxhc/collective-cognition-sdk/releases/tag/v0.6.0) while remaining private and npm-unpublished.

## 0.5.0

- Adds source-neutral connector conformance, a maintained compatible connector subpath, and a dedicated connector CLI.

## 0.4.0

- Adds the optional SQLite cognition-store subpath and its packaged RFC.

## 0.3.0

- Adds the Host Integration package surface and corrects `PortableDomainError.code` to the existing normative allowlist.

## 0.2.0

- Adds the Portable Cognition package surface.

## 0.1.0

- Establishes the inaugural unpublished package baseline and initial normative SourceRecord contract.
