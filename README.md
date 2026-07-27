# Collective Cognition SDK

Collective Cognition SDK is an experimental, runtime-dependency-free TypeScript reference implementation for attributed, versioned collaborative reasoning. It models a portable `Goal → Hypothesis → Experiment → Evidence → Decision → Principle` loop without prescribing storage, UI, agent runtime, source system, or organizational beliefs.

This is a public source repository. Its source, emitted ESM build, declarations, and CLI are runnable, but it is not yet an externally distributed or production-ready package. No open-source license has been selected yet.

Phase 2 universal ingestion is implemented and final-review verified. Phase 3 is in progress: the package build contract and normative SourceRecord `0.1.0` schema are implemented, while broader cognitive schemas, final compatibility rules, licensing, security policy, and external distribution remain planned.

## Current Status

Runnable now:

- immutable identities, goals, hypotheses, experiments, evidence, decisions, and principles;
- validated lifecycle transitions with an auditable event for every successful transition;
- structural human-confirmation checks for configured consequential transitions;
- JSON serialization and a complete cognitive-loop example;
- a closed, versioned `SourceRecord` contract with canonical JSON/JSONL ingestion that clones and deeply freezes accepted external records;
- normative SourceRecord `0.1.0` prose, JSON Schema Draft 2020-12, and versioned language-neutral conformance fixtures;
- deterministic duplicate and source-revision collision classification;
- explicit, versioned one-or-more-record neutral-Evidence promotion with duplicate/collision classification, required rationale, complete provenance, immutable input snapshots, and canonical payload-hash identity;
- caller-configurable SDK ingestion limits and finite CLI input, record-count, and record-size limits;
- a composed workflow that preserves ingestion and returns a discriminated promotion success or structured failure;
- a source-neutral `collective-cognition` CLI for validate, ingest, promote, and ingest-promote operations;
- emitted ESM JavaScript, declaration files, an explicit root exports map, an installed `collective-cognition` executable contract, and audited package contents;
- package compatibility tests covering built imports, runtime exports, declarations, CLI behavior, npm tarball contents, and installation into a clean temporary consumer;
- schema, SDK, CLI, package, and clean-consumer tests over the same canonical valid and invalid conformance fixtures;
- an experimental read-only team-memory SQLite connector that emits SourceRecord JSONL;
- a small Git commit fixture connector used to prove a second source-specific module satisfies the same SourceRecord contract.

Not implemented yet:

- final stable package guarantees or external distribution;
- an approved license, final registry package name, supported-runtime policy, or security policy;
- normative schemas for cognitive objects, relationships, transitions, authorization, events, and errors;
- persistence, services, UI, synchronization, or connector ecosystem;
- Obsidian/Markdown integration;
- automatic cognition from conversations.

The team-memory connector proves that real source data can enter the neutral ingestion boundary. It is imported directly from `src/adapters/team-memory.ts`. The Git fixture connector is imported directly from `src/adapters/git-commit.ts`. Neither source-specific connector is exported from the root public API.

## Universal Architecture

The approved architecture separates collection from interpretation:

```text
any external source
  → cloned, deeply frozen SourceRecord
  → explicit, versioned promotion policy over one or more records
  → Evidence or another supported CognitiveObject
```

Canonical JSON and JSONL are the minimum no-code integration path. Reusable connectors remain planned for common systems. A team needs custom connector code only when its source cannot emit canonical records and no shared connector exists.

### System Position

Collective Cognition SDK is a semantic and governance layer used by host applications. It sits above systems that capture activity, documents, conversations, measurements, or other source material. It does not replace those systems, operate an organization-wide service, or require every participant to install the SDK directly.

```text
source systems and memory stores
  → connectors or canonical SourceRecords
  → host application using Collective Cognition SDK
  → governed cognitive objects and events
  → review interfaces, agents, reports, or knowledge projections
```

Applications, agent platforms, and organizational tools embed the SDK or invoke its CLI. Individual participants interact with those products; they need the SDK only when building or operating an integration themselves.

### Storage Ownership

The SDK defines cognitive objects, validation, transitions, provenance, and authorization boundaries. It does not own a database or silently persist application data.

A deployed host normally has two logically distinct stores:

1. a **source store**, owned by the originating system, containing captured material such as activity records, documents, messages, or measurements;
2. a **cognition store**, owned by the host application, containing governed Goals, Hypotheses, Experiments, Evidence, Decisions, Principles, and their audit events.

These stores may use separate databases, separate schemas in one database, files, or another host-selected persistence model. Keeping them logically separate is important: source material may be replayed or regenerated, while approved decisions, rationale, authority, and history are durable organizational records. A host can begin with a dedicated SQLite database and later move to PostgreSQL or another backend without changing the core model.

