# Collective Cognition SDK

Collective Cognition SDK is an experimental, runtime-dependency-free TypeScript reference implementation for attributed, versioned collaborative reasoning. It models a portable `Goal → Hypothesis → Experiment → Evidence → Decision → Principle` loop without prescribing storage, UI, agent runtime, source system, or organizational beliefs.

This is a public open-source repository licensed under [Apache License 2.0](LICENSE). The current package `0.4.0` remains private and unpublished; its source, emitted ESM build, declarations, and CLI are runnable, but it is not production-ready.

Phase 2 universal ingestion is implemented and final-review verified. Phase 3 is in progress: the package build contract, Normative Stable SourceRecord `0.1.0` contract, Normative Stable Portable Cognition Contract `0.1.0`, and compatibility baselines `0.1.0` through `0.4.0` are implemented. Host Integration `0.1.0` is implemented and final-review verified. The SQLite cognition-store slice is implemented and final-review verified. Registry publication, runtime policy, security policy, maintained connectors, and production readiness remain deferred.

## Current Status

Runnable now:

- immutable identities, goals, hypotheses, experiments, evidence, decisions, and principles;
- validated lifecycle transitions with an auditable event for every successful transition;
- structural human-confirmation checks for configured consequential transitions;
- JSON serialization and a complete cognitive-loop example;
- a closed, versioned `SourceRecord` contract with canonical JSON/JSONL ingestion that clones and deeply freezes accepted external records;
- normative SourceRecord `0.1.0` prose, JSON Schema Draft 2020-12, lexical interoperability checks, and versioned language-neutral conformance fixtures;
- deterministic duplicate and source-revision collision classification;
- explicit, versioned one-or-more-record neutral-Evidence promotion with duplicate/collision classification, required rationale, complete provenance, immutable input snapshots, and canonical payload-hash identity;
- caller-configurable SDK ingestion limits and finite CLI input, record-count, and record-size limits;
- a composed workflow that preserves ingestion and returns a discriminated promotion success or structured failure;
- a source-neutral `collective-cognition` CLI for validate, ingest, promote, and ingest-promote operations;
- emitted ESM JavaScript, declaration files, an explicit root exports map, an installed `collective-cognition` executable contract, and audited package contents;
- package compatibility tests covering built imports, runtime exports, declarations, CLI behavior, npm tarball contents, and installation into a clean temporary consumer;
- Portable Cognition `0.1.0`: a closed versioned envelope for cognitive objects, events, transition contexts, authorization decisions, and domain-error projections, with schema, fixtures, runtime codecs, and a runnable round trip;
- Host Integration `0.1.0`: storage-neutral `CognitionStore` and `CognitionEventPublisher` ports, commit coordinators, observable and retryable publication failure, an in-memory reference host, conformance checks, and a runnable recovery example;
- an internal structured team-memory activity policy that produces neutral Evidence without inferring a Decision or Principle;
- an optional durable SQLite `CognitionStore` reference adapter, available only at `collective-cognition-sdk/stores/sqlite/0.1.0` and requiring an explicit separate cognition-database path;
- schema, SDK, and CLI tests over the complete canonical valid and invalid corpus, plus package and clean-consumer smoke tests for shipped fixtures, schema discovery, and the installed CLI;
- an experimental read-only team-memory SQLite connector that emits SourceRecord JSONL;
- a small Git commit fixture connector used to prove a second source-specific module satisfies the same SourceRecord contract.

Not implemented yet:

- package publication or external distribution;
- a confirmed registry package name, runtime policy, or security policy;
- stricter standalone and type-specific semantic schemas for cognitive objects, relationships, transitions, authorization, events, and errors; the Portable Cognition serialized envelope remains normative;
- services, UI, synchronization, a durable publication outbox, or connector ecosystem;
- a maintained team-memory connector and an Obsidian/Markdown adapter;
- Obsidian/Markdown integration;
- automatic cognition from conversations.

The team-memory connector proves that real source data can enter the neutral ingestion boundary. It is imported directly from `src/adapters/team-memory.ts`. The Git fixture connector is imported directly from `src/adapters/git-commit.ts`. Source-specific connectors and unexported source modules are Internal; neither connector is exported from the root public API.

## Compatibility Status

