# Roadmap

This roadmap separates verified behavior from planned universal-SDK work. A later phase starts only after its entry criteria are met.

## Phase 1: Runnable Cognitive Core

**Status:** Complete as a public experimental reference implementation.

**Delivered**

- Immutable, attributed cognitive objects for identities, goals, hypotheses, experiments, evidence, decisions, and principles.
- Validated lifecycle transitions, auditable events, and structural human-confirmation checks.
- JSON round trips, automated tests, and a complete cognitive-loop example.
- A historical read-only team-memory SQLite experiment that originally mapped selected rows directly to neutral collected evidence.

**Verified commands**

- `npm test`
- `npx tsc --noEmit`
- `npm run check`
- `npm run example`

**Limits**

- The repository is public reference source, not yet a published package or production-ready SDK.
- The original team-memory-specific root exports and direct Evidence mapping were experimental and are superseded by Phase 2.
- No persistence, service, UI, stable exports map, or complete language-neutral schema exists yet.
- Type-specific `data` payloads remain permissive.

## Phase 2: Universal Ingestion Foundation

**Status:** Complete and final-review verified as a public experimental reference implementation.

**Entry criteria**

- Phase 1 checks pass.
- Neutral-first ingestion is accepted as the root architectural direction.
- Current team-memory behavior is documented as an experiment rather than universal behavior.

**Deliverables**

- [x] A closed, versioned, source-neutral `SourceRecord` contract that clones and deeply freezes accepted external values.
- [x] SDK validation plus canonical JSON and JSONL codecs.
- [x] Deterministic duplicate/collision classification and immutable source-revision semantics.
- [x] Explicit, versioned promotion from accepted unique source records to one Evidence object with collision rejection, immutable request/policy snapshots, required rationale, complete provenance, and canonical full-payload identity.
- [x] A composed ingest-and-promote workflow that preserves ingestion and returns a discriminated promotion outcome.
- [x] Discriminated item-level batch results, stable errors, and configurable SDK input/record limits.
- [x] A generic bounded CLI for validate, ingest, promote, and ingest-promote operations with structured top-level diagnostics.
- [x] Migration of team-memory into a connector that emits source records.
- [x] A small Git commit fixture connector as the second source-specific conformance implementation.

**Acceptance checks**

- [x] Valid and invalid canonical fixtures behave identically through SDK and CLI.
- [x] Identical source-revision keys and content classify as duplicates; key reuse with different content fails as a collision.
- [x] Changed content uses a new immutable revision identity; key reuse with changed content is rejected without overwriting retained records.
- [x] Unknown top-level/source fields and unnamespaced extension keys are rejected; polarity, confidence, and authority are rejected in context while raw content remains source-preserving.
- [x] Mutation of original inputs cannot change accepted ingestion results.
- [x] Promotion preserves every source-record link, policy identity, and non-empty rationale.
- [x] Valid ingestion remains observable as an explicit result when promotion fails.
- [x] SDK and CLI enforce input-byte, record-count, and record-byte limits with `INGESTION_LIMIT_EXCEEDED`.
- [x] File and stdin input share an incremental bounded reader; line/record limits run before parsing/normalization; parser, policy, and non-domain diagnostics are sanitized.
- [x] Root exports contain no team-memory-specific API.
- [x] Team-memory and a second source-specific Git fixture connector emit valid records under the same SourceRecord contract.
- [x] Team-memory omits raw row content by default, supports explicit connector/CLI opt-in, and emits nested structured diagnostics.
- [x] Transition authorization uses immutable context snapshots and accepts only exact closed decisions, failing policy errors and mutation closed.
- [x] `contentHash` remains opaque caller-supplied metadata unless an external trust boundary verifies it.
- [x] SourceRecords deeper than 256 JSON containers are rejected consistently before recursive processing.
- [x] Every repository Markdown file is either current or explicitly historical.

**Completion evidence**

- `node --test tests/conformance.test.ts`
- `npm test`
- `npx tsc --noEmit`
- `npm run check`
- `npm run example`
- A bounded default-privacy team-memory SourceRecord export validated and explicitly promoted through the generic CLI without raw row content or changes to source-ledger size or modification time.

**Explicit deferrals**

- No persistence service, remote ingestion endpoint, automatic semantic classification, connector marketplace, or production-scale claim.

## Phase 3: Specification and Package Stabilization

**Status:** In progress. The compatibility, Portable Cognition, and Host Integration slices are final-review verified; the Runtime and Security slice is implemented, full local-gate verified, and independently reviewed. The checked public-API and distribution-readiness documentation slice for private package `0.8.0` completed its whole-branch verification, was fast-forwarded to `main`, and passed the full GitHub Actions matrix. Broader Phase 3 language-neutral semantics, schemas, publication, and production-readiness work remain open. The experimental `v0.6.0` GitHub prerelease is observed and verified, while npm publication remains blocked and production readiness is not claimed.

