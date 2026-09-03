# Capabilities

This page records what the private, unpublished `0.11.0` package can run today
and what it deliberately does not provide. The [public API
reference](public-api.md) names the supported imports and executables. The
[roadmap](ROADMAP.md) records phase status and verification evidence.

## Runnable now

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
- Collective Cognition Charter `1.0.0`: a language-neutral rule inventory for seven cognitive object families, relationships, lifecycle, events, authorization boundaries, and stable errors, with every `CCC-001` through `CCC-025` rule mapped to evidence;
- exact standalone cognitive-object and cognition-event schema projections `0.1.0`, versioned valid/invalid/lifecycle fixtures, linked conformance, and seven root validator/deserializer exports that delegate to Portable Cognition `0.1.0`;
- Host Integration `0.1.0`: storage-neutral `CognitionStore` and `CognitionEventPublisher` ports, commit coordinators, observable and retryable publication failure, an in-memory reference host, conformance checks, and a runnable recovery example;
- Runtime and Security Profile `0.1.0`: normative prose, a machine-readable JSON inventory at `collective-cognition-sdk/runtime-security/0.1.0`, four explicit enforcement classes, and a host checklist for authentication, encryption, tenant or workspace isolation, and durable publication recovery;
- a [checked public API reference](public-api.md) that enumerates every baseline-recorded root export, package subpath, and executable with its stability class;
- Distribution Readiness Profile `0.1.0`: normative prose and descriptive JSON at `collective-cognition-sdk/distribution-readiness/0.1.0`, reporting public source as available, the immutable historical `v0.6.0` GitHub prerelease as available, npm as blocked, and production use as not claimed;
- source-neutral connector conformance at `collective-cognition-sdk/connector-conformance/0.1.0`;
- two maintained connectors: the structurally compatible team-memory connector at `collective-cognition-sdk/connectors/team-memory/0.1.0` and the explicit local Git repository connector at `collective-cognition-sdk/connectors/git/0.1.0`;
- the dedicated `collective-cognition-teammem` export CLI, with generic validation and promotion left to the root CLI or APIs;
- an internal structured team-memory activity policy that produces neutral Evidence without inferring a Decision or Principle;
- an optional durable SQLite `CognitionStore` reference adapter, available only at `collective-cognition-sdk/stores/sqlite/0.1.0` and requiring an explicit separate cognition-database path;
- source-neutral Durable Cognition Workflow `0.1.0` at `collective-cognition-sdk/workflows/durable/0.1.0`, with preparation before host invocation, one atomic workflow commit, exact replay, and separate publication and projection outcomes;
- the SQLite workflow store at `collective-cognition-sdk/stores/sqlite-workflow/0.1.0`, requiring a new explicit schema-version-`2` cognition database, plus the installed `collective-cognition-workflow` executable;
- schema, SDK, and CLI tests over the complete canonical valid and invalid corpus, plus package and clean-consumer smoke tests for shipped fixtures, schema discovery, and the installed CLI;
- a read-only maintained team-memory-compatible SQLite connector that emits SourceRecord JSONL;
- Cross-Connector Interoperability Profile `0.1.0`, owned by `collective-cognition-sdk-maintainers`, with versioned language-neutral fixtures and an owned temporary-source reference exchange proving both maintained connectors enter one generic ingestion path;
- a deterministic, read-only Markdown cognition projection with canonical machine
  records, explicit target initialization, marker/manifest ownership,
  write-if-changed behavior, conflict detection, opt-in safe pruning, a closed
  installed CLI, package subpath, compatibility baseline, clean-consumer
  verification, a temporary-directory runnable example, and clean independent
  whole-branch review.

## Not implemented yet

- npm package publication, registry-name confirmation, or removal of the private package guard;
- a confirmed registry package name or runtime policy engine;
- future contract versions for semantics not expressible by the exact `0.1.0` standalone projections; existing Portable Cognition `0.1.0` bytes and meaning remain immutable;
- services, UI, synchronization, a durable publication outbox, connector registry, or network-connector ecosystem;
- connector credential policy;
- automated vault synchronization, Git automation, or an Obsidian-specific integration;
- automatic cognition from conversations;
- workflow scheduling, automatic connector execution, authentication, or encryption;
- plugin discovery or runtime, remote or network Git access, and connector scheduling.