- SourceRecord `0.1.0`, Portable Cognition `0.1.0`, Host Integration `0.1.0`, and compatibility baselines `0.1.0` through `0.4.0` are **Normative Stable** contracts.
- Before `1.0.0`, the package root and generic `collective-cognition` CLI are **Supported Experimental**.
- Connectors and unexported source modules are **Internal** and create no public compatibility promise.
- The baseline locks runtime and type exports, selected package metadata, independent declaration closures and literal digests for the root, host-conformance, reference-host, and SQLite entrypoints, CLI behavior, domain error codes, policy identities, and normative artifact hashes.
- Consumers can resolve the baselines at `collective-cognition-sdk/compatibility/0.1.0`, `collective-cognition-sdk/compatibility/0.2.0`, `collective-cognition-sdk/compatibility/0.3.0`, and `collective-cognition-sdk/compatibility/0.4.0`.
- Compatibility tests detect exact baseline drift and declared process consequences; they do not automatically determine semantic compatibility.
- Package `0.3.0` is classified as a `minor-before-1.0` breaking correction: the Host Integration additions are optional, while `PortableDomainError.code` is narrowed from package `0.2.0`'s package-wide `DomainErrorCode` to the immutable Portable Cognition `0.1.0` allowlist under `COMP-012`.
- Package `0.4.0` is an additive minor release before `1.0`: it adds the optional SQLite subpath and its compatibility baseline without changing root exports or the generic CLI contract.

Read the [compatibility policy](spec/compatibility.md) and [RFC 0002](rfcs/0002-compatibility-versioning-and-deprecation.md). npm publication, registry confirmation, runtime and security policy, broader schemas, and production readiness remain open. The manifest retains `"private": true`, and the package is unpublished.

## Universal Architecture

The approved architecture separates collection from interpretation:

```text
source connector → SourceRecord → explicit promotion → Portable Cognition
                                                ↓
                                      host CognitionStore
                                                ↓
                                  CognitionEventPublisher
```

Canonical JSON and JSONL are the minimum no-code integration path. Reusable connectors remain planned for common systems. A team needs custom connector code only when its source cannot emit canonical records and no shared connector exists. `team-memory-agent` will implement or compose the host ports later when it promotes material into shared cognition; individual memory collectors need the cognition host only when they make that promotion.

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

The SDK supplies the host-port contract, an in-memory reference implementation, and an optional Node-specific SQLite `CognitionStore` reference adapter. A host chooses and owns its `CognitionStore` and `CognitionEventPublisher`; a publication failure is observable as `committed_but_unpublished` and retryable with the exact same transition request. The example's identical retry succeeds, but the contract does not guarantee that every retry will succeed. Hosted services and durable publication remain planned ecosystem work.

A `SourceRecord` accepts only the documented top-level and `source` fields. Every `extensions` key must contain a namespace separator (`:` or `.`) with non-empty sides. The interpretation keys `polarity`, `confidence`, and `authority` are also rejected directly in `context`; source-authored raw `content` may preserve fields with those names. The complete record is limited to 256 nested JSON containers, counting the root object as depth 1, so every SDK and CLI entry point rejects deeper values with `INVALID_SOURCE_RECORD` before recursive processing. `contentHash` is opaque caller-supplied integrity metadata, and this SDK does not verify that it is a digest or that it matches `content`.

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
npm run test:compatibility
npm run test:package
npm run pack:check
```

`npm run test:schema` compiles both the SourceRecord and Portable Cognition schemas in strict Draft 2020-12 mode and checks both normative fixture corpora. `npm run pack:check` and npm prepack inherit this combined schema gate. `npm run test:compatibility` checks the compatibility baseline’s exact inventories, independent public declaration closures and digests, policy identities, CLI contract, and declared additive and breaking change cases; it does not decide semantic compatibility automatically. `npm run test:package` imports the built root, checks the exact runtime export allowlist, rejects relative `.ts` specifiers in emitted modules, proves the public-import host example builds from a checkout with no `dist/`, runs the built CLI, audits `npm pack --dry-run` against an exact file allowlist, and installs the packed artifact into a clean temporary project to verify default TypeScript consumer settings, package-name imports, schema-subpath discovery, compatibility-baseline resolution, the package `0.3.0` error-code narrowing migration, the package `0.4.0` SQLite subpath, and the installed `collective-cognition` binary. npm operations use an isolated temporary cache.

Installed consumers can import the schema through the versioned package subpath:

```js
import sourceRecordSchema from "collective-cognition-sdk/schemas/source-record/0.1.0"
  with { type: "json" };
```

Consumers can resolve the versioned compatibility baseline through:

```js
import compatibilityBaseline from "collective-cognition-sdk/compatibility/0.4.0"
  with { type: "json" };
