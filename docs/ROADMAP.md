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

**Status:** In progress.

**Active next slice**

- [x] SourceRecord-first normative conformance design approved.
- [x] Implement the versioned SourceRecord schema, normative prose, fixtures, differential conformance tests, and packaged artifacts described in [`2026-07-27-source-record-normative-conformance-design.md`](superpowers/specs/2026-07-27-source-record-normative-conformance-design.md).

**Delivered in the SourceRecord normative-conformance slice**

- [x] Normative SourceRecord `0.1.0` prose with stable rule identifiers and rule-to-check mapping.
- [x] A strict JSON Schema Draft 2020-12 artifact with self-asserting timestamp, field, context, and extension rules.
- [x] Versioned valid and invalid language-neutral fixtures shared by schema, SDK, and CLI tests.
- [x] Lossless pre-schema rejection of duplicate JSON member names and lone surrogate strings.
- [x] A stable installed schema subpath plus exact package and clean-consumer verification.
- [x] Runtime timestamp behavior aligned to the normative serialized profile.

**Delivered in the initial package-stabilization slice**

- [x] ESM JavaScript and declaration output under ignored `dist/`.
- [x] An explicit source-neutral root exports map and installed `collective-cognition` executable contract.
- [x] An npm package-content allowlist that excludes source, tests, examples, planning documents, and connector entrypoints.
- [x] Compatibility smoke tests for built imports, runtime exports, declaration specifiers, default TypeScript consumer settings, CLI behavior, exact dry-run tarball contents, and clean temporary consumer installation.
- [x] A retained `"private": true` publication guard.

**Entry criteria**

- Phase 2 fixtures and contracts pass in the TypeScript implementation.
- The generic CLI exercises canonical ingestion without importing a source connector.
- Semantic ambiguities are captured as RFCs.

**Deliverables**

- A language-neutral charter and normative definitions for objects, source records, relationships, transitions, authorization, errors, and events.
- Additional versioned machine-readable schemas and normative fixtures beyond SourceRecord.
- Compatibility, extension naming, versioning, and deprecation rules.
- Host integration contracts for cognition persistence and event publication without selecting a mandatory database or service architecture.
- Final stable package guarantees, API documentation, and external distribution readiness criteria.
- An explicitly selected license, confirmed registry package name, and publication approval process.
- Supported-runtime and security policy.

**Acceptance checks**

- Every normative rule maps to a schema assertion, fixture, test, or explicit prose-only rationale.
- The TypeScript implementation passes the published conformance suite.
- Persistence contracts keep source stores and cognition stores logically distinct and are testable through a host-supplied implementation.
- Public exports and CLI behavior have compatibility tests.
- Package dry-run verification includes only approved artifacts and publication remains blocked until every release gate is complete.
- One sample additive change and one sample breaking change exercise the documented process.

**Explicit deferrals**

- No standards-body claim, universal compatibility claim, hosted platform, or long-term support promise without operational capacity.

## Phase 4: Adapter Ecosystem Foundations

**Status:** Planned.

**Entry criteria**

- Stable source-record and connector contracts exist.
- Connector packaging and trust boundaries are documented.
- Every connector has a concrete consumer and owner.

**Deliverables**

- Team-memory as the first maintained connector.
- A reference persistence adapter that operates only on an explicitly supplied target and never discovers application data implicitly.
- An Obsidian/Markdown adapter operating only on an explicitly provided fixture or configured vault.
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

## Phase 6: Governance and Evolution

**Status:** Planned.

**Entry criteria**

- Interoperability exposes real extension and migration needs.
- Named human owners exist for semantic, security, and release decisions.
- Consequential transition and conflict cases have operational examples.

**Deliverables**

- RFC-backed proposal, approval, conflict, learning, and policy-promotion workflows.
- Extension registry rules, migration tooling, decision records, and deprecation enforcement.
- Organization-configurable authorization policies compatible with core safety boundaries.
- Connector maintenance, vulnerability, and retirement policy.

**Acceptance checks**

- One additive and one breaking semantic change complete the governance path.
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