Persistence adapters and hosted services are planned ecosystem work, not current SDK behavior.

A `SourceRecord` accepts only the documented top-level and `source` fields. Every `extensions` key must contain a namespace separator (`:` or `.`) with non-empty sides. The interpretation keys `polarity`, `confidence`, and `authority` are also rejected directly in `context`; source-authored raw `content` may preserve fields with those names. `contentHash` is opaque caller-supplied integrity metadata, and this SDK does not verify that it is a digest or that it matches `content`.

A convenience workflow may ingest and promote in one operation, but it must preserve and expose both artifacts. Successful parsing never means that material is true, accepted evidence, or authorized for a consequential decision.

Read the [normative SourceRecord contract](spec/source-record.md), [universal ingestion design](https://github.com/xiongxhc/collective-cognition-sdk/blob/master/docs/superpowers/specs/2026-07-24-universal-ingestion-design.md), [implemented RFC](rfcs/0001-universal-source-record-ingestion.md), and [roadmap](https://github.com/xiongxhc/collective-cognition-sdk/blob/master/docs/ROADMAP.md).

## Requirements

- Node.js 24 or newer. The examples rely on Node 24 native TypeScript execution.
- `npm install` for development-only TypeScript, Node type, and schema-validation packages.
- No production dependencies.

## Package Development

The package build emits source-neutral ESM JavaScript and declarations under ignored `dist/`:

```bash
npm run build
npm run test:schema
npm run test:package
npm run pack:check
```

`npm run test:schema` compiles the SourceRecord schema in strict Draft 2020-12 mode and checks the normative fixture corpus. `npm run test:package` imports the built root, checks the exact runtime export allowlist, rejects relative `.ts` specifiers in emitted modules, runs the built CLI, audits `npm pack --dry-run` against an exact file allowlist, and installs the packed artifact into a clean temporary project to verify default TypeScript consumer settings, package-name imports, schema-subpath discovery, and the installed `collective-cognition` binary. npm operations use an isolated temporary cache.

Installed consumers can import the schema through the versioned package subpath:

```js
import sourceRecordSchema from "collective-cognition-sdk/schemas/source-record/0.1.0"
  with { type: "json" };
```

The package manifest intentionally retains `"private": true`. Removing that guard requires an approved license, final registry name, compatibility and security policies, a clean package verification result, and explicit publication approval.

## Commands

```bash
npm test
npm run build
npm run test:schema
npm run test:package
npm run pack:check
npx tsc --noEmit
npm run check
npm run example
npm run --silent example:teammem -- /path/to/team-memory-agent/ledger.db
npm run --silent teammem:export -- --db /path/to/ledger.db --limit 5
npm run --silent teammem:export -- --db /path/to/ledger.db --limit 5 --include-raw
```

Run the canonical conformance suite directly:

```bash
node --test tests/schema-conformance.test.mjs
node --test tests/conformance.test.ts
```

`npm run example` prints an attributed complete chain, a rejected unconfirmed decision approval, a successful human-confirmed approval, and the successful event count.

The migrated team-memory commands are experimental connector tools:

- `example:teammem` reads at most five ledger rows, creates SourceRecords, and explicitly promotes the non-empty record set into one Evidence object with `neutral-evidence-v1`.
- `teammem:export` writes SourceRecord JSONL and supports `--from`, `--to`, `--person`, `--project`, and `--limit`. It omits the ledger `raw` column by default; `--include-raw` is the explicit privacy-sensitive opt-in.
- `--silent` prevents npm banners from contaminating stdout.

The former experimental `--hypothesis-id` and `--context-id` export arguments were removed because export no longer creates Evidence. Use the generic CLI for source-neutral operations:

```bash
npm run --silent cc -- validate --input records.jsonl --format jsonl
npm run --silent cc -- ingest --input records.jsonl --format jsonl
npm run --silent cc -- promote --input records.jsonl --format jsonl \
  --policy neutral-evidence-v1 \
  --hypothesis-id hypothesis:delivery-risk \
  --context-id organization:team \
  --rationale "These records jointly document the delivery change." \
  --initiator-id human:owner \
  --executor-id agent:importer \
  --accountable-id human:owner \
  --promoted-at 2026-07-24T12:00:00.000Z
```

`validate` emits one item-result JSON line per input item. `ingest` emits accepted unique SourceRecords. `promote` reclassifies its direct inputs, rejects source-revision collisions, and creates one Evidence object from the accepted unique records. Its ID is a SHA-256 hash over the complete canonical validated promotion payload: records, context, hypothesis, policy identity, rationale, attribution, timestamp, and mapping output. `ingest-promote` emits one composed result whose `promotion` is a discriminated `succeeded` or `failed` result; promotion failure never conceals successful ingestion.

The generic CLI accepts `--max-input-bytes`, `--max-records`, and `--max-record-bytes`. Defaults are `10485760`, `10000`, and `1048576` respectively. File and stdin input use the same incremental bounded reader. JSONL line size is checked before parsing. Unknown SDK values pass a descriptor-based structural preflight that never invokes accessors or `toJSON`, rejects cycles, `BigInt`, and other non-JSON values per item, and enforces record size while building one isolated plain JSON snapshot. Normalization and classification use only that snapshot and never reread the original value. Proxy reflection failures become secret-safe item rejections in collect-all mode. The normalized plain frozen record is measured exactly again as defense in depth. SDK callers can configure the corresponding ingestion options. Limit breaches use `INGESTION_LIMIT_EXCEEDED`.

Promotion snapshots and freezes the validated request and contributing records before reading any policy property. Policy identity and `map` are then captured once inside a secret-safe fail-closed boundary. The mapper receives a frozen captured receiver containing that identity, so methods using `this.id` or `this.version` work without rereading mutable policy state. Mapping output is captured exactly once through own data-property descriptors inside the same boundary; accessors, unknown fields, malformed fields, and reflection failures are rejected, and all later validation, identity, and object construction use only the plain frozen mapping snapshot.

Pre-output generic CLI failures write exactly one JSON diagnostic to stderr with `code`, `message`, `details`, and `stage`, and write nothing to stdout. Parser details, arbitrary promotion-policy exceptions, input paths, and non-domain exception messages are not exposed. Rejected collect-all items remain item diagnostics because they are batch outcomes rather than top-level failures. `teammem:export` uses `{ "stage": "...", "error": { "code": "...", "message": "...", "details": {} } }` for every failure.

## Current Team-Memory Safety

- SQLite is opened read-only and queried with `SELECT` only.
- Every selected row maps to a cloned, deeply frozen SourceRecord before any interpretation.
- Ledger `raw` content is omitted by default. Callers must pass connector option `{ includeRaw: true }` or CLI flag `--include-raw` to include it.
- Promotion is a separate caller-selected operation; the built-in policy emits new `collected`, neutral Evidence linked to a caller-supplied hypothesis, every contributing SourceRecord, and a non-empty rationale.
- The connector does not infer support, challenge, truth, confidence, decisions, or evidence quality.
- The provided ledger path is the only external source.
- The personal Obsidian vault is not read or written.
- This repository does not modify the `team-memory-agent` LaunchAgent or scheduled team-vault output.
- Time filtering follows stored timestamp text; mixed offsets can differ from absolute-time ordering near a boundary.
- `node:sqlite` is experimental in Node 24 and may emit an `ExperimentalWarning`; npm scripts suppress the warning only for readable output.

## Authorization Boundary

`transitionObject` accepts an optional public `AuthorizationPolicy`; without one it uses the built-in structural evaluator. Before invoking any policy, it clones, validates, and deeply freezes the `TransitionContext`. Only exact closed `AuthorizationDecision` objects are accepted, and execution proceeds only for `{ status: "allowed" }`; policy exceptions, mutation attempts, invalid statuses, extra fields, and malformed decisions fail closed with a stable `AUTHORIZATION_DENIED` error. The default evaluator validates shape, chronology, human actor assertion, and `objectId`/`targetState`/`eventId` binding. It does not authenticate the actor, prove consent, or verify that an approval record exists.

Production callers must inject a policy backed by authenticated identity and trusted approval records. Acceptance by the default evaluator is not proof that a person actually approved a transition.

## Semantic Limits

SourceRecord `0.1.0` now has a normative language-neutral schema and fixtures. Type-specific cognitive-object `data` payloads remain permissive JSON-compatible structures; required semantic fields, broader language-neutral schemas, and stricter per-type validation remain roadmap work.

The project does not claim universal compatibility, production readiness, or broad adoption. Those claims require a stable package, independently implemented connectors, and real-team evidence.

## Roadmap

The tracked [roadmap](https://github.com/xiongxhc/collective-cognition-sdk/blob/master/docs/ROADMAP.md) separates:

1. the completed runnable core;
2. the completed universal neutral-first ingestion foundation;
3. in-progress specification and package stabilization;
4. adapter ecosystem foundations;
5. cross-connector interoperability;
6. governance and evolution;
7. real-team validation.

Semantic changes use [RFCs](rfcs/README.md). Language-neutral specification contributions start in [spec](spec/README.md).