```

Package `0.2.0` allowed a package-wide `DomainErrorCode` value to be assigned directly to `PortableDomainError.code`. Package `0.3.0` requires callers to narrow first because Portable Cognition `0.1.0` deliberately excludes host-only and future package errors. Use a type guard returning `code is PortableDomainError["code"]`; [RFC 0004](rfcs/0004-host-integration-contract.md#portable-domain-error-migration) contains the complete migration example.

The private package also exposes the Portable Cognition runtime and versioned artifacts for local or packed consumers:

```ts
import {
  createPortableCognitionRecord,
  deserializePortableCognitionRecord,
  serializePortableCognitionRecord,
} from "collective-cognition-sdk";
```

Run [`examples/portable-cognition.ts`](examples/portable-cognition.ts) for one complete cognitive-object round trip. Its schema and fixtures are available at `collective-cognition-sdk/schemas/portable-cognition/0.1.0` and `collective-cognition-sdk/conformance/portable-cognition/0.1.0/cognitive-loop`.

Host applications import the coordinators from the package root and the in-memory reference host from `collective-cognition-sdk/reference-host/0.1.0`. Run [`examples/host-integration.ts`](examples/host-integration.ts) to create an object, persist a transition, observe its first publication fail, and show the identical retry succeed without generating a new event ID.

The optional SQLite reference adapter is not exported from the root. Import it from `collective-cognition-sdk/stores/sqlite/0.1.0` and provide an absolute cognition-database path. It creates a missing target only when `createIfMissing: true`, rejects unmarked or source-ledger databases without mutation, stores canonical Portable Cognition records and audit events atomically, and provides no durable event-publication outbox.

### SQLite Verification

On the supported bundled Node.js `v24.14.0` runtime, the focused SQLite,
activity-policy, and durable-workflow command passes `59` of `60` tests; the
sole skip is the expected unsupported-runtime defensive-mode probe. `npm test`
passes `309` of `310` source tests with that same expected skip, plus `10`
schema, `15` compatibility, and `8` package tests. `npx tsc --noEmit`,
`npm run check`, `npm run example`, `npm run example:portable`,
`npm run example:host`, `npm run pack:check`, and `git diff --check` also pass.

The recorded manual real-ledger acceptance used an explicitly supplied
team-memory ledger and a separate temporary cognition database. It persisted a
Hypothesis at version `2` in state `under_review`, one neutral Evidence from
`12` source records, and one event; it inferred `0` Decisions and completed
close/reopen verification. The source ledger's byte size and nanosecond
modification time remained unchanged. The SQLite slice is implemented and
final-review verified; this evidence is not a production-readiness claim.

The package manifest intentionally retains `"private": true` as an npm publication guard. The package is unpublished. Removing the guard still requires registry confirmation, runtime and security policies, final verification, and explicit publication approval.

## License, Attribution, and Citation

Collective Cognition SDK is licensed under [Apache License 2.0](LICENSE). Distributions and derivative works must preserve the license and applicable attribution notices, including the project [`NOTICE`](NOTICE), as required by the license.

If the SDK supports research, documentation, or another public work, please credit Collective Cognition SDK and link to this repository. Machine-readable citation metadata is available in [`CITATION.cff`](CITATION.cff); GitHub exposes it through the repository's **Cite this repository** action.

## Commands

```bash
npm test
npm run build
npm run test:schema
npm run test:compatibility
npm run test:package
npm run pack:check
npx tsc --noEmit
npm run check
npm run example
npm run example:portable
npm run example:host
npm run --silent example:teammem -- /path/to/team-memory-agent/ledger.db
npm run --silent example:teammem:durable -- \
  --ledger /absolute/path/to/team-memory-agent/ledger.db \
  --cognition-db /absolute/path/to/cognition.db \
  --project unified-portal \
  --from 2026-07-28T17:59:00+08:00 \
  --limit 12 \
  --create
