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

**Status:** In progress. The compatibility and Portable Cognition slices are delivered and final-review verified. Host Integration is implemented with focused executable evidence; final-review verification and broader Phase 3 work remain.

**Active next slice**

- [x] SourceRecord-first normative conformance design approved.
- [x] Implement the versioned SourceRecord schema, normative prose, fixtures, differential conformance tests, and packaged artifacts described in [`2026-07-27-source-record-normative-conformance-design.md`](superpowers/specs/2026-07-27-source-record-normative-conformance-design.md).
- [x] Compatibility, versioning, and deprecation design approved.
- [x] Compatibility, versioning, and deprecation slice delivered and verified.
- [x] Portable Cognition Contract `0.1.0` design approved and implementation completed.
- [x] Host integration contracts for cognition persistence and event publication without selecting a mandatory database, service, or delivery architecture. Final-review verification remains pending.

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
- Package version `0.2.0` retained `"private": true` at the time of this slice. It is superseded by the current private, unpublished package `0.3.0`; concrete persistence and connector adapters remain deferred.
- Compatibility hashes: baseline `0.1.0` `4e0c857ad8d115735aa8df99e9d524af55d3a6efae8ead7473b97c5201f5f89b`; change cases `0.1.0` `3337f8e2ca7aaa0769a18ad8ce724c621d94d01528980b6d30feec9e8626bd6b`; baseline `0.2.0` `3da00ab49c1f3b02bfc19226545dce68379546641f418993f632851b8c49ddc4`; change cases `0.2.0` `e0229b0436827bc71456e839e852f96d8d075da8fd65c32342fd6089c995e5f5`.
- SourceRecord artifact hashes remain byte-identical: schema `56cf53c5da98dfbec19a021fbb90673beab8248c7a77df44989b535a0e155648`; valid fixtures `f52c212026b70bf2b339e1132b2895c91be509f250dde841319dbbb4edd3f74a`; invalid fixtures `4705f32eb5ea48ddd693759728294d2557b0a6f4a5cc666843b2e03bb03e99c0`.
- Portable Cognition artifact hashes: prose `d73a6de049c7408715d7e717dd326e79830d99fe84ff85cb5936dfb8a757be89`; schema `6dec3f942ca88994fef588a2ffb93240d716e116dbec7ded46a1f362446f6bdd`; valid fixtures `cc3854706ace472b0d5335ecb9596c7ea3bf2b48c04fd9dd950f9683e8b203f4`; invalid fixtures `0f8e21f7379824223482e26ae26ec0b7b5031077ab63f6dac4558239b4908ba4`; cognitive-loop fixtures `1693d97e207cfeee63d370ba23d07ffd9023e8b087e5dbd3c0ad53e945184053`.
- The root-reachable declaration digest remains `75a3f931f18ba6dae205b5c8da41aadc1a0f68245fc8b237eb216e17febde766`.

**Delivered in the Host Integration slice; final review pending**

- [x] Normative Host Integration Contract `0.1.0`, store and publisher ports, commit coordinators, and a private package `0.3.0` compatibility baseline.
- [x] An in-memory reference host and reusable conformance harness covering commits, reads, conflicts, exact replay, immutable snapshots, publication idempotency, and secret-safe failures.
- [x] A runnable host example that persists an initial object, reports `committed_but_unpublished` after a first publication failure, retries the identical transition request, and reports one stored and published event.
- [x] Focused host integration, reference-host, and conformance suites pass locally; independent final-review verification is not yet complete.

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

- A language-neutral charter and normative definitions for objects, source records, relationships, transitions, authorization, errors, and events.
- Additional versioned machine-readable schemas and normative fixtures beyond SourceRecord.
- Host integration contracts for cognition persistence and event publication without selecting a mandatory database or service architecture.
- Final stable package guarantees, API documentation, registry publication, and external-distribution readiness criteria.
- Runtime and security policy.

**Acceptance checks**

- Every normative rule maps to a schema assertion, fixture, test, or explicit prose-only rationale.
- The TypeScript implementation passes the published conformance suite.
- Persistence contracts keep source stores and cognition stores logically distinct and are testable through a host-supplied implementation.
- Public exports and CLI behavior have compatibility tests.
- Package dry-run verification includes only approved artifacts and publication remains blocked until every release gate is complete.

**Explicit deferrals**

- No standards-body claim, universal compatibility claim, hosted platform, or long-term support promise without operational capacity.

## Phase 4: Adapter Ecosystem Foundations

**Status:** Planned.

**Entry criteria**

- Stable source-record and connector contracts exist.
- Connector packaging and trust boundaries are documented.
- Every connector has a concrete consumer and owner.

**Deliverables**

- [ ] Team-memory as the first maintained connector.
- [ ] A concrete database persistence adapter that operates only on an explicitly supplied target and never discovers application data implicitly.
- [ ] An Obsidian/Markdown adapter operating only on an explicitly provided fixture or configured vault.
- A connector author guide, conformance harness, and reference fixture connector.
- Deterministic object-to-Markdown and Markdown-to-object fixtures with stable IDs, versions, relationships, and provenance.

**Acceptance checks**

- Connectors pass the same source-record conformance suite.
- Persistence adapter tests prove that durable cognitive objects and audit events survive round trips without depending on a source store's private schema.
- Object → Markdown → object round trips preserve normative semantics.
- Repeated exports do not rewrite unchanged notes.
- Tests prove the Markdown adapter never discovers or operates on a personal vault implicitly.

**Explicit deferrals**

- No automatic belief extraction, background vault synchronization, collaborative merge service, or replacement of normal note-taking.

## Phase 5: Cross-Connector Interoperability

**Status:** Planned.

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
