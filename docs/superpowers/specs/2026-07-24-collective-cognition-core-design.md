# Collective Cognition Core Design

**Date:** 2026-07-24

## Purpose

Collective Cognition SDK gives humans, agents, teams, and organizations a shared, portable model for long-lived collaborative reasoning. The first release validates a minimal cognitive loop without prescribing storage, user interface, agent runtime, or organizational beliefs.

The immediate deliverable is runnable TypeScript reference SDK source and a CLI for local testing. It is not an externally packaged SDK. Language-neutral specification work, package exports/distribution, and an Obsidian/Markdown adapter remain explicit roadmap tracks rather than being hidden or removed from scope.

## Phase 1 Success Criteria

Phase 1 is complete when a local caller can:

1. create attributed and versioned cognitive objects;
2. form a complete `Goal → Hypothesis → Experiment → Evidence → Decision → Principle` chain;
3. perform valid lifecycle transitions and reject invalid ones;
4. distinguish initiator, executor, and accountable party;
5. require human confirmation for configured consequential transitions;
6. serialize and deserialize objects without losing semantic information;
7. receive an auditable event for every successful state change;
8. run automated tests demonstrating the preceding behavior.

## Repository Shape

```text
collective-cognition-sdk/
├── docs/
│   ├── ROADMAP.md
│   └── superpowers/
│       ├── plans/
│       └── specs/
├── examples/
│   └── cognitive-loop.ts
├── rfcs/
│   └── README.md
├── spec/
│   └── README.md
├── src/
│   ├── authorization.ts
│   ├── errors.ts
│   ├── events.ts
│   ├── index.ts
│   ├── objects.ts
│   ├── transitions.ts
│   └── types.ts
├── tests/
│   ├── cognitive-loop.test.ts
│   ├── serialization.test.ts
│   └── transitions.test.ts
├── package.json
├── tsconfig.json
└── README.md
```

Each source file has one responsibility:

- `types.ts` defines shared identifiers, attribution, version, lifecycle, provenance, and confirmation types.
- `objects.ts` defines the eight Phase 1 object shapes and their creation rules.
- `authorization.ts` evaluates whether a requested transition is automatic, human-confirmed, or denied.
- `transitions.ts` validates lifecycle changes and creates updated immutable object versions.
- `events.ts` defines and creates the common event envelope.
- `errors.ts` defines stable domain error codes.
- `index.ts` exposes the reference source API used by local tests and examples.

## Core Objects

Phase 1 contains eight object categories:

- `Identity` attributes actions to a human, agent, team, or organization.
- `Goal` expresses an owned objective with success criteria.
- `Hypothesis` expresses a scoped and falsifiable claim.
- `Experiment` defines an action intended to produce evidence.
- `Evidence` records sourced material and whether it supports or challenges a claim.
- `Decision` records selected and rejected options, rationale, and approval.
- `Principle` records a durable rule with a higher adoption threshold than a decision.
- `Event` records every accepted change.

All cognitive objects share:

- a stable object ID;
- an object type;
- an integer version beginning at `1`;
- a lifecycle state;
- creation and update timestamps;
- initiator, executor, and accountable party identities;
- provenance references;
- an organization or collaboration context;
- an extension map for namespaced, non-core fields.

Objects are immutable values. A transition produces a new object version and one event; it never mutates the prior version.

## Lifecycle Boundaries

Phase 1 implements the lifecycles defined by the source idea:

- `Goal`: `draft → active → at_risk | paused | achieved | abandoned | revised`
- `Hypothesis`: `proposed → under_review → testing → supported | refuted | inconclusive`
- `Experiment`: `planned → active → completed | cancelled`
- `Evidence`: `collected → assessed → accepted | disputed | rejected | expired`
- `Decision`: `draft → proposed → approved | rejected`, then `approved → active → superseded → archived`
- `Principle`: `proposed → trial → adopted | rejected`, then `adopted → revised | retired`

Terminal states remain historical and cannot be deleted through the core API. Reopening or superseding an object creates a new version or related object according to that object’s lifecycle; it does not overwrite evidence or rationale.

## Relationships

Relationships are typed references rather than embedded copies:

- a `Goal` may reference parent goals;
- a `Hypothesis` references at least one goal;
- an `Experiment` references at least one hypothesis;
- `Evidence` references its source and one or more hypotheses or experiments;
- a `Decision` references goals, evidence, considered options, and accountable identities;
- a `Principle` references the decisions, evidence, or learning that justify adoption or revision.

Creation fails when required references are absent or duplicate IDs make a relationship ambiguous. Phase 1 validates relationship shape and required cardinality; cross-store existence checks belong to repositories or adapters.

## Authorization and Confirmation

Every transition request carries:

- initiator;
- executor;
- accountable party;
- automation mode;
- optional human confirmation;
- rationale;
- timestamp.

