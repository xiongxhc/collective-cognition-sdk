# Collective Cognition SDK

This repository contains experimental, dependency-free TypeScript reference SDK source and a CLI for local testing of attributed, versioned collaborative reasoning. It models a portable `Goal → Hypothesis → Experiment → Evidence → Decision → Principle` loop without prescribing storage, UI, agent runtime, or organizational beliefs.

## Requirements

- Node.js 24 or newer. The examples rely on Node 24 native TypeScript execution.
- `npm install` to install development-only TypeScript and Node type packages.
- No production dependencies.

## Runnable Locally

- Create and JSON-round-trip immutable identities, goals, hypotheses, experiments, evidence, decisions, and principles.
- Validate lifecycle transitions and receive one auditable event for every successful transition.
- Structurally validate asserted human-confirmation metadata for configured consequential transitions.
- Read selected team-memory ledger rows as neutral, collected evidence through a read-only SQLite adapter.
- Run a complete cognitive-loop example and a bounded team-memory evidence example.

The current implementation is private runnable reference source, not an externally packaged SDK or a language-neutral standard. Packaging, a stable exports map, and external distribution are deferred in the roadmap. It does not provide persistence, cross-store relationship existence checks, a service, UI, Obsidian adapter, or automatic cognition from conversations.

Type-specific `data` payloads remain permissive JSON-compatible structures. Required semantic fields and stricter per-type validation are specification-stabilization work, not guarantees of the current reference source.

## Authorization Boundary

`transitionObject` accepts an optional public `AuthorizationPolicy`; without one it uses the built-in structural evaluator. The default evaluator validates the shape, chronology, human actor assertion, and `objectId`/`targetState`/`eventId` binding of supplied confirmation metadata. It does not authenticate the actor, prove consent, or verify that an approval record exists.

Integrated or production callers must inject a policy backed by authenticated identity and trusted approval records. A caller must not treat acceptance by the default evaluator as proof that a person actually approved the transition.

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

`npm run example` prints an attributed complete chain, the rejected unconfirmed decision approval, the successful human-confirmed approval, and the successful event count.

`npm run --silent example:teammem` reads at most five rows from the provided ledger and writes one count line followed by Evidence JSON lines. `npm run --silent teammem:export` writes pure JSONL, emits all matching rows by default, and supports `--from`, `--to`, `--person`, `--project`, and `--limit`. The `--silent` flag prevents npm banners from contaminating stdout.

## Team-Memory Semantics

- SQLite is opened read-only. The adapter performs `SELECT` queries only and never creates, updates, or deletes ledger data.
- Each row maps to a new `collected` Evidence object linked to the named hypothesis.
- Evidence object identity includes the upstream `(person, source, hash)` key plus the selected context and hypothesis mapping. Provenance uses `source: "team-memory-agent"` and keeps the stable upstream key as `sourceId`; the upstream event source remains in Evidence data.
- The mapping is deliberately neutral: `polarity` is `neutral`, and the adapter does not infer support, challenge, decisions, truth, confidence, or evidence quality.
- The provided ledger path is the only external data source. The personal Obsidian vault is untouched; these commands do not read or write it.
- Time filters and ordering follow team-memory-agent's stored timestamp text. Mixed UTC offsets can differ from absolute-time ordering near a filter boundary; normalization is deferred to adapter hardening.
- `node:sqlite` is experimental in Node 24 and may print an `ExperimentalWarning` when invoked directly. The npm scripts suppress that warning for readable output; suppression does not make the API stable.

## Roadmap

What is runnable now is limited to local execution of the TypeScript reference source, CLI, and read-only evidence import described above. The tracked [roadmap](docs/ROADMAP.md) keeps separate phases for:

1. specification stabilization;
2. an Obsidian/Markdown adapter;
3. second-adapter interoperability;
4. governance and evolution;
5. real-team validation.

Each phase has entry criteria, deliverables, acceptance checks, and explicit deferrals. Proposed semantic changes start in [RFCs](rfcs/README.md); future language-neutral specification contributions start in [spec](spec/README.md).