**Phase 3 slice progress**

- [x] SourceRecord-first normative conformance design approved.
- [x] Implement the versioned SourceRecord schema, normative prose, fixtures, differential conformance tests, and packaged artifacts described in [`2026-07-27-source-record-normative-conformance-design.md`](superpowers/specs/2026-07-27-source-record-normative-conformance-design.md).
- [x] Compatibility, versioning, and deprecation design approved.
- [x] Compatibility, versioning, and deprecation slice delivered and verified.
- [x] Portable Cognition Contract `0.1.0` design approved and implementation completed.
- [x] Host integration contracts for cognition persistence and event publication without selecting a mandatory database, service, or delivery architecture. Implemented and final-review verified.
- [x] Runtime and Security Profile `0.1.0` design approved.
- [x] Implement the normative policy, machine-readable control inventory, RFC, package subpath, compatibility baseline, and conformance evidence described in [`2026-08-10-runtime-security-policy-design.md`](superpowers/specs/2026-08-10-runtime-security-policy-design.md).
- [x] Reconcile the checked [public API reference](public-api.md), [Distribution Readiness Profile `0.1.0`](../spec/distribution-readiness.md), [machine-readable profile](../spec/distribution-readiness/0.1.0/profile.json), [RFC 0009](../rfcs/0009-public-api-and-distribution-readiness.md), private package `0.8.0` compatibility narrative, and public indexes without enabling publication or claiming production readiness.
- [x] Complete the private package `0.8.0` whole-branch gate, fast-forward it to `main` at `1f65c1809f03ffde244529ba41c73bec6e14392a`, and verify [GitHub Actions run `31696629195`](https://github.com/xiongxhc/collective-cognition-sdk/actions/runs/31696629195) across Node `24.9.0` and `24.14.0` on Linux, macOS, Windows, and the distribution job.

**Delivered in the SourceRecord normative-conformance slice**

- [x] Normative SourceRecord `0.1.0` prose with stable rule identifiers and rule-to-check mapping.
- [x] A strict JSON Schema Draft 2020-12 artifact with self-asserting timestamp, field, context, and extension rules.
- [x] Versioned valid and invalid language-neutral fixtures shared by schema, SDK, and CLI tests, including runtime-layer depth boundaries that JSON Schema cannot express.
- [x] Lossless pre-schema rejection of duplicate JSON member names and lone surrogate strings.
- [x] A stable installed schema subpath plus exact package and clean-consumer verification.
- [x] Runtime timestamp behavior aligned to the normative serialized profile.
- [x] A normative 256-container depth profile with stable direct SDK, JSON, JSONL, and CLI rejection.

**Delivered in the initial package-stabilization slice**

- [x] ESM JavaScript and declaration output under ignored `dist/`.
- [x] An explicit source-neutral root exports map and installed `collective-cognition` executable contract.
- [x] An npm package-content allowlist that excludes source, tests, examples, planning documents, and connector entrypoints.
- [x] Compatibility smoke tests for built imports, runtime exports, declaration specifiers, default TypeScript consumer settings, CLI behavior, exact dry-run tarball contents, and clean temporary consumer installation.
- [x] A retained `"private": true` publication guard.

**Delivered and verified in the compatibility, versioning, and deprecation slice**

- [x] Normative [compatibility, versioning, and deprecation prose](../spec/compatibility.md) and [RFC 0002](../rfcs/0002-compatibility-versioning-and-deprecation.md).
- [x] Compatibility baseline `0.1.0`, change cases, and the stable `collective-cognition-sdk/compatibility/0.1.0` package subpath.
- [x] Exact baseline checks for runtime and type exports, selected package metadata, declaration closure, generic CLI behavior, domain error codes, policy identities, and normative artifact digests.
- [x] One additive and one breaking process example.

**Delivered and final-review verified in the Portable Cognition slice**

- [x] Normative Stable Portable Cognition Contract `0.1.0` prose, strict JSON Schema, and versioned valid, invalid, and cognitive-loop fixtures.
- [x] Runtime create, validate, serialize, and deserialize operations with lexical-profile, depth, clone, and deep-freeze enforcement.
- [x] Additive package `0.2.0` compatibility baseline, runtime and type exports, schema and fixture subpaths, and clean-consumer/package evidence.
- [x] A runnable cognitive-object round-trip example.

**Portable Cognition final verification evidence**

- Independent final review found no remaining Critical or Important issue after the correction wave.
- The complete local matrix passes: `npm test` reports 194 source, 10 combined SourceRecord and Portable Cognition schema, 14 compatibility, and 6 package tests; TypeScript checking, syntax checking, both examples, `pack:check`, and `git diff --check` also exit successfully.
- Package version `0.2.0` retained `"private": true` at the time of this slice. It was later superseded by the private `0.3.0` Host Integration slice, private `0.4.0` SQLite slice, private `0.5.0` connector slice, private `0.6.0` Markdown slice, private `0.7.0` Runtime and Security slice, historical private package `0.8.0`, and current private, unpublished package `0.9.0`; the maintained connector implementation, final verification, and real-ledger acceptance are complete.
- Compatibility hashes: baseline `0.1.0` `4e0c857ad8d115735aa8df99e9d524af55d3a6efae8ead7473b97c5201f5f89b`; change cases `0.1.0` `3337f8e2ca7aaa0769a18ad8ce724c621d94d01528980b6d30feec9e8626bd6b`; baseline `0.2.0` `3da00ab49c1f3b02bfc19226545dce68379546641f418993f632851b8c49ddc4`; change cases `0.2.0` `e0229b0436827bc71456e839e852f96d8d075da8fd65c32342fd6089c995e5f5`.
- SourceRecord artifact hashes remain byte-identical: schema `56cf53c5da98dfbec19a021fbb90673beab8248c7a77df44989b535a0e155648`; valid fixtures `f52c212026b70bf2b339e1132b2895c91be509f250dde841319dbbb4edd3f74a`; invalid fixtures `4705f32eb5ea48ddd693759728294d2557b0a6f4a5cc666843b2e03bb03e99c0`.
- Portable Cognition artifact hashes: prose `d73a6de049c7408715d7e717dd326e79830d99fe84ff85cb5936dfb8a757be89`; schema `6dec3f942ca88994fef588a2ffb93240d716e116dbec7ded46a1f362446f6bdd`; valid fixtures `cc3854706ace472b0d5335ecb9596c7ea3bf2b48c04fd9dd950f9683e8b203f4`; invalid fixtures `0f8e21f7379824223482e26ae26ec0b7b5031077ab63f6dac4558239b4908ba4`; cognitive-loop fixtures `1693d97e207cfeee63d370ba23d07ffd9023e8b087e5dbd3c0ad53e945184053`.
- The root-reachable declaration digest remains `75a3f931f18ba6dae205b5c8da41aadc1a0f68245fc8b237eb216e17febde766`.

**Delivered and final-review verified in the Host Integration slice**

- [x] Normative Host Integration Contract `0.1.0`, store and publisher ports, commit coordinators, and a private package `0.3.0` compatibility baseline.
- [x] Operation-specific correlated conflict validation, exact replay → object collision → event collision → stale-version precedence, and unchanged latest/revision/event state after every returned conflict.
- [x] An in-memory reference host and `17`-case reusable conformance harness covering malformed and SourceRecord-shaped runtime rejection, fresh factory instances, commits, reads, conflicts, exact replay, immutable snapshots, publication idempotency, and secret-safe failures.
- [x] Package `0.3.0` compatibility is classified as a `COMP-012` `minor-before-1.0` breaking correction because `PortableDomainError.code` narrows package `0.2.0`'s generic `DomainErrorCode`; migration and clean-consumer type evidence are included.
- [x] Root, host-conformance, and reference-host declaration entrypoint closures are independently computed and pinned to literal baseline digests.
- [x] A runnable public-import host example builds successfully when `dist/` is absent, persists an initial object, reports `committed_but_unpublished` after a first publication failure, retries the identical transition request, and reports one stored and published event.

**Host Integration final verification evidence**

- Fresh controller verification at head `26aa692a3e82b1aed8d69c9cfa797258cddcc3d7` passes all `56` focused Host Integration, reference-host, and conformance tests.
- `npm test` passes `250` source, `10` combined SourceRecord and Portable Cognition schema, `14` compatibility, and `8` package tests (`282` total), all with zero failures.
- `npx tsc --noEmit`, `npm run check`, `npm run example`, `npm run example:portable`, `npm run example:host`, `npm run pack:check`, and `git diff --check` exit successfully.
- The host example reports initial `committed`, first transition `committed_but_unpublished`, retry transition `committed`, latest version `2`, one stored event, and one published event.
- The final broad review findings are corrected, and the residual scoped re-review reports no Critical or Important blocker.
- Compatibility hashes: baseline `0.1.0` `4e0c857ad8d115735aa8df99e9d524af55d3a6efae8ead7473b97c5201f5f89b`; baseline `0.2.0` `3da00ab49c1f3b02bfc19226545dce68379546641f418993f632851b8c49ddc4`; baseline `0.3.0` `02991abb5133a4aef2b6a2fc736567fbbde9e29859909f806f08822fcd40d3d4`; change cases `0.3.0` `1f1ff3822de318806640357bb11804a0213d7084f05350035f8bb8d519dd95f2`.
- Host Integration prose hash: `41d2094f60a096540983bdeb9be5320d43136a8519b9e3ce2336c20f788f7bd7`.
- Public declaration closure hashes: root `7f9e352c9adf8a48d433d280c8040ddad57240726276a15d690133b3dfcf7333`; host-conformance `4cb58d68d6796cc77a8dfdb5a31013e441c99142bbb5bc62a91e5e71d64db94b`; reference-host `1447986d26b53d77a083fe414da8d744056df30db4e0094bb28a656d0f8965b2`.
- Independent byte comparisons confirm all historical baseline/artifact `0.1.0` and `0.2.0` files remain unchanged. The Portable Cognition `0.1.0` runtime allowlist remains fixed and its correction-pass source/tests are untouched.
- Host Integration `0.1.0` is implemented and final-review verified.

**Delivered Runtime and Security Profile `0.1.0` slice**

- [x] Normative [Runtime and Security Profile `0.1.0`](../spec/runtime-security.md), synchronized JSON inventory at `collective-cognition-sdk/runtime-security/0.1.0`, and [RFC 0008](../rfcs/0008-runtime-security-profile.md).
- [x] Four explicit enforcement classes: `sdk-enforced`, `conformance-verified`, `host-required`, and `out-of-scope`.
- [x] Closed control coverage for authentication, encryption, tenant or workspace isolation, durable publication recovery, and related host-owned boundaries without adding a runtime policy engine.
- [x] At the Runtime and Security slice boundary, private, unpublished package `0.7.0` added its compatibility baseline without changing root exports, existing CLIs, or historical `v0.6.0` records; package `0.8.0` superseded that private baseline additively, and current package `0.9.0` preserves both historical artifacts.
- [x] Public documentation reconciliation that explains host-owned responsibilities and states that conformance is not certification.

**Runtime and Security Profile final verification evidence**

- Bundled Node.js `24.14.0` `npm test` reports `459` passes, `10` expected immutable-`v0.6.0` release-context skips, and `0` failures: `419` source, `10` schema, `20` compatibility, and `10` package passes.
- `npx tsc --noEmit`, `npm run check`, `npm run example`, `npm run example:portable`, `npm run example:host`, `npm run example:markdown`, `npm run pack:check`, and `git diff --check` exit successfully.
- A byte comparison against `main` finds `0` changes across `23` tracked historical compatibility `0.1.0`–`0.6.0`, SourceRecord, Portable Cognition, and Host Integration artifacts.
- `npm pack --dry-run --json` with an isolated temporary npm cache reports `96` files (`52` under `dist/`), with `0` unexpected and `0` missing allowlisted paths.
- `PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm_config_update_notifier=false npm_config_cache=/private/tmp/collective-cognition-npm-audit npm audit --audit-level=high` exits `0` and reports `found 0 vulnerabilities`.

**Delivered public API and distribution-readiness documentation slice**

- [x] A checked [public API reference](public-api.md) enumerates the baseline-recorded package root, subpaths, executables, and stability classes.
- [x] Normative [Distribution Readiness Profile `0.1.0`](../spec/distribution-readiness.md), [descriptive JSON](../spec/distribution-readiness/0.1.0/profile.json), and [RFC 0009](../rfcs/0009-public-api-and-distribution-readiness.md) report source availability separately from the immutable historical `v0.6.0` prerelease, blocked npm publication, and production use that is not claimed.
- [x] Private package `0.8.0` adds only the distribution-readiness JSON subpath, public documentation, RFC, and additive compatibility evidence; root runtime/type exports, executables, and historical artifacts are unchanged.
- [x] Current public status and indexes are reconciled, and every baseline-recorded root and supported subpath runtime/type member is checked against the public API reference.
- [x] The full local gate, immutable-history comparison, exact package inventory, independent whole-branch review, and residual correction review are complete.

**Public API and Distribution Readiness final verification evidence**

- Bundled Node.js `24.14.0` `npm test` reports `476` passes, `10` expected immutable-`v0.6.0` release-context skips, and `0` failures: `434` source, `10` schema, `22` compatibility, and `10` package passes.
- `npx tsc --noEmit`, `npm run check`, `npm run example`, `npm run example:portable`, `npm run example:host`, `npm run example:markdown`, `npm run pack:check`, and `git diff --check` exit successfully.
- A byte comparison against `main` finds `0` changes under compatibility baselines `0.1.0` through `0.7.0`, conformance `0.1.0`, schemas `0.1.0`, and Runtime and Security Profile `0.1.0`.
- An isolated `npm pack --dry-run --json --ignore-scripts` reports exactly `102` files (`52` under `dist/`), with `0` unexpected and `0` missing baseline-allowlisted paths; package `0.8.0` remains private.
- `npm audit --audit-level=high` exits `0` and reports `found 0 vulnerabilities`.
- The independent residual review reports **READY** with `0` unresolved Critical, Important, or Minor findings after the whole-branch correction wave.

**Delivered in the licensing and attribution slice**

- [x] Apache License 2.0 with the official license text.
- [x] A distributable `NOTICE` preserving project and copyright attribution.
- [x] CFF 1.2.0 citation metadata for GitHub and research tooling.
- [x] Package tests requiring the license, notice, and citation artifacts.

**Entry criteria**

- Phase 2 fixtures and contracts pass in the TypeScript implementation.
- The generic CLI exercises canonical ingestion without importing a source connector.
- Semantic ambiguities are captured as RFCs.

**Deliverables**

- [ ] A broader language-neutral charter and normative definitions for objects, source records, relationships, transitions, authorization, errors, and events.
- [ ] Additional versioned machine-readable schemas and normative fixtures beyond the existing SourceRecord and Portable Cognition artifacts.
- [x] Host integration contracts for cognition persistence and event publication without selecting a mandatory database or service architecture.
- [x] Checked public API documentation and versioned external-distribution readiness criteria.
- [ ] Final stable package guarantees and npm registry publication.
- [x] Runtime and security policy.

**Acceptance checks**

- Every normative rule maps to a schema assertion, fixture, test, or explicit prose-only rationale.
- The TypeScript implementation passes the published conformance suite.
- Persistence contracts keep source stores and cognition stores logically distinct and are testable through a host-supplied implementation.
- Public exports and CLI behavior have compatibility tests.
- Package dry-run verification includes only approved artifacts and publication remains blocked until every release gate is complete.

**GitHub prerelease distribution readiness**

- [x] Deterministic local generation of exactly `SHA256SUMS`,
  `collective-cognition-sdk-0.6.0.cdx.json`,
  `collective-cognition-sdk-0.6.0.tgz`, and `release-manifest.json`.
- [x] Read-only core verification runs `npm test`, `npx tsc --noEmit`, and
  `npm run check` on Ubuntu with Node.js `24.9.0`, Ubuntu with Node.js
  `24.14.0`, macOS with Node.js `24.14.0`, and Windows with Node.js `24.14.0`.
- [x] Ubuntu with Node.js `24.14.0` is the distribution verification
  environment for examples, durable SQLite, deterministic assets, clean
  tarball installation, imports, and installed CLI checks only.
- [x] A tag-only workflow validates an annotated exact-`main` tag, creates a
  prerelease without marking it latest, and attests all four assets. Repository
  checkout, dependencies, and release construction run with read-only
  permissions and no persisted checkout credential; a separate privileged job
  downloads only the verified four-asset transfer and runs no repository
  package or dependency code.
- [x] The first public-artifact decision finalizes the current docs-inclusive
  private `0.6.0` tarball rather than restoring stale documentation. The final
  candidate also accepts native Windows absolute team-memory database paths;
  the public API, schema, compatibility surface, and exact package file
  inventory remain unchanged. Final tarball SHA-256
  `3b50ebaa83e0a025ba49aaf81099e8de805e35e2c177a76beb4b985b575a9efe`
  is enforced against later byte drift.
- [x] Observed public release evidence:
  - The experimental [`v0.6.0` prerelease](https://github.com/xiongxhc/collective-cognition-sdk/releases/tag/v0.6.0) is public, `prerelease: true`, and `draft: false`.
  - Squash merge and tag target commit: `76f289b7f1514f4bc490d0de6dbffbb61a4c9f0e`; annotated tag object: `4b93ec6df71e47196b55b5ca7325c07b0612673f`.
  - [Pull-request CI run `30766556678`](https://github.com/xiongxhc/collective-cognition-sdk/actions/runs/30766556678) passed distribution verification plus Ubuntu Node.js `24.9.0`, Ubuntu Node.js `24.14.0`, macOS Node.js `24.14.0`, and Windows Node.js `24.14.0`.
  - [Tag workflow run `30766660796`](https://github.com/xiongxhc/collective-cognition-sdk/actions/runs/30766660796) passed immutable-tag verification, full SDK verification, deterministic asset verification, transfer verification, and all four attestations. Its publication step then failed because the no-checkout job lacked GitHub CLI repository context. The exact transferred, checksummed, and attested artifact was independently reverified and published without moving the tag. The workflow now sets `GH_REPO` from `github.repository` on both GitHub CLI steps.
  - Post-release branch CI runs the current examples and package checks, but reconstructs the byte-pinned `v0.6.0` release assets only when `github.sha` equals release commit `76f289b7f1514f4bc490d0de6dbffbb61a4c9f0e`. This keeps current public documentation accurate without presenting later `0.6.0` source bytes as the released tarball.
  - Asset SHA-256 digests: `SHA256SUMS` `546b57b8115cd14d8c36b93464069c4e599fbb1a2c37b65dbe65d0417d92ed91`; SBOM `62fdd909980cdfa6e8538061f63e2be9aa189ec4b79b35a8d579e229bb7b5525`; tarball `3b50ebaa83e0a025ba49aaf81099e8de805e35e2c177a76beb4b985b575a9efe`; manifest `2a9ce563234df4f6617001fc944fe827b562ffb26bfb63edd77893e311f35766`.
  - GitHub attestation verification passed for all four assets against signer workflow `.github/workflows/github-prerelease.yml`, source ref `refs/tags/v0.6.0`, and source digest `76f289b7f1514f4bc490d0de6dbffbb61a4c9f0e`; [attestation record](https://github.com/xiongxhc/collective-cognition-sdk/attestations/38461049).
  - A clean Node.js `24.14.0` consumer installation from the downloaded tarball imported all seven JavaScript runtime subpaths and passed the generic validator, team-memory CLI, and Markdown CLI checks.
  - Private vulnerability reporting is enabled. The unauthenticated exact npm-registry version request returned `404`, and `package.json` retains `"private": true`; `collective-cognition-sdk@0.6.0` remains npm-unpublished.

**Release execution checklist**

- [x] Complete the local Node 24 verification gate and two identical asset
  builds on the reviewed feature head.
- [x] Open, review, and squash-merge the feature pull request; delete its
  branch and verify the local and remote default branch match.
- [x] Enable and verify private vulnerability reporting before tagging.
- [x] Create one annotated `v0.6.0` tag on verified `master` and push only that
  tag; do not force, delete, or move a public tag.
- [x] Wait for GitHub Actions, verify prerelease and not-latest state, download
  the four assets, and verify checksums, manifest and SBOM bytes and semantics,
  tag commit, private state, Node/npm versions, attestations, every public
  JavaScript/JSON/text subpath, all installed CLIs, and an unauthenticated exact
  npm-registry `404` for `collective-cognition-sdk@0.6.0`.
- [ ] If a public tag fails verification, issue a new prerelease version after
  correction; do not retag `v0.6.0`.

**Explicit deferrals**

- No standards-body claim, universal compatibility claim, hosted platform, or long-term support promise without operational capacity.

## Phase 4: Adapter Ecosystem Foundations

**Status:** Complete. All Phase 4 design acceptance gates pass. The SQLite database persistence adapter, maintained source-connector slice, [Markdown cognition adapter](markdown-cognition-adapter-guide.md), and source-neutral [Durable Cognition Workflow `0.1.0`](durable-cognition-workflow-guide.md) are implemented. Private, unpublished package `0.9.0` adds the exact workflow and SQLite workflow-store subpaths, installed workflow executable, compatibility baseline, RFC 0010, guide, exact package allowlist, and clean-consumer verification without claiming npm publication or production use. Task 8 read-only acceptance and final whole-branch specification, code, and security reviews are complete. The experimental `v0.6.0` GitHub prerelease remains the only observed public package artifact recorded in Phase 3.

**Entry criteria**

- Stable SourceRecord and Supported Experimental connector contracts exist.
- Connector packaging and trust boundaries are documented.
- Every connector has a concrete consumer and owner.

**Deliverables**

- [x] Source-neutral connector conformance at `collective-cognition-sdk/connector-conformance/0.1.0`.
- [x] Team-memory as one maintained compatible connector at `collective-cognition-sdk/connectors/team-memory/0.1.0`, without a `team-memory-agent` dependency.
- [x] Dedicated `collective-cognition-teammem` export CLI with explicit source selection, public non-secret `sourceInstance`, default raw omission, and sanitized failures.
- [x] Private package `0.5.0` subpaths, executable, compatibility baseline, declaration closures, clean-consumer checks, and exact packaging allowlists.
- [x] A concrete database persistence adapter that operates only on an explicitly supplied target and never discovers application data implicitly. The optional `collective-cognition-sdk/stores/sqlite/0.1.0` reference adapter requires a separate absolute cognition target, preserves canonical object and event records, and leaves source ledgers untouched.
- [x] The reviewed [Markdown cognition adapter](superpowers/specs/2026-07-30-markdown-cognition-adapter-design.md), operating only on an explicitly initialized managed directory.
- [x] A connector author guide and RFC explaining independent repositories and packages, SourceRecord neutrality, connector-owned concerns, and conformance limits.
- [x] Deterministic object-to-Markdown and Markdown-to-object fixtures with stable IDs, versions, relationships, and provenance.
- [x] A source-neutral durable workflow that atomically persists an explicit Hypothesis, promoted neutral Evidence, transitioned Hypothesis, and event, then reports publication and optional Markdown projection as separate recoverable downstream stages.

**Acceptance checks**

- [x] Generic and maintained connectors pass the same SourceRecord conformance boundary.
- [x] Maintained connector tests prove explicit read-only source selection, deterministic output, identity isolation, default raw omission, explicit privacy opt-in, and no source mutation.
- [x] Package tests cover every historical entrypoint plus the versioned workflow and SQLite workflow-store imports, exact package contents, and all four installed CLIs.
- [x] Persistence adapter tests prove that durable cognitive objects and audit events survive round trips without depending on a source store's private schema.
- [x] Manual real-ledger acceptance for the maintained connector: `12,807` records validated without raw content, repeated export SHA-256 `698ffd2d77dfdb588d85676582a37ee39fd8b9eff05708dc06fb580248453b17`, and source byte size plus nanosecond modification time unchanged.
- [x] Independent final verification for the preceding connector and SQLite
  slices, with no unresolved Critical or Important issue.
- [x] Object → Markdown → object round trips preserve normative semantics.
- [x] Markdown object revisions and cognition-event target versions accept
  `99,999,999`, reject `100,000,000`, and fail before target I/O.
- [x] Repeated exports do not rewrite unchanged notes.
- [x] Tests prove the Markdown adapter never discovers or operates on a personal vault implicitly.
- [x] Private package `0.6.0` export, executable, compatibility baseline, and
  clean-consumer checks cover the Markdown adapter.
- [x] Final whole-branch review reconciles the Markdown adapter with the
  package baseline and all project checks.
- [x] Durable workflow tests cover preparation before host invocation, atomic
  SQLite commit, exact replay, conflict precedence, rollback, concurrency,
  close/reopen, downstream partial success, managed Markdown recovery, and the
  closed installed CLI.
- [x] Private package `0.9.0` records exact runtime/type inventories,
  declaration closures and digests, executable modes, clean-consumer imports,
  packed CLI execution, and a tarball allowlist that excludes sources, tests,
  examples, and plans.
- [x] [Read-only durable-workflow acceptance](acceptance/durable-cognition-workflow-0.1.0.md)
  records `12` bounded canonical SourceRecords, exact commit/replay and Markdown
  statuses, schema-version-`2` row semantics, zero inferred Decisions or
  Principles, and equal source identity and SHA-256 values without live-vault
  access.
- [x] Task 8 final independent specification and code review.

**Current Markdown verification evidence**

- Bundled Node.js `24.14.0` full matrix: `444` passed and `1` expected skip,
  comprising `406` source passes and `1` source skip, `10` schema, `19`
  compatibility, and `9` package tests.
- Focused object/event version-boundary verification passed `41/41`.
- Two fresh temporary team-vault acceptance runs passed; acceptance used
  temporary vaults only and did not mutate a live vault.
- Typecheck, syntax checks, all examples, `pack:check`, `git diff --check`, and
  whole-branch diff hygiene passed.
- Independent whole-branch review returned **CLEAN** with no unresolved
  Critical or Important finding.
- Package `0.6.0` remains private and unpublished; this evidence is not a
  production-certification or publication claim.

**Current SQLite verification evidence**

- The durable fixture-ledger workflow proves source-ledger byte size and modification time are unchanged while a separate cognition database persists a Hypothesis, neutral Evidence, one transitioned Hypothesis revision, and one audit event across close/reopen.
- Node.js `24.19.0` permission-model hardening keeps the synthetic personal-vault path outside the readable fixture root, keeps writes limited to explicit cognition targets, and passes the full package suite with `561` passes, `9` expected immutable-release-context skips, `1` expected supported-runtime inverse-test skip, and `0` failures. The focused durable Team Memory example passes `11/11` on both Node.js `24.14.0` and `24.19.0`.
- The SQLite `0.4.0` slice and maintained connector package `0.5.0` slice were final-review verified on the supported bundled Node.js runtime. Publication readiness remains an explicit unfinished gate below.
- The [recorded read-only acceptance evidence](acceptance/durable-cognition-workflow-0.1.0.md) persists a version-`2` `under_review` Hypothesis, neutral Evidence with `12` provenance records, and one event in a separate temporary cognition database; it records `0` Decisions, `0` Principles, successful close/reopen replay and Markdown verification, and equal source size, modification time, change time, inode, and SHA-256 values. Task 8 independent specification and code/security reviews are complete with no unresolved findings; the package remains private, unpublished, and not production-certified.

**Explicit deferrals**

- No changes to `team-memory-agent`, MemberKit, or `teammem-bundle/v1`.
- No scheduler integration or automatic connector execution.
- No connector registry, marketplace, plugin discovery, or dynamic loading.
- No network connectors, authentication integration, or credential policy.
- No automatic promotion, interpretation, or cognition persistence.
- No durable publication outbox, retry worker, or delivery guarantee.
- No npm publication, registry-name confirmation, or removal of the private package guard.
- No production certification, endorsement, or LTS commitment.
- No editable Markdown import/store, automatic Markdown projection scheduling,
  Git automation, or live-vault mutation.
- No automatic belief extraction, background vault synchronization, collaborative merge service, or replacement of normal note-taking.
- No descriptor-relative native or platform-specific Markdown filesystem
  backend yet. The runtime-dependency-free core requires that untrusted
  same-privilege processes do not concurrently mutate the managed target;
  optional `openat`/`renameat`/`unlinkat` hardening remains future work.
- No migration from SQLite schema version `1`; workflow operators select a new
  explicit schema-version-`2` cognition database.
- No publisher in `collective-cognition-workflow`; Markdown is not
  authoritative storage.

## Phase 5: Cross-Connector Interoperability

**Status:** Next SDK development slice. Phase 4 is complete. Phase 5 remains pending the two-connector criteria: at least two independently useful connectors must pass their own contract tests, and a real cross-connector exchange workflow must have a named owner.

**Entry criteria**

- Phase 3 conformance artifacts are published.
- At least two independently useful connectors pass their own contract tests.
- A real exchange workflow has a named owner.

**Deliverables**

- Shared fixtures covering source records, cognitive objects, transitions, events, extensions, and errors.
- An interoperability report documenting semantic matches, mismatches, and migrations.
- Compatibility tests proving connectors do not depend on another connector's private behavior.

**Acceptance checks**

- Two connectors emit semantically valid source records consumed by the same generic ingestion path.
- Objects exported through the exchange format remain semantically equivalent.
- Unsupported extensions fail or degrade according to compatibility rules, never silently.

**Explicit deferrals**

- No distributed consensus, real-time synchronization, arbitrary ecosystem guarantee, or certification claim for untested implementations.

## Phase 6: Operational Governance and Retirement Tooling

**Status:** Planned.

**Entry criteria**

- Interoperability exposes real extension and migration needs.
- Named human owners exist for semantic, security, and release decisions.
- Consequential transition and conflict cases have operational examples.

**Deliverables**

- RFC-backed proposal, approval, conflict, learning, and policy-promotion workflows that operationalize the Phase 3 compatibility policy rather than creating the first policy.
- Extension registry rules, migration tooling, decision records, deprecation enforcement, and retirement tooling built on the Phase 3 policy.
- Organization-configurable authorization policies compatible with core safety boundaries.
- Connector maintenance, vulnerability, and retirement policy.

**Acceptance checks**

- Operational additive and breaking changes exercise the established governance and retirement path.
- Migration tests preserve provenance and historical events.
- Agents can recommend consequential changes but cannot self-confirm them.

**Explicit deferrals**

- No autonomous constitutional authority, universal organizational policy, deletion of historical rationale, or assumption that process resolves social conflict.

## Phase 7: Real-Team Validation

**Status:** Planned.

**Entry criteria**

- Governance and migrations work outside synthetic fixtures.
- Participating teams opt in with accountable owners and review cadence.
- Data access, retention, consent, and rollback boundaries are approved.

**Deliverables**

- Time-bounded pilots using canonical ingestion and cognitive objects in normal team decisions.
- Measures for decision traceability, repeated-debate reduction, evidence reuse, review responsiveness, reliability, and maintenance cost.
- Findings with adopt, revise, or stop criteria.

**Acceptance checks**

- Pilots run for agreed periods with authenticated human confirmation for consequential changes.
- Results compare against documented baselines and include participant feedback.
- Each team records a supported go, revise, or stop decision.
- Broader adoption claims are based on measured evidence rather than repository ambition.

**Explicit deferrals**

- No mandatory organization-wide rollout, automated employee evaluation, irreversible migration, or scale claim without demonstrated usage.