The core authorization evaluator returns one of three decisions:

- `allowed`: the transition may proceed;
- `confirmation_required`: the transition is structurally valid but needs a named human confirmation;
- `denied`: the transition is not permitted.

The default structural evaluator permits humans and agents to create drafts and proposals. It requires asserted human-confirmation metadata for:

- marking a goal `achieved` or `abandoned`;
- accepting evidence used for consequential decisions;
- approving, activating, superseding, or archiving a decision;
- adopting, revising, or retiring a principle.

Agents may recommend these transitions but cannot structurally satisfy the human-confirmation requirement themselves. `HumanConfirmation` binds the asserted approval to `objectId`, `targetState`, and `eventId`, and confirmation chronology cannot follow the event.

The default evaluator validates only asserted metadata: shape, chronology, human actor kind, and transition binding. It does not authenticate identity, prove consent, or verify an approval record. `transitionObject` accepts a public `AuthorizationPolicy` function so integrated or production callers can inject a policy backed by authenticated identity and trusted approval records. Such callers must not treat acceptance by the default evaluator as proof of actual human approval.

## Event Flow

A caller submits an object, target state, transition context, and policy:

```text
request
  → validate object and target transition
  → evaluate authorization
  → require confirmation when applicable
  → create next immutable object version
  → create event envelope
  → return object and event together
```

If any step fails, no new object or event is returned. Persistence and publication happen outside the core so an adapter can commit the object and event atomically using its own transaction mechanism.

Every event contains:

- event ID and timestamp;
- event type;
- object ID, object type, and object version;
- previous and next state;
- initiator, executor, and accountable party;
- rationale and provenance;
- organization context;
- automation and human-confirmation markers;
- schema version.

## Error Model

The reference API throws domain errors with stable codes:

- `INVALID_OBJECT`
- `INVALID_RELATIONSHIP`
- `INVALID_TRANSITION`
- `CONFIRMATION_REQUIRED`
- `AUTHORIZATION_DENIED`
- `SERIALIZATION_ERROR`

Errors include a concise message and structured details. They do not include stack-dependent text in serialized output. Failed operations do not emit events.

## Serialization

The core uses plain JSON-compatible values:

- timestamps serialize as ISO 8601 strings;
- identifiers remain opaque strings;
- versions remain positive integers;
- discriminated unions preserve object and event types;
- extensions use namespaced keys to reduce collisions.

Phase 1 guarantees round-trip preservation for values produced by the SDK. JSON Schema generation and cross-language conformance fixtures are specification-roadmap work.

## Testing Strategy

Automated tests cover:

- creation of every Phase 1 object;
- rejection of missing attribution, provenance, or required relationships;
- every legal and representative illegal lifecycle transition;
- human-confirmation requirements and agent authority boundaries;
- immutability and monotonic version increments;
- event creation only after successful transitions;
- JSON serialization round trips;
- one complete cognitive-loop example.

Tests use deterministic IDs and timestamps supplied by the caller so assertions do not depend on wall-clock time or randomness.

## Roadmap Placement

The tracked roadmap contains these phases:

1. **Runnable core:** implement and validate the Phase 1 object model, transitions, authorization, serialization, events, and example.
2. **Specification stabilization:** write the core charter and object RFCs, harden type-specific payload semantics, publish machine-readable schemas, define stable package exports/distribution, and add compatibility and conformance rules.
3. **Obsidian/Markdown adapter:** map cognitive objects to human-readable Markdown, preserve IDs and versions, and prove bidirectional round trips.
4. **Interoperability proof:** add a second adapter and demonstrate that two implementations interpret objects, transitions, and events consistently.
5. **Governance and evolution:** add proposals, approvals, conflicts, learning, policy promotion, extension governance, and migration tooling.
6. **Real-team validation:** operate the model continuously and measure decision traceability, repeated-debate reduction, evidence reuse, and review responsiveness.

Each phase has explicit entry criteria, deliverables, acceptance checks, and deferred items in `docs/ROADMAP.md`.

## Non-Goals

Phase 1 does not:

- implement a database, event bus, web service, or user interface;
- implement an Obsidian adapter;
- define every object from the six-layer vision;
- infer cognitive objects from raw conversations;
- assign universal evidence scores;
- grant agents final authority over consequential decisions;
- claim protocol status or cross-language compatibility;
- claim external package readiness or stable exports;
- prescribe organizational values, policies, or beliefs.

## Design Decisions

- TypeScript is the first reference implementation; the model remains language-neutral.
- The reference source has no production dependencies so the semantic core remains portable and auditable.
- Core operations are deterministic and side-effect free.
- Storage, event delivery, identity providers, and organizational policy integrations are adapter concerns.
- The first complete example is one cognitive chain, not a broad ontology.
- Specification and Obsidian work remain first-class roadmap phases rather than optional future ideas.
