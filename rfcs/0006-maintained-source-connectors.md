# RFC 0006: Maintained Source Connectors

**Status:** Implemented and final-review verified
**Created:** 2026-07-29

## Problem

The SDK already defines the source-neutral `SourceRecord` boundary, but its
earlier connector examples were repository-only implementation details.
Connector authors had no reusable public conformance entrypoint, and the
team-memory SQLite reader had no installed versioned surface or source-ledger
instance identity.

Making that reader public must not make team-memory the SDK's root behavior.
Other ledgers, APIs, files, queues, and services need to remain independently
implementable without depending on one source system or moving source-specific
configuration into the package root.

This RFC is the independently readable public decision.

## Decision

`SourceRecord` remains the universal boundary. Package two additive,
versioned, Supported Experimental subpaths:

```text
collective-cognition-sdk/connector-conformance/0.1.0
collective-cognition-sdk/connectors/team-memory/0.1.0
```

The first is source-neutral and reusable by any connector author. The second
is one maintained compatible connector for the structural
`teammem-event-ledger/1` SQLite format. It has a dedicated installed command:

```text
collective-cognition-teammem
```

The package root and generic `collective-cognition` CLI remain source-neutral.
External connectors may live in separate repositories and packages. They need
only the root `SourceRecord` API and, optionally, the conformance subpath; they
do not need the maintained team-memory connector.

Package `0.5.0` remains private and unpublished. Passing conformance is not
certification, does not imply endorsement, and is not an LTS commitment.

## Architecture and Ownership

```text
explicit compatible source
  → maintained or independent connector
  → immutable SourceRecord values
  → generic ingestion
  → explicit caller-selected promotion
  → Portable Cognition
  → host-selected CognitionStore and CognitionEventPublisher
```

| Owner | Responsibility |
| --- | --- |
| SDK root | Create, validate, serialize, ingest, and explicitly promote source-neutral `SourceRecord` values. |
| Connector conformance | Check connector output shape, immutable round trips, duplicate revisions, and optional repeat determinism. |
| Maintained team-memory connector | Read one explicitly selected compatible ledger and map rows to neutral records. |
| External connector | Own source selection, authentication, pagination, retries, source-specific safety checks, diagnostics, and release policy. |
| Host | Choose interpretation, promotion policy, cognition persistence, publication, and authorization. |

No component performs implicit source discovery through this contract.
Collection does not imply interpretation, promotion, persistence, truth,
evidence polarity, a Decision, a Principle, or organizational acceptance.

## Public Interfaces

### Connector Conformance 0.1.0

```ts
export interface SourceConnectorConformanceCase {
  readonly name: string;
  readonly collect: () =>
    | readonly SourceRecord[]
    | Promise<readonly SourceRecord[]>;
  readonly collectAgain?: () =>
    | readonly SourceRecord[]
    | Promise<readonly SourceRecord[]>;
}

export type SourceConnectorConformanceDiagnosticCode =
  | "connector_exception"
  | "invalid_collection"
  | "invalid_source_record"
  | "duplicate_revision"
  | "nondeterministic_output";

export interface SourceConnectorConformanceDiagnostic {
  readonly code: SourceConnectorConformanceDiagnosticCode;
  readonly message: string;
  readonly itemIndex?: number;
}

export interface SourceConnectorConformanceResult {
  readonly name: string;
  readonly status: "passed" | "failed";
  readonly diagnostics: readonly SourceConnectorConformanceDiagnostic[];
}

export async function runSourceConnectorConformance(
  cases: readonly SourceConnectorConformanceCase[],
): Promise<readonly SourceConnectorConformanceResult[]>;
```

The runner snapshots untrusted case definitions through own enumerable
data-property descriptors before invoking connector code. It checks that
collection returns an array, every item is a valid detached and deeply frozen
`SourceRecord`, normative serialization round-trips, revision keys are unique,
and optional repeated collection is canonically deterministic. A failed case
does not abort later cases.

Returned results are deeply frozen. Connector exceptions become stable,
secret-safe diagnostics that do not include arbitrary exception messages,
paths, credentials, or source content.

The runner does not define connector discovery, registration, authentication,
credential loading, pagination, polling, webhooks, scheduling, retries,
network policy, source-specific no-mutation checks, or support tiers.

### Team-Memory-Compatible Connector 0.1.0

```ts
export const TEAM_MEMORY_LEDGER_FORMAT = "teammem-event-ledger/1";

export interface TeamMemorySourceRecordOptions {
  readonly databasePath: string;
  readonly sourceInstance: string;
  readonly from?: string;
  readonly to?: string;
  readonly person?: string;
  readonly project?: string;
  readonly limit?: number;
  readonly includeRaw?: boolean;
}

export type TeamMemoryConnectorErrorCode =
  | "invalid_options"
  | "target_unavailable"
  | "incompatible_ledger"
  | "invalid_row"
  | "read_failed";

export class TeamMemoryConnectorError extends Error {
  readonly code: TeamMemoryConnectorErrorCode;
  readonly stage: "options" | "open" | "schema" | "query" | "mapping";
  readonly details: Readonly<Record<string, string | number | boolean>>;
}

export function readTeamMemorySourceRecords(
  options: TeamMemorySourceRecordOptions,
): readonly SourceRecord[];
```

The connector accepts this structural ledger shape:

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

Additional tables and columns are allowed and ignored. The database does not
need to be created by `team-memory-agent`, and the connector has no
`team-memory-agent` package, runtime, repository, or service dependency.

