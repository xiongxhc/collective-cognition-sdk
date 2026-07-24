# Roadmap

The roadmap separates what the TypeScript reference implementation can do now from work that requires specification, interoperability, governance, and operational evidence. A later phase starts only after its entry criteria are met.

## Phase 1: Runnable Core

**Status:** Runnable locally as private reference source.

**Entry criteria**

- The core design is approved.
- Node.js 24 or newer is available.
- The initial object, lifecycle, authorization, event, and serialization boundaries are defined.

**Deliverables**

- Immutable, attributed cognitive objects for identities, goals, hypotheses, experiments, evidence, decisions, and principles.
- Validated lifecycle transitions with auditable events and structurally bound, asserted human-confirmation metadata for consequential changes.
- JSON round trips, automated tests, a complete cognitive-loop example, and a read-only team-memory evidence adapter.

**Acceptance checks**

- `npm test`, `npx tsc --noEmit`, and `npm run check` pass.
- `npm run example` prints a complete `Goal → Hypothesis → Experiment → Evidence → Decision → Principle` chain.
- The team-memory example reads no more than five rows without changing the source ledger.

**Explicit deferrals**

- No persistent repository, service, event bus, UI, universal evidence score, conversation-to-decision inference, language-neutral standard, Obsidian integration, externally packaged SDK, or stable exports map.
- Type-specific `data` payloads remain permissive; required semantic fields and stricter per-type validation are deferred to specification stabilization.
- Team-memory time filters retain the source ledger's textual timestamp ordering; absolute-time normalization across mixed UTC offsets is deferred to adapter hardening.

## Phase 2: Specification Stabilization

**Entry criteria**

- Phase 1 acceptance checks pass.
- Core semantics have implementation feedback from at least one external consumer.
- Open semantic ambiguities are recorded as RFCs rather than resolved only in code.

**Deliverables**

- A language-neutral core charter and normative definitions for objects, type-specific payload fields, relationships, transitions, authorization, errors, and events.
- Versioned machine-readable schemas and canonical conformance fixtures.
- Compatibility, extension naming, versioning, and deprecation rules.
- A stable package surface, exports map, packaging plan, and external distribution readiness criteria.

**Acceptance checks**

- Every normative rule maps to a schema assertion, conformance fixture, or explicit prose-only rationale.
- The TypeScript implementation passes the published conformance suite.
- Required payload semantics and package exports are covered by compatibility tests before any external package-readiness claim.
- Breaking-change and extension review procedures are documented and exercised on one sample change.

**Explicit deferrals**

- No claim of standards-body status, cross-language compatibility, storage protocol, synchronized vault format, or organization-wide governance.

## Phase 3: Obsidian/Markdown Adapter

**Entry criteria**

- Phase 2 schemas and compatibility rules are stable enough to preserve IDs and versions.
- A test vault or fixture directory is approved; the personal vault remains out of scope.
- Markdown metadata, links, conflict handling, and ownership boundaries have accepted RFCs.

**Deliverables**

- A separate adapter that maps cognitive objects to readable Markdown with stable IDs, versions, relationships, and provenance.
- Bidirectional import/export with deterministic fixtures.
- Conflict diagnostics and a documented backup/recovery procedure.

**Acceptance checks**

- Object → Markdown → object round trips preserve all normative semantics.
- Repeated exports are deterministic and do not rewrite unchanged notes.
- Tests prove the adapter operates only on an explicitly provided fixture or configured vault path.

**Explicit deferrals**

- No direct operation on the personal Obsidian vault, automatic belief extraction, background synchronization, collaborative merge service, or replacement of normal note-taking.

## Phase 4: Second-Adapter Interoperability

**Entry criteria**

- Phase 2 conformance artifacts are published.
- The Markdown adapter passes its round-trip checks.
- A second adapter has a concrete consumer, owner, and independently useful storage or exchange target.

**Deliverables**

- A second adapter implemented without depending on Markdown-specific behavior.
- Shared fixtures covering objects, transitions, events, extensions, and error cases.
- An interoperability report documenting semantic matches, mismatches, and required migrations.

**Acceptance checks**

- Both adapters import the same fixtures into semantically equivalent objects.
- Objects exported by either adapter can be consumed by the other through the defined exchange format.
- Unsupported extensions fail or degrade according to the compatibility rules, never silently.

**Explicit deferrals**

- No broad ecosystem compatibility claim, distributed consensus, real-time synchronization, adapter marketplace, or guarantee for untested implementations.

## Phase 5: Governance and Evolution

**Entry criteria**

- Interoperability checks expose real extension and migration needs.
- Named human owners exist for semantic policy, security, and release decisions.
- Consequential transition and conflict cases have operational examples.

**Deliverables**

- RFC-backed proposal, approval, conflict, learning, and policy-promotion workflows.
- Extension registry rules, migration tooling, decision records, and deprecation enforcement.
- Organization-configurable authorization policies that remain compatible with core safety boundaries.

**Acceptance checks**

- One additive and one breaking semantic change complete the documented governance path.
- Migration tests preserve provenance and historical events.
- Agents can recommend consequential changes but cannot self-confirm them.

**Explicit deferrals**

- No autonomous constitutional authority, universal organizational policy, deletion of historical rationale, token voting, or assumption that governance process resolves social conflict.

## Phase 6: Real-Team Validation

**Entry criteria**

- Governance and migrations have been exercised outside synthetic fixtures.
- A team opts in with named accountable owners, a review cadence, and measurable baseline questions.
- Data access, retention, consent, and rollback boundaries are approved.

**Deliverables**

- A time-bounded pilot using the model in normal team decisions.
- Operational measures for decision traceability, repeated-debate reduction, evidence reuse, review responsiveness, reliability, and maintenance cost.
- A findings report with adoption, revision, or stop criteria.

**Acceptance checks**

- The pilot runs for the agreed period with auditable, authenticated human confirmation on consequential changes.
- Measures compare against a documented baseline and include participant feedback.
- The team records a go, revise, or stop decision supported by pilot evidence.

**Explicit deferrals**

- No mandatory organization-wide rollout, productivity or intelligence claims without evidence, automated employee evaluation, irreversible migration, or expansion beyond the consented pilot.