npm run --silent example:teammem:durable -- --help
npm run --silent teammem:export -- --db /path/to/ledger.db --limit 5
npm run --silent teammem:export -- --db /path/to/ledger.db --limit 5 --include-raw
```

Run the canonical conformance suite directly:

```bash
npm run test:schema
node --test tests/conformance.test.ts
node --disable-warning=ExperimentalWarning --test tests/portable-cognition-conformance.test.ts
```

`npm run example` prints an attributed complete chain, a rejected unconfirmed decision approval, a successful human-confirmed approval, and the successful event count.

`npm run example:portable` creates one cognitive-object record, serializes and deserializes its Portable Cognition `0.1.0` envelope, and prints that one restored envelope to stdout.

`npm run example:host` prints one JSON outcome showing an initial commit, `committed_but_unpublished` after the first publication attempt, and this example's identical retry returning `committed`, with object version `2`, one stored event, and one published event. The contract makes publication failure retryable but does not guarantee that every retry succeeds.

The migrated team-memory commands are experimental connector tools:

- `example:teammem` reads at most five ledger rows, creates SourceRecords, and explicitly promotes the non-empty record set with the internal `teamMemoryActivityEvidencePolicyV1`. The policy accepts exactly `message`, `commit`, and `mr`, emits stable neutral counts in that order, parses explicit status prefixes only for merge requests, and rejects `journal-highlight` and every other kind.
- `example:teammem:durable` requires explicit, distinct absolute source-ledger and cognition-database paths. It reads the source ledger only, creates a real Hypothesis and structured neutral Evidence, persists one valid Hypothesis transition and audit event in the separate cognition database, then closes and reopens that database to verify durable records. It infers no Decisions or Principles.
- `teammem:export` writes SourceRecord JSONL and supports `--from`, `--to`, `--person`, `--project`, and `--limit`. It omits the ledger `raw` column by default; `--include-raw` is the explicit privacy-sensitive opt-in.
- `--silent` prevents npm banners from contaminating stdout.

The durable command shown above creates a new cognition database. To verify a later reopen, rerun the same complete flag set without `--create`; `--help` prints the supported closed interface and the same reopen rule.

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

`validate` emits one item-result JSON line per input item. `ingest` emits accepted unique SourceRecords. `promote` reclassifies its direct inputs, rejects source-revision collisions, and creates one Evidence object from the accepted unique records. Its ID is a SHA-256 hash over the complete canonical validated promotion payload: records, context, hypothesis, policy identity, rationale, attribution, timestamp, and mapping output. `ingest-promote` emits one composed result whose `promotion` is a discriminated `succeeded` or `failed` result; promotion failure never conceals successful ingestion. SDK consumers can inspect `SOURCE_RECORD_MAX_JSON_DEPTH` to discover the fixed SourceRecord depth profile.

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
- The durable SQLite adapter is a reference implementation, not a production certification. It requires a host-selected database path and does not provide encryption, network-database support, a durable outbox, authentication, or multi-process scale guarantees.

## Authorization Boundary

`transitionObject` accepts an optional public `AuthorizationPolicy`; without one it uses the built-in structural evaluator. Before invoking any policy, it clones, validates, and deeply freezes the `TransitionContext`. Only exact closed `AuthorizationDecision` objects are accepted, and execution proceeds only for `{ status: "allowed" }`; policy exceptions, mutation attempts, invalid statuses, extra fields, and malformed decisions fail closed with a stable `AUTHORIZATION_DENIED` error. The default evaluator validates shape, chronology, human actor assertion, and `objectId`/`targetState`/`eventId` binding. It does not authenticate the actor, prove consent, or verify that an approval record exists.

Production callers must inject a policy backed by authenticated identity and trusted approval records. Acceptance by the default evaluator is not proof that a person actually approved a transition.

## Semantic Limits

SourceRecord `0.1.0` and Portable Cognition `0.1.0` have normative language-neutral schemas and fixtures. Portable Cognition provides an exchange record only: it neither persists nor publishes a record, and it does not authenticate a confirmation or execute authorization policy. Host Integration `0.1.0` defines the separate host-owned persistence and publication boundary without selecting a mandatory database or delivery system. The optional SQLite adapter is one Node-specific reference implementation of that store port; it does not make SQLite normative or alter the source-neutral root API. Its domain-error shape has no dedicated stack, cause, exception-name, or path fields, and runtime boundary failures do not automatically project caught exceptions; `message` and `details` are caller supplied, so hosts must filter secrets, paths, and operational details before creating records. Type-specific cognitive-object `data` payloads remain permissive JSON-compatible structures; stricter per-type semantics, additional adapters, runtime policy, and security policy remain deferred.

The project does not claim universal compatibility, production readiness, or broad adoption. Those claims require a stable package, independently implemented connectors, and real-team evidence.

## Roadmap

The tracked [roadmap](https://github.com/xiongxhc/collective-cognition-sdk/blob/master/docs/ROADMAP.md) separates:

1. the completed runnable core;
2. the completed universal neutral-first ingestion foundation;
3. in-progress specification and package stabilization, with Portable Cognition and Host Integration implemented and final-review verified;
4. adapter ecosystem foundations;
5. cross-connector interoperability;
6. operational governance and retirement tooling;
7. real-team validation.

Semantic changes use [RFCs](rfcs/README.md). Language-neutral specification contributions start in [spec](spec/README.md).