The connector requires one explicit absolute database path and rejects URLs,
`:memory:`, `~`, relative paths, implicit discovery, incompatible schemas,
malformed rows, and timestamps without an explicit UTC offset. It opens
SQLite read-only, executes `SELECT` statements only, binds filters, validates
all selected rows before returning any result, and orders by timestamp and row
ID. Mixed timestamp offsets retain the ledger's lexical range semantics.

## Identity Isolation

`sourceInstance` is required public, non-secret identity for one logical
ledger. It is copied to `SourceRecord.source.instance`, must be stable, must
contain 1 through 128 Unicode scalar values, must have no control characters
or surrounding whitespace, and must not contain a credential, access token,
private path, or sensitive tenant label.

The connector mapping is:

```text
id              = collision-safe canonical identity over
                  sourceInstance/person/source/hash
source.system   = teammem-event-ledger
source.instance = caller-supplied sourceInstance
sourceId        = collision-safe canonical identity over person/source
revisionId      = upstream hash
mediaType       = application/vnd.team-memory.event+json
```

Consequently, identical row tuples from two compatible ledgers remain
distinct when their caller-supplied `sourceInstance` values differ.

The mapping retains source project, kind, summary, references, and attributed
actor. It does not infer readiness, success, support, challenge, confidence,
evidence quality, decisions, or beliefs.

## Security and Privacy

- The caller selects the source explicitly; no default path or environment
  lookup exists.
- `raw` is omitted by default. `includeRaw: true` and `--include-raw` are
  explicit privacy-sensitive opt-ins.
- Help and version output do not open a source.
- Public diagnostics exclude database paths, SQL text, SQLite messages, row
  content, raw values, credentials, and arbitrary thrown messages.
- The CLI writes canonical `SourceRecord` JSONL. A failure writes exactly one
  sanitized JSON diagnostic to stderr. Pre-output failures write nothing to
  stdout; operating-system output failures may occur after bytes have already
  left the process.
- Source-specific tests verify read-only behavior, deterministic output, bound
  filters, and unchanged source size and nanosecond modification time.

Raw opt-in authorizes inclusion in emitted records for that invocation only.
It does not authorize interpretation, promotion, persistence, logging, or
further disclosure.

## CLI Composition

```bash
collective-cognition-teammem export \
  --db /absolute/path/to/compatible-ledger.db \
  --source-instance public-demo \
  --limit 5
```

Optional filters are `--from`, `--to`, `--person`, `--project`, `--limit`, and
`--include-raw`. Export does not promote or persist cognition. Callers compose
it explicitly with the source-neutral CLI:

```bash
collective-cognition-teammem export ... > records.jsonl
collective-cognition validate --input records.jsonl --format jsonl
```

## Compatibility and Future Extraction

Package `0.5.0` adds the two versioned subpaths, the dedicated executable, and
its compatibility baseline without changing root runtime exports, root type
exports, or the generic CLI contract. SourceRecord `0.1.0` remains Normative
Stable. The connector and conformance subpaths are Supported Experimental
before `1.0.0`.

The maintained connector may later move to a companion package. Extraction
must preserve its versioned record behavior and ledger-format identity or use
the compatibility process for any change. Independent connector packages do
not need to follow that extraction and must not depend on the maintained
connector's private implementation.

Conformance demonstrates only the tested output contract and repeat behavior.
It is not a security audit, interoperability guarantee, maintenance promise,
certification, endorsement, or LTS commitment.

## Rejected Alternatives

### Put connector APIs in the package root

Rejected because source-specific types would make collection appear to be
required core behavior and would prematurely standardize configuration,
discovery, authentication, and transport.

### Require connectors to live in this repository

Rejected because independent owners need separate release, dependency, and
security policies. A connector's location does not affect whether it emits
valid `SourceRecord` values.

### Depend on `team-memory-agent`

Rejected because compatibility is structural. Requiring one producer
implementation would couple two repositories and exclude compatible public
ledgers.

### Extract a companion package immediately

Deferred because the core package is still private and unpublished. Versioned
subpaths preserve a future extraction path without adding another release
process now.

### Collect directly into Evidence or persisted cognition

Rejected because collection cannot supply the caller's interpretation,
rationale, authority, promotion policy, or persistence choice.

## Acceptance Checks

- the root export and generic CLI remain source-neutral;
- an independent connector imports only the root SDK and conformance subpath;
- the maintained connector accepts a fictional structurally compatible ledger
  without a `team-memory-agent` dependency;
- `sourceInstance` isolates otherwise identical ledger revisions;
- raw data is omitted by default and explicit when included;
- connector output passes generic conformance and generic ingestion;
- package and clean-consumer tests cover both subpaths and the installed CLI;
- source, compatibility, package, type, syntax, and diff checks pass; and
- final independent review and real-ledger acceptance remain separate
  completion gates.

## Explicit Deferrals

- changes to `team-memory-agent`, MemberKit, or `teammem-bundle/v1`;
- automatic execution from a scheduler;
- connector discovery, registry, marketplace, or dynamic loading;
- network connectors, authentication integration, and credential policy;
- automatic interpretation, promotion, or cognition persistence;
- a maintained `journal-highlight` interpretation policy;
- durable publication outbox, retry worker, or delivery guarantee;
- npm publication, registry-name confirmation, or removal of `"private": true`;
- production certification, endorsement, long-term support, or support tiers;
