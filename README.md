# Collective Cognition SDK

Collective Cognition SDK is experimental, dependency-free TypeScript reference source for attributed, versioned collaborative reasoning. It models a portable `Goal → Hypothesis → Experiment → Evidence → Decision → Principle` loop without prescribing storage, UI, agent runtime, source system, or organizational beliefs.

The project is designing a universal SDK, but the current repository remains private reference source rather than an externally packaged or production-ready SDK.

Phase 2 universal ingestion is implemented and locally verified. Phase 3 specification and package stabilization remains planned.

## Current Status

Runnable now:

- immutable identities, goals, hypotheses, experiments, evidence, decisions, and principles;
- validated lifecycle transitions with an auditable event for every successful transition;
- structural human-confirmation checks for configured consequential transitions;
- JSON serialization and a complete cognitive-loop example;
- a versioned, immutable `SourceRecord` contract with canonical JSON/JSONL ingestion;
- deterministic duplicate and source-revision collision classification;
- explicit, versioned neutral-Evidence promotion and a composed workflow that preserves both stages;
- a source-neutral `cc` CLI for validate, ingest, promote, and ingest-promote operations;
- canonical valid and invalid conformance fixtures;
- an experimental read-only team-memory SQLite connector that emits SourceRecord JSONL;
- a small Git commit fixture connector used to prove a second source-specific module satisfies the same SourceRecord contract.

Not implemented yet:

- stable package exports or external distribution;
- persistence, services, UI, synchronization, or connector ecosystem;
- Obsidian/Markdown integration;
- automatic cognition from conversations.

The team-memory connector proves that real source data can enter the neutral ingestion boundary. It is imported directly from `src/adapters/team-memory.ts`. The Git fixture connector is imported directly from `src/adapters/git-commit.ts`. Neither source-specific connector is exported from the root public API.

## Universal Architecture

The approved architecture separates collection from interpretation:

```text
any external source
  → immutable SourceRecord
  → explicit, versioned promotion policy
  → Evidence or another supported CognitiveObject
```

Canonical JSON and JSONL are the minimum no-code integration path. Reusable connectors remain planned for common systems. A team needs custom connector code only when its source cannot emit canonical records and no shared connector exists.

A convenience workflow may ingest and promote in one operation, but it must preserve and expose both artifacts. Successful parsing never means that material is true, accepted evidence, or authorized for a consequential decision.

Read the [universal ingestion design](docs/superpowers/specs/2026-07-24-universal-ingestion-design.md), [implemented RFC](rfcs/0001-universal-source-record-ingestion.md), and [roadmap](docs/ROADMAP.md).

## Requirements

- Node.js 24 or newer. The examples rely on Node 24 native TypeScript execution.
- `npm install` for development-only TypeScript and Node type packages.
- No production dependencies.

## Commands

```bash
npm test
npx tsc --noEmit
npm run check
npm run example
npm run --silent example:teammem -- /path/to/team-memory-agent/ledger.db
npm run --silent teammem:export -- --db /path/to/ledger.db --limit 5
```

Run the canonical conformance suite directly:

```bash
node --test tests/conformance.test.ts
```

`npm run example` prints an attributed complete chain, a rejected unconfirmed decision approval, a successful human-confirmed approval, and the successful event count.

The migrated team-memory commands are experimental connector tools:

- `example:teammem` reads at most five ledger rows, creates SourceRecords, and explicitly promotes them with `neutral-evidence-v1`.
- `teammem:export` writes SourceRecord JSONL and supports `--from`, `--to`, `--person`, `--project`, and `--limit`.
- `--silent` prevents npm banners from contaminating stdout.

The former experimental `--hypothesis-id` and `--context-id` export arguments were removed because export no longer creates Evidence. Use the generic CLI for source-neutral operations:

```bash
npm run --silent cc -- validate --input records.jsonl --format jsonl
npm run --silent cc -- ingest --input records.jsonl --format jsonl
npm run --silent cc -- promote --input records.jsonl --format jsonl \
  --policy neutral-evidence-v1 \
  --hypothesis-id hypothesis:delivery-risk \
  --context-id organization:team \
  --initiator-id human:owner \
  --executor-id agent:importer \
  --accountable-id human:owner \
  --promoted-at 2026-07-24T12:00:00.000Z
```

`validate` emits one item-result JSON line per input item. `ingest` emits accepted unique SourceRecords. `promote` validates and promotes valid unique records. `ingest-promote` emits one composed result containing the separate ingestion and promotion stages. Rejected batch items are written as structured diagnostics to stderr and produce a nonzero exit.

## Current Team-Memory Safety

- SQLite is opened read-only and queried with `SELECT` only.
- Every selected row maps to an immutable SourceRecord before any interpretation.
- Promotion is a separate caller-selected operation; the built-in policy emits new `collected`, neutral Evidence linked to a caller-supplied hypothesis.
- The connector does not infer support, challenge, truth, confidence, decisions, or evidence quality.
- The provided ledger path is the only external source.
- The personal Obsidian vault is not read or written.
- This repository does not modify the `team-memory-agent` LaunchAgent or scheduled team-vault output.
- Time filtering follows stored timestamp text; mixed offsets can differ from absolute-time ordering near a boundary.
- `node:sqlite` is experimental in Node 24 and may emit an `ExperimentalWarning`; npm scripts suppress the warning only for readable output.

## Authorization Boundary

`transitionObject` accepts an optional public `AuthorizationPolicy`; without one it uses the built-in structural evaluator. The default evaluator validates shape, chronology, human actor assertion, and `objectId`/`targetState`/`eventId` binding. It does not authenticate the actor, prove consent, or verify that an approval record exists.

Production callers must inject a policy backed by authenticated identity and trusted approval records. Acceptance by the default evaluator is not proof that a person actually approved a transition.

## Semantic Limits

Type-specific `data` payloads remain permissive JSON-compatible structures. Required semantic fields, language-neutral schemas, and stricter per-type validation remain roadmap work.

The project does not claim universal compatibility, production readiness, or broad adoption. Those claims require a stable package, independently implemented connectors, and real-team evidence.

## Roadmap

The tracked [roadmap](docs/ROADMAP.md) separates:

1. the completed runnable core;
2. the completed universal neutral-first ingestion foundation;
3. specification and package stabilization;
4. adapter ecosystem foundations;
5. cross-connector interoperability;
6. governance and evolution;
7. real-team validation.

Semantic changes use [RFCs](rfcs/README.md). Language-neutral specification contributions start in [spec](spec/README.md).
