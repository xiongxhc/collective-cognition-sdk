# Collective Cognition SDK

Collective Cognition SDK is experimental, dependency-free TypeScript reference source for attributed, versioned collaborative reasoning. It models a portable `Goal → Hypothesis → Experiment → Evidence → Decision → Principle` loop without prescribing storage, UI, agent runtime, source system, or organizational beliefs.

The project is designing a universal SDK, but the current repository is still private reference source rather than an externally packaged or production-ready SDK.

Phase 2 universal-ingestion implementation is currently in progress; the current commands below retain Phase 1 behavior until that work passes its acceptance checks.

## Current Status

Runnable now:

- immutable identities, goals, hypotheses, experiments, evidence, decisions, and principles;
- validated lifecycle transitions with an auditable event for every successful transition;
- structural human-confirmation checks for configured consequential transitions;
- JSON serialization and a complete cognitive-loop example;
- an experimental read-only team-memory SQLite adapter and JSONL exporter.

Not implemented yet:

- the approved neutral `SourceRecord` ingestion boundary;
- generic JSON/JSONL ingestion and explicit promotion policies;
- stable package exports or external distribution;
- persistence, services, UI, synchronization, or connector ecosystem;
- Obsidian/Markdown integration;
- automatic cognition from conversations.

The team-memory adapter proves that real source data can enter the model. Its direct row-to-`Evidence` mapping is an experimental compatibility path, not the future universal root API.

## Universal Architecture

The approved architecture separates collection from interpretation:

```text
any external source
  → immutable SourceRecord
  → explicit, versioned promotion policy
  → Evidence or another supported CognitiveObject
```

Canonical JSON and JSONL will be the minimum no-code integration path. Reusable connectors will be optional packages for common systems. A team will need custom connector code only when its source cannot emit canonical records and no shared connector exists.

A convenience workflow may ingest and promote in one operation, but it must preserve and expose both artifacts. Successful parsing never means that material is true, accepted evidence, or authorized for a consequential decision.

Read the [universal ingestion design](docs/superpowers/specs/2026-07-24-universal-ingestion-design.md), [draft RFC](rfcs/0001-universal-source-record-ingestion.md), and [roadmap](docs/ROADMAP.md).

## Requirements

- Node.js 24 or newer. The examples rely on Node 24 native TypeScript execution.
- `npm install` for development-only TypeScript and Node type packages.
- No production dependencies.

## Commands

```bash
npm test
npm run example
npm run --silent example:teammem -- /path/to/team-memory-agent/ledger.db
npm run --silent teammem:export -- --db /path/to/ledger.db --hypothesis-id hypothesis:delivery-risk --context-id organization:team
```

Additional verification:

```bash
npx tsc --noEmit
npm run check
```

`npm run example` prints an attributed complete chain, a rejected unconfirmed decision approval, a successful human-confirmed approval, and the successful event count.

The team-memory commands are current experimental tools:

- `example:teammem` reads at most five ledger rows and prints a count plus Evidence JSON.
- `teammem:export` writes Evidence JSONL and supports `--from`, `--to`, `--person`, `--project`, and `--limit`.
- `--silent` prevents npm banners from contaminating stdout.

These commands will migrate behind the neutral ingestion and connector boundaries described in RFC 0001.

## Current Team-Memory Safety

- SQLite is opened read-only and queried with `SELECT` only.
- Every selected row maps to new `collected`, neutral Evidence linked to a caller-supplied hypothesis.
- The adapter does not infer support, challenge, truth, confidence, decisions, or evidence quality.
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

The project does not claim universal compatibility, production readiness, or broad adoption yet. Those claims require a stable package, conformance fixtures, independently implemented connectors, and real-team evidence.

## Roadmap

The tracked [roadmap](docs/ROADMAP.md) separates:

1. the completed runnable core;
2. universal neutral-first ingestion;
3. specification and package stabilization;
4. adapter ecosystem foundations;
5. cross-connector interoperability;
6. governance and evolution;
7. real-team validation.

Semantic changes use [RFCs](rfcs/README.md). Language-neutral specification contributions start in [spec](spec/README.md).
