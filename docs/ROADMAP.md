# Roadmap

This roadmap separates verified behavior from planned universal-SDK work. A later phase starts only after its entry criteria are met.

## Phase 1: Runnable Cognitive Core

**Status:** Complete as private local reference source.

**Delivered**

- Immutable, attributed cognitive objects for identities, goals, hypotheses, experiments, evidence, decisions, and principles.
- Validated lifecycle transitions, auditable events, and structural human-confirmation checks.
- JSON round trips, automated tests, and a complete cognitive-loop example.
- A read-only team-memory SQLite experiment that maps selected rows directly to neutral collected evidence.

**Verified commands**

- `npm test`
- `npx tsc --noEmit`
- `npm run check`
- `npm run example`

**Limits**

- The repository is private reference source, not a published SDK.
- Team-memory-specific root exports and direct Evidence mapping are experimental.
- No persistence, service, UI, stable exports map, language-neutral schema, or universal ingestion contract exists yet.
- Type-specific `data` payloads remain permissive.

## Phase 2: Universal Ingestion Foundation

**Status:** Architecture approved; draft RFC awaiting written review; implementation not started.

**Entry criteria**

- Phase 1 checks pass.
- Neutral-first ingestion is accepted as the root architectural direction.
- Current team-memory behavior is documented as an experiment rather than universal behavior.

**Deliverables**

- A versioned, source-neutral `SourceRecord` contract.
- SDK validation plus canonical JSON and JSONL codecs.
- Deterministic duplicate/collision classification and immutable source-revision semantics.
- Explicit, versioned promotion from source records to Evidence.
- A composed ingest-and-promote workflow that exposes both stages.
- Stable item-level batch results and errors.
- A generic CLI for validate, ingest, and promote operations.
- Migration of team-memory into a connector that emits source records.

**Acceptance checks**

- Valid and invalid canonical fixtures behave identically through SDK and CLI.
- Identical source-revision keys and content classify as duplicates; key reuse with different content fails as a collision.
- Changed content preserves prior revisions.
- Promotion preserves source-record and policy links.
- Valid ingestion remains observable when promotion fails.
- Root exports contain no team-memory-specific API.
- Every repository Markdown file describes the same current and target architecture.

**Explicit deferrals**

- No persistence service, remote ingestion endpoint, automatic semantic classification, connector marketplace, or production-scale claim.

## Phase 3: Specification and Package Stabilization

**Status:** Planned.

**Entry criteria**

- Phase 2 fixtures and contracts pass in the TypeScript implementation.
- At least one consumer exercises canonical ingestion without importing a source connector.
- Semantic ambiguities are captured as RFCs.

**Deliverables**

- A language-neutral charter and normative definitions for objects, source records, relationships, transitions, authorization, errors, and events.
- Versioned machine-readable schemas and canonical conformance fixtures.
- Compatibility, extension naming, versioning, and deprecation rules.
- Stable package exports, build artifacts, API documentation, and external distribution readiness criteria.
- Supported-runtime and security policy.

**Acceptance checks**

- Every normative rule maps to a schema assertion, fixture, test, or explicit prose-only rationale.
- The TypeScript implementation passes the published conformance suite.
- Public exports and CLI behavior have compatibility tests.
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
- An Obsidian/Markdown adapter operating only on an explicitly provided fixture or configured vault.
- A connector author guide, conformance harness, and reference fixture connector.
- Deterministic object-to-Markdown and Markdown-to-object fixtures with stable IDs, versions, relationships, and provenance.

**Acceptance checks**

- Connectors pass the same source-record conformance suite.
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
