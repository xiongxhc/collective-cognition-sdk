# Collective Cognition SDK

> The source-neutral core integrates through portable contracts. Optional
> connectors and adapters operate only on explicitly supplied sources or
> managed Markdown targets; they never discover another system's internals.

Collective Cognition SDK is an experimental, runtime-dependency-free TypeScript reference implementation for attributed, versioned collaborative reasoning. It models a portable `Goal → Hypothesis → Experiment → Evidence → Decision → Principle` loop without prescribing storage, UI, agent runtime, source system, or organizational beliefs.

This is a public open-source repository licensed under [Apache License 2.0](LICENSE). The current package `0.9.0` remains private and unpublished on npm; its source, emitted ESM build, declarations, and CLIs are runnable, but production use is not claimed. The [checked public API reference](docs/public-api.md) describes the supported surface. Distribution Readiness Profile `0.1.0` remains the immutable package-`0.8.0` assessment and does not authorize publication of `0.9.0`. The experimental [`v0.6.0` GitHub prerelease](https://github.com/xiongxhc/collective-cognition-sdk/releases/tag/v0.6.0) remains the first and only observed public package artifact.

Phase 2 universal ingestion is implemented and final-review verified. Phase 3 package and specification work remains open beyond its completed contract slices. Phase 4's Durable Cognition Workflow `0.1.0` implementation and acceptance are complete, but final review is pending; the slice includes an atomic SQLite workflow store, closed CLI, guide, RFC, and compatibility baseline `0.9.0`. Phase 5 remains pending until at least two independently useful connectors pass their own contract tests and a real exchange workflow has a named owner. Publication and production-readiness work remain open.

Supported Experimental workflow execution requires Node.js `>=24.14.0` and
`DatabaseSync.prototype.enableDefensive`. Node.js `24.9.0` remains a
package/core compatibility lane with honest workflow and SQLite capability
skips; it is not a full workflow runtime. The root package engine remains
Node.js `>=24`.

Historical Markdown adapter verification used bundled Node.js `24.14.0`: the full matrix
passed `444` tests with `1` expected skip (`406` source passes and `1` source
skip, `10` schema, `19` compatibility, and `9` package), the focused version
boundary passed `41/41`, and two fresh temporary team-vault acceptance runs
passed. Typecheck, syntax checks, all examples, `pack:check`, and diff hygiene
were clean. Acceptance used temporary vaults only and did not mutate a live
vault.

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
- Runtime and Security Profile `0.1.0`: normative prose, a machine-readable JSON inventory at `collective-cognition-sdk/runtime-security/0.1.0`, four explicit enforcement classes, and a host checklist for authentication, encryption, tenant or workspace isolation, and durable publication recovery;
- a [checked public API reference](docs/public-api.md) that enumerates every baseline-recorded root export, package subpath, and executable with its stability class;
- Distribution Readiness Profile `0.1.0`: normative prose and descriptive JSON at `collective-cognition-sdk/distribution-readiness/0.1.0`, reporting public source as available, the immutable historical `v0.6.0` GitHub prerelease as available, npm as blocked, and production use as not claimed;
- source-neutral connector conformance at `collective-cognition-sdk/connector-conformance/0.1.0`;
- one maintained compatible connector for structurally compatible `teammem-event-ledger/1` databases at `collective-cognition-sdk/connectors/team-memory/0.1.0`;
- the dedicated `collective-cognition-teammem` export CLI, with generic validation and promotion left to the root CLI or APIs;
- an internal structured team-memory activity policy that produces neutral Evidence without inferring a Decision or Principle;
- an optional durable SQLite `CognitionStore` reference adapter, available only at `collective-cognition-sdk/stores/sqlite/0.1.0` and requiring an explicit separate cognition-database path;
- source-neutral Durable Cognition Workflow `0.1.0` at `collective-cognition-sdk/workflows/durable/0.1.0`, with preparation before host invocation, one atomic workflow commit, exact replay, and separate publication and projection outcomes;
- the SQLite workflow store at `collective-cognition-sdk/stores/sqlite-workflow/0.1.0`, requiring a new explicit schema-version-`2` cognition database, plus the installed `collective-cognition-workflow` executable;
- schema, SDK, and CLI tests over the complete canonical valid and invalid corpus, plus package and clean-consumer smoke tests for shipped fixtures, schema discovery, and the installed CLI;
- a read-only maintained team-memory-compatible SQLite connector that emits SourceRecord JSONL;
- a small Git commit fixture connector used to prove a second source-specific module satisfies the same SourceRecord contract.
- a deterministic, read-only Markdown cognition projection with canonical machine
  records, explicit target initialization, marker/manifest ownership,
  write-if-changed behavior, conflict detection, opt-in safe pruning, a closed
  installed CLI, package subpath, compatibility baseline, clean-consumer
  verification, a temporary-directory runnable example, and clean independent
  whole-branch review.

Not implemented yet:

- npm package publication, registry-name confirmation, or removal of the private package guard;
- a confirmed registry package name or runtime policy engine;
- stricter standalone and type-specific semantic schemas for cognitive objects, relationships, transitions, authorization, events, and errors; the Portable Cognition serialized envelope remains normative;
- services, UI, synchronization, a durable publication outbox, connector registry, or network-connector ecosystem;
- connector credential policy;
- automated vault synchronization, Git automation, or an Obsidian-specific
  integration;
- automatic cognition from conversations.
- workflow scheduling, automatic connector execution, authentication, encryption, or a durable publication outbox.
- a second independently useful connector with its own contract tests, or a named owner for a real cross-connector exchange workflow.

`SourceRecord` is the universal boundary. Team-memory is one maintained compatible connector, not SDK root behavior. External connectors may live in separate repositories and packages, importing only the root SDK and optional source-neutral conformance subpath. Read the [connector author guide](docs/connector-author-guide.md) and [RFC 0006: Maintained Source Connectors](rfcs/0006-maintained-source-connectors.md).

## Compatibility Status

- SourceRecord `0.1.0`, Portable Cognition `0.1.0`, Host Integration `0.1.0`, Runtime and Security Profile `0.1.0`, Distribution Readiness Profile `0.1.0`, and compatibility baselines `0.1.0` through `0.9.0` are **Normative Stable** contracts.
- Before `1.0.0`, the package root, installed CLIs, and declared non-normative package subpaths are **Supported Experimental**.
- Unexported connector modules and repository-only examples remain **Internal** and create no public compatibility promise.
- The baseline locks runtime and type exports, selected package metadata, independent declaration closures and literal digests for public TypeScript entrypoints, CLI behavior, domain error codes, policy identities, and normative artifact hashes.
- Consumers can resolve the baselines at `collective-cognition-sdk/compatibility/0.1.0` through `collective-cognition-sdk/compatibility/0.9.0`.
- Compatibility tests detect exact baseline drift and declared process consequences; they do not automatically determine semantic compatibility.
- Package `0.3.0` is classified as a `minor-before-1.0` breaking correction: the Host Integration additions are optional, while `PortableDomainError.code` is narrowed from package `0.2.0`'s package-wide `DomainErrorCode` to the immutable Portable Cognition `0.1.0` allowlist under `COMP-012`.
- Package `0.4.0` is an additive minor release before `1.0`: it adds the optional SQLite subpath and its compatibility baseline without changing root exports or the generic CLI contract.
- Package `0.5.0` is an additive minor release before `1.0`: it adds source-neutral connector conformance, one maintained connector subpath, and a dedicated executable while preserving the root API and generic CLI.
- Private package `0.6.0` is an additive minor release before `1.0`: it adds the
  Supported Experimental `adapters/markdown/0.1.0` subpath and
  `collective-cognition-markdown` executable without changing root exports,
  existing CLIs, or prior Normative Stable contracts.
- Historical private package `0.7.0` is an additive minor release before `1.0`: it adds the Normative Stable `collective-cognition-sdk/runtime-security/0.1.0` JSON profile without changing root exports, existing CLIs, historical `v0.6.0` records, or prior Normative Stable contracts.
- Historical private package `0.8.0` is additive before `1.0`: it adds the Normative Stable `collective-cognition-sdk/distribution-readiness/0.1.0` JSON profile, checked public API documentation, RFC 0009, and baseline `0.8.0` without changing root runtime or type exports, executable behavior, or historical artifacts.
- Current private package `0.9.0` is additive before `1.0`: it adds the Supported Experimental durable workflow and SQLite workflow-store subpaths, installed workflow executable, RFC 0010, guide, and baseline `0.9.0` while preserving root runtime and type export names and all historical package entrypoints.

Read the [public API reference](docs/public-api.md), [compatibility policy](spec/compatibility.md), [Distribution Readiness Profile](spec/distribution-readiness.md), [RFC 0002](rfcs/0002-compatibility-versioning-and-deprecation.md), and [RFC 0009](rfcs/0009-public-api-and-distribution-readiness.md). npm publication, registry confirmation, a runtime policy engine, broader schemas, and production readiness remain open. The manifest retains `"private": true`, and the package is unpublished.

Conformance is not certification, does not imply endorsement, and is not an LTS commitment.

## Runtime and Security Profile

Adopters can import the Runtime and Security Profile `0.1.0` as descriptive JSON:

```js
import runtimeSecurityProfile from "collective-cognition-sdk/runtime-security/0.1.0"
  with { type: "json" };
```

The JSON tells a host what remains unimplemented; importing it does not enforce host-required controls.

- `sdk-enforced` means the reference SDK rejects or constrains unsafe behavior.
- `conformance-verified` means repository checks verify a documented property without turning it into a universal runtime guarantee.
- `host-required` means the production host must implement and verify the control itself.
- `out-of-scope` means the SDK explicitly makes no claim or guarantee.

See the [normative Runtime and Security Profile `0.1.0`](spec/runtime-security.md), [RFC 0008](rfcs/0008-runtime-security-profile.md), and the [host-required controls checklist](spec/runtime-security.md#host-required-controls). That checklist covers authentication, encryption, tenant or workspace isolation, durable publication recovery, and related host-owned controls. Conformance is not certification, and the profile does not certify a deployment as secure.

## Public API and Distribution Readiness

Use the [checked public API reference](docs/public-api.md) rather than repository source paths to identify supported imports and executables. The [normative Distribution Readiness Profile `0.1.0`](spec/distribution-readiness.md) and its [machine-readable JSON](spec/distribution-readiness/0.1.0/profile.json) report the historical private package `0.8.0` with overall status `blocked`. Package `0.9.0` does not upgrade any channel:

- public source is `available`;
- the GitHub prerelease channel is `available` only for immutable historical `v0.6.0`;
- the npm registry channel is `blocked`; and
- production use is `not-claimed`.

Import the descriptive JSON from `collective-cognition-sdk/distribution-readiness/0.1.0`. Reading it does not publish the package, authenticate a registry, certify a deployment, or replace explicit accountable-human approval. See [RFC 0009: Public API and Distribution Readiness](rfcs/0009-public-api-and-distribution-readiness.md).

## Universal Architecture

The approved architecture separates collection from interpretation:

```text
explicit source
  → maintained or external connector
  → SourceRecord
  → generic ingestion
  → explicit caller-selected promotion
  → Portable Cognition
  → host-selected CognitionStore and CognitionEventPublisher
```

Collection does not imply interpretation, promotion, or persistence. Canonical JSON and JSONL remain the minimum no-code integration path. A source connector does not choose whether material becomes Evidence, what it means, or where cognition is stored.

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

### Durable Cognition Workflow

Private package `0.9.0` adds a source-neutral, explicit durable workflow:

```text
connector or canonical JSONL
  -> explicit durable workflow request
  -> atomic cognition database
  -> optional event publisher
  -> optional managed Markdown projection
```

Import the workflow from
`collective-cognition-sdk/workflows/durable/0.1.0`. The Node-specific
`SqliteCognitionWorkflowStore` is separate at
`collective-cognition-sdk/stores/sqlite-workflow/0.1.0` and requires a new,
explicitly selected SQLite schema-version-`2` cognition database. It never
upgrades an existing version-`1` database.

The installed `collective-cognition-workflow` CLI has one closed `run` command,
supports canonical JSON or JSONL and the built-in `neutral-evidence-v1`
policy, and has no publisher. It may project into an already initialized
managed Markdown target after persistence. Markdown is not authoritative
storage.

Read the [Durable Cognition Workflow Guide](docs/durable-cognition-workflow-guide.md)
and [RFC 0010](rfcs/0010-durable-cognition-workflow.md). This slice supplies no
scheduler, automatic cognition, Obsidian discovery, authentication,
encryption, durable outbox, npm publication, or production certification.
Production use is not claimed.

### Markdown Cognition Projection

The Markdown adapter is a projection, not a persistence backend. A host keeps
SQLite or another explicitly selected `CognitionStore` authoritative, then
chooses whether to render selected validated Portable Cognition records into a
separately initialized, dedicated directory. It neither discovers a
vault/repository nor binds to Obsidian, Git, a home directory, a source ledger,
or a cognition database.

```text
host-selected CognitionStore
  → selected Portable Cognition records
  → explicitly initialized managed Markdown target
  → optional editor or Git workflow owned by the host
```

The target contains a marker, complete-digest manifest, `Index.md`, and stable
SHA-256/revision paths. The adapter preserves unchanged bytes, fails rather
than overwriting a manually changed managed file, and removes stale files only
with explicit `pruneManaged`/`--prune-managed`. It writes no files outside the
target. Verification inspects only the marker, manifest, and manifest-owned
files. Unrelated unmanifested entries remain operator-owned and untouched;
mismatching collisions or unsafe substitutions at a managed or desired path
fail closed. Exact desired bytes may be adopted only as idempotent recovery.
Relationship notes link through stable object-identity anchors in `Index.md`;
the index advances each anchor to the highest projected revision without
rewriting historical notes.
See the [Markdown cognition adapter guide](docs/markdown-cognition-adapter-guide.md) and [RFC 0007](rfcs/0007-markdown-cognition-adapter.md).

The source checkout interface is:

```ts
import {
  initializeMarkdownCognitionTarget,
  projectMarkdownCognition,
  verifyMarkdownCognitionTarget,
} from "./src/markdown-cognition.ts";

await initializeMarkdownCognitionTarget({
  targetDirectory: "/workspace/demo-team-vault/Collective Cognition",
});
await projectMarkdownCognition({
  targetDirectory: "/workspace/demo-team-vault/Collective Cognition",
  records,
});
```

Installed consumers import
`collective-cognition-sdk/adapters/markdown/0.1.0` from private package
`0.6.0`. The source command is
`node --disable-warning=ExperimentalWarning src/markdown-cognition-cli.ts`;
the packed consumer installs the equivalent `collective-cognition-markdown`
executable.

The first profile limits a projection to 10,000 records, 128 MiB total managed
content, 10,001 manifest entries, four path segments, 512-byte relative paths,
1 MiB per rendered note or parsed Markdown record, and object or event target
versions from 1 through 99,999,999 so every revision path remains exactly eight
digits. The dedicated CLI also limits the complete JSONL input stream to
1 MiB. It assumes a stable target and ancestors: static links, hard links,
unexpected entry types, forged manifest ownership, and detectable
substitutions at marker, manifest, managed, or desired paths fail closed.
Unmanifested unrelated entries are not recursively inspected. Concurrent
same-privilege final-window swap-back mutation awaits a future
descriptor-relative backend.

A `SourceRecord` accepts only the documented top-level and `source` fields. Every `extensions` key must contain a namespace separator (`:` or `.`) with non-empty sides. The interpretation keys `polarity`, `confidence`, and `authority` are also rejected directly in `context`; source-authored raw `content` may preserve fields with those names. The complete record is limited to 256 nested JSON containers, counting the root object as depth 1, so every SDK and CLI entry point rejects deeper values with `INVALID_SOURCE_RECORD` before recursive processing. `contentHash` is opaque caller-supplied integrity metadata, and this SDK does not verify that it is a digest or that it matches `content`.

A convenience workflow may ingest and promote in one operation, but it must preserve and expose both artifacts. Successful parsing never means that material is true, accepted evidence, or authorized for a consequential decision.

Read the [normative SourceRecord contract](spec/source-record.md), [universal ingestion design](https://github.com/xiongxhc/collective-cognition-sdk/blob/main/docs/superpowers/specs/2026-07-24-universal-ingestion-design.md), [implemented RFC](rfcs/0001-universal-source-record-ingestion.md), and [roadmap](https://github.com/xiongxhc/collective-cognition-sdk/blob/main/docs/ROADMAP.md).

### Maintained Team-Memory-Compatible Connector

The maintained connector is isolated below
`collective-cognition-sdk/connectors/team-memory/0.1.0`. It accepts any
explicitly supplied SQLite database with this structural
`teammem-event-ledger/1` table:

```sql
CREATE TABLE events (
  id      INTEGER PRIMARY KEY,
  person  TEXT NOT NULL,
  project TEXT,
  ts      TEXT NOT NULL,
  source  TEXT NOT NULL,
  kind    TEXT NOT NULL,
  summary TEXT NOT NULL,
  refs    TEXT,
  raw     TEXT,
  hash    TEXT NOT NULL,
  UNIQUE(person, source, hash)
);
```

Additional tables and columns are ignored. The connector does not require
`team-memory-agent`; compatibility is structural rather than tied to one
producer repository or deployment.

`sourceInstance` is public, non-secret identity for one logical ledger. Use a
stable value that contains no credentials, tokens, private paths, or sensitive
tenant labels. It prevents identical `(person, source, hash)` tuples from
different compatible ledgers from colliding.

The connector omits `raw` by default. `--include-raw` is an explicit
privacy-sensitive opt-in that authorizes inclusion in output for that
invocation only; it does not authorize promotion, persistence, logging, or
further disclosure.

Import the two public surfaces separately:

```ts
import {
  createSourceRecord,
} from "collective-cognition-sdk";
import {
  runSourceConnectorConformance,
} from "collective-cognition-sdk/connector-conformance/0.1.0";
import {
  readTeamMemorySourceRecords,
} from "collective-cognition-sdk/connectors/team-memory/0.1.0";
```

## Requirements

- Node.js 24 or newer. The examples rely on Node 24 native TypeScript execution.
- `npm install` for development-only TypeScript, Node type, and schema-validation packages.
- No production dependencies.

## GitHub Prerelease

The repository provides an experimental
[`v0.6.0` GitHub prerelease](https://github.com/xiongxhc/collective-cognition-sdk/releases/tag/v0.6.0)
for the private, npm-unpublished `0.6.0` package. Confirm that the release is
still listed as a prerelease and is not GitHub's latest release before using
the commands.

The core verification matrix runs only `npm test`, `npx tsc --noEmit`, and
`npm run check` on:

- Ubuntu with Node.js `24.9.0`;
- Ubuntu with Node.js `24.14.0`;
- macOS with Node.js `24.14.0`; and
- Windows with Node.js `24.14.0`.

The distribution verification environment is Ubuntu with Node.js `24.14.0`
only. It runs examples, durable SQLite, deterministic assets, clean tarball
installation, imports, and installed CLIs; those checks are not verified on
the other three core-matrix environments.

The tag workflow keeps checkout, dependency installation, tests, examples, and
artifact construction in a read-only job with persisted Git credentials
disabled. A separate privileged job downloads only the four verified assets;
it runs no checked-out package or dependency code before attestation and GitHub
release publication. Its GitHub CLI steps set `GH_REPO` from
`github.repository`, so the no-checkout job has explicit repository context.

The release contains exactly these assets:

- `SHA256SUMS`;
- `collective-cognition-sdk-0.6.0.cdx.json`;
- `collective-cognition-sdk-0.6.0.tgz`; and
- `release-manifest.json`.

`"private": true` blocks npm publication. It does not prevent installing a
downloaded GitHub tarball locally; npm registry publication remains forbidden.

This is the first public-artifact decision for `0.6.0`: finalize the current
docs-inclusive private tarball rather than restore the stale pre-readiness
README. Relative to the earlier private review artifact, only the packaged
README and RFC-index documentation bytes changed. The runtime, type, CLI,
schema, and RFC compatibility surface and the exact package file inventory are
unchanged; the release builder pins the final tarball SHA-256 so later byte
drift fails closed.

The root README now records post-release evidence and therefore differs from
the README embedded in the immutable `v0.6.0` tarball. CI reconstructs that
exact historical artifact only at release commit
`76f289b7f1514f4bc490d0de6dbffbb61a4c9f0e`; the pinned release builder rejects
later branch bytes. Do not treat a fresh `0.6.0` pack from a later commit as the
released artifact. Any future package artifact requires a new package version.

```bash
TAG=v0.6.0
RELEASE_DIR="$(mktemp -d)"
cd "$RELEASE_DIR"

for asset in SHA256SUMS collective-cognition-sdk-0.6.0.cdx.json collective-cognition-sdk-0.6.0.tgz release-manifest.json; do
  curl -fLO "https://github.com/xiongxhc/collective-cognition-sdk/releases/download/$TAG/$asset"
done

shasum -a 256 -c SHA256SUMS

for asset in SHA256SUMS collective-cognition-sdk-0.6.0.cdx.json collective-cognition-sdk-0.6.0.tgz release-manifest.json; do
  gh attestation verify "$asset" \
    --repo xiongxhc/collective-cognition-sdk \
    --signer-workflow xiongxhc/collective-cognition-sdk/.github/workflows/github-prerelease.yml \
    --source-ref "refs/tags/$TAG"
done

npm install --ignore-scripts --offline ./collective-cognition-sdk-0.6.0.tgz
node --input-type=module -e 'import "collective-cognition-sdk"'
./node_modules/.bin/collective-cognition --help
./node_modules/.bin/collective-cognition-teammem --help
./node_modules/.bin/collective-cognition-markdown --help
```

The release manifest records the private package state, tag, commit, trusted
Node and npm versions, and asset metadata; the CycloneDX SBOM and GitHub
attestations add distribution integrity evidence. They are not npm provenance
or production certification.
Markdown acceptance used temporary vaults only and did not accept or mutate a
live vault. SQLite remains an optional reference adapter, not a mandatory
store or certification claim. For the maintainer procedure and the evidence
that must be recorded after a release, read the
[GitHub prerelease runbook](docs/github-prerelease.md).

## Package Development

The package build emits source-neutral ESM JavaScript and declarations under ignored `dist/`:

```bash
npm run build
npm run test:schema
npm run test:compatibility
npm run test:package
npm run pack:check
```

`npm run test:schema` compiles both the SourceRecord and Portable Cognition schemas in strict Draft 2020-12 mode and checks both normative fixture corpora. `npm run pack:check` and npm prepack inherit this combined schema gate. `npm run test:compatibility` checks the compatibility baseline’s exact inventories, independent public declaration closures and digests, policy identities, CLI contracts, and declared additive and breaking change cases; it does not decide semantic compatibility automatically. `npm run test:package` imports the built root and versioned subpaths, checks exact runtime and tarball allowlists, runs the installed CLIs, and installs the packed artifact into a clean temporary project to verify runtime and TypeScript imports. npm operations use an isolated temporary cache.

Installed consumers can import the schema through the versioned package subpath:

```js
import sourceRecordSchema from "collective-cognition-sdk/schemas/source-record/0.1.0"
  with { type: "json" };
```

Consumers can resolve the versioned compatibility baseline through:

```js
import compatibilityBaseline from "collective-cognition-sdk/compatibility/0.9.0"
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

The durable workflow is also excluded from the root. Import workflow contracts
from `collective-cognition-sdk/workflows/durable/0.1.0` and the SQLite workflow
store from `collective-cognition-sdk/stores/sqlite-workflow/0.1.0`. Clean
consumers can typecheck both versioned entrypoints and execute the packed
`collective-cognition-workflow` binary. Both SQLite modules are self-contained;
the tarball contains no `sqlite-internal` JavaScript or declaration file.

### SQLite Verification

The SQLite `0.4.0` slice and maintained connector package `0.5.0` slice were
final-review verified on the supported bundled Node.js runtime. Publication
readiness remains a separate unfinished gate.

The [recorded read-only acceptance evidence](docs/acceptance/durable-cognition-workflow-0.1.0.md)
used an explicitly supplied compatible team-memory ledger and temporary writable
targets only. It persisted a Hypothesis at version `2` in state `under_review`,
one neutral Evidence from `12` source records, and one event; it inferred `0`
Decisions and `0` Principles, completed close/reopen replay, and passed Markdown
verification. Source size, modification time, change time, inode, and SHA-256
were equal before and after. No live vault was accessed. The historical SQLite
store slice is implemented and final-review verified. Durable workflow
implementation and acceptance are complete, but Task 8 final review remains
pending; this acceptance evidence is not a production-readiness claim.

The package manifest intentionally retains `"private": true` as an npm publication guard. The package is unpublished. Removing the guard still requires registry-name confirmation, completion of every mandatory distribution gate, final verification, and explicit accountable-human publication approval.

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
npm run example:markdown
npm run example:host
npm run example:workflow
collective-cognition-workflow run \
  --request /absolute/path/to/workflow-request.json \
  --input /absolute/path/to/source-records.jsonl \
  --format jsonl \
  --cognition-db /absolute/path/to/new-cognition-v2.db \
  --create-cognition-db
collective-cognition-teammem export \
  --db /absolute/path/to/compatible-ledger.db \
  --source-instance public-demo \
  --limit 5
collective-cognition-teammem export \
  --db /absolute/path/to/compatible-ledger.db \
  --source-instance public-demo \
  --limit 5 \
  --include-raw
```

Run the canonical conformance suite directly:

```bash
npm run test:schema
node --test tests/conformance.test.ts
node --disable-warning=ExperimentalWarning --test tests/portable-cognition-conformance.test.ts
```

`npm run example` prints an attributed complete chain, a rejected unconfirmed decision approval, a successful human-confirmed approval, and the successful event count.

`npm run example:portable` creates one cognitive-object record, serializes and deserializes its Portable Cognition `0.1.0` envelope, and prints that one restored envelope to stdout.

`npm run example:markdown` creates an operating-system temporary directory,
initializes its `Collective Cognition` subtree, projects one Goal and related
Hypothesis, parses a generated note, repeats the projection without updates,
verifies the target, prints one JSON summary, and removes the temporary root.
It does not access a live vault, ledger, or cognition database.

`npm run example:host` prints one JSON outcome showing an initial commit, `committed_but_unpublished` after the first publication attempt, and this example's identical retry returning `committed`, with object version `2`, one stored event, and one published event. The contract makes publication failure retryable but does not guarantee that every retry succeeds.

`npm run example:workflow` creates only temporary SourceRecord, request,
SQLite-v2, and managed Markdown targets. It commits, replays, closes, reopens,
verifies exact records, and confirms unchanged projection without accessing a
live ledger or vault. On a Node.js runtime lacking
`DatabaseSync.prototype.enableDefensive`, it exits `0`, creates no temporary
files, and prints exactly
`{"status":"skipped","reason":"unsupported_runtime"}`.

`collective-cognition-teammem export` writes canonical SourceRecord JSONL and
supports `--from`, `--to`, `--person`, `--project`, `--limit`, and
`--include-raw`. It requires `--db` and `--source-instance`; help and version
output do not open a source. Failures write one sanitized JSON diagnostic to
stderr. Failures detected before output write nothing to stdout; an operating
system pipe failure can occur after already-written bytes and cannot retract
them.

Compose export with the generic CLI explicitly:

```bash
collective-cognition-teammem export \
  --db /absolute/path/to/compatible-ledger.db \
  --source-instance public-demo \
  > records.jsonl
collective-cognition validate --input records.jsonl --format jsonl
```

Export does not create Evidence or write a cognition database.

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

Pre-output generic CLI failures write exactly one JSON diagnostic to stderr with `code`, `message`, `details`, and `stage`, and write nothing to stdout. Parser details, arbitrary promotion-policy exceptions, input paths, and non-domain exception messages are not exposed. Rejected collect-all items remain item diagnostics because they are batch outcomes rather than top-level failures. `collective-cognition-teammem` uses `{ "code": "...", "message": "...", "stage": "..." }` for every failure.

## Current Team-Memory Safety

- SQLite is opened read-only and queried with `SELECT` only.
- Every selected row maps to a cloned, deeply frozen SourceRecord before any interpretation.
- `sourceInstance` is required public non-secret identity and isolates otherwise identical revisions from different compatible ledgers.
- Ledger `raw` content is omitted by default. Callers must pass connector option `{ includeRaw: true }` or CLI flag `--include-raw` to include it.
- Collection and promotion are separate caller-selected operations; collection never persists cognition.
- The connector does not infer support, challenge, truth, confidence, decisions, or evidence quality.
- The provided ledger path is the only external source.
- The personal Obsidian vault is not read or written.
- The connector does not modify source schedulers or rendered outputs.
- Time filtering follows stored timestamp text; mixed offsets can differ from absolute-time ordering near a boundary.
- `node:sqlite` is experimental in Node 24 and may emit an `ExperimentalWarning`; npm scripts suppress the warning only for readable output.
- The durable SQLite adapter is a reference implementation, not a production certification. It requires a host-selected database path and does not provide encryption, network-database support, a durable outbox, authentication, or multi-process scale guarantees.

## Authorization Boundary

`transitionObject` accepts an optional public `AuthorizationPolicy`; without one it uses the built-in structural evaluator. Before invoking any policy, it clones, validates, and deeply freezes the `TransitionContext`. Only exact closed `AuthorizationDecision` objects are accepted, and execution proceeds only for `{ status: "allowed" }`; policy exceptions, mutation attempts, invalid statuses, extra fields, and malformed decisions fail closed with a stable `AUTHORIZATION_DENIED` error. The default evaluator validates shape, chronology, human actor assertion, and `objectId`/`targetState`/`eventId` binding. It does not authenticate the actor, prove consent, or verify that an approval record exists.

Production callers must inject a policy backed by authenticated identity and trusted approval records. Acceptance by the default evaluator is not proof that a person actually approved a transition.

## Semantic Limits

SourceRecord `0.1.0` and Portable Cognition `0.1.0` have normative language-neutral schemas and fixtures. Portable Cognition provides an exchange record only: it neither persists nor publishes a record, and it does not authenticate a confirmation or execute authorization policy. Host Integration `0.1.0` defines the separate host-owned persistence and publication boundary without selecting a mandatory database or delivery system. The optional SQLite adapters are Node-specific reference implementations; they do not make SQLite normative or alter the source-neutral root API. Durable workflow SQLite schema version `2` requires a new explicit database in this slice and provides no migration from version `1`. The workflow CLI has no publisher, and Markdown is non-authoritative. No scheduler, automatic cognition, Obsidian discovery, authentication, encryption, durable outbox, or production certification is supplied. Domain-error shapes have no dedicated stack, cause, exception-name, or path fields, and runtime boundary failures do not automatically project caught exceptions; `message` and `details` are caller supplied, so hosts must filter secrets, paths, and operational details before creating records. Type-specific cognitive-object `data` payloads remain permissive JSON-compatible structures; stricter per-type semantics, additional adapters, a runtime policy engine, and host implementation of required security controls remain deferred.

The project does not claim universal compatibility, production readiness, or broad adoption. Connector conformance is not certification, does not imply endorsement, and is not an LTS commitment. Stronger claims require a published stable package, independently implemented connectors, final verification, and real-team evidence.

## Roadmap

The tracked [roadmap](https://github.com/xiongxhc/collective-cognition-sdk/blob/main/docs/ROADMAP.md) separates:

1. the completed runnable core;
2. the completed universal neutral-first ingestion foundation;
3. in-progress specification and package stabilization, with the checked public-API and distribution-readiness documentation slice complete while broader semantic, schema, publication, and production gates remain open;
4. completed adapter ecosystem foundations, including Durable Cognition Workflow `0.1.0`;
5. pending cross-connector interoperability, blocked on two independently useful connectors and a named real exchange owner;
6. operational governance and retirement tooling;
7. real-team validation.

Semantic changes use [RFCs](rfcs/README.md). Language-neutral specification contributions start in [spec](spec/README.md).
