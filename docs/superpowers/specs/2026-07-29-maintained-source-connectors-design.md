# Maintained Source Connectors Design

**Status:** Proposed for written review; design direction approved

**Date:** 2026-07-29

## Problem

Collective Cognition SDK already defines a source-neutral `SourceRecord`
boundary and contains two repository-only connector examples. The team-memory
SQLite connector is useful against real data, but it remains Internal:

- it is excluded from the emitted package;
- its CLI is not installed;
- it has no versioned compatibility surface;
- it does not identify the source-ledger instance; and
- there is no reusable connector-conformance entrypoint for other
  implementations.

Promoting one connector must not make team-memory a privileged SDK behavior.
The public open-source architecture must support independently maintained
connectors for other ledgers, APIs, files, queues, and services without adding
those source systems to the root SDK.

## Decision

Package two additive, versioned subpaths:

```text
collective-cognition-sdk/connector-conformance/0.1.0
collective-cognition-sdk/connectors/team-memory/0.1.0
```

The first subpath is source-neutral and reusable by any connector author. The
second is the first maintained connector and reads any compatible
`teammem-event-ledger/1` SQLite database. It is not limited to one deployment,
one team, or the official `team-memory-agent` repository.

The package root and generic `collective-cognition` CLI remain source-neutral.
The team-memory connector receives its own executable:

```text
collective-cognition-teammem
```

This slice changes only `collective-cognition-sdk`. It does not modify
`team-memory-agent`, MemberKit, `teammem-bundle/v1`, provider connectors,
schedulers, live ledgers, or rendered vaults.

## Public-Open-Source Position

The maintained connector is an example of the extension model, not the
definition of that model.

- `SourceRecord` remains the universal ingestion boundary.
- The connector-conformance package is source-neutral.
- Connector-specific APIs exist only below versioned connector subpaths.
- External connectors may live in independent repositories and packages.
- Passing conformance does not imply endorsement, security certification, or
  permanent maintenance by the SDK project.
- The project may later extract the maintained connector into a companion
  package without changing its versioned record behavior.

The connector implementation, documentation, tests, and fixtures must contain
no company hostnames, member identities, credentials, private channel IDs,
private repository names, personal-vault paths, or copied production data.

## Architecture

```text
explicit compatible source
  → maintained or third-party connector
  → immutable SourceRecord values
  → generic ingestion
  → explicit caller-selected promotion
  → Portable Cognition
  → host-selected CognitionStore
```

Collection, interpretation, and persistence remain separate:

1. A connector reads an explicit source and emits neutral `SourceRecord`
   values.
2. Generic ingestion validates, deduplicates, and classifies source revisions.
3. A caller explicitly chooses whether and how to promote records.
4. A host explicitly chooses whether and where to persist cognition.

No connector may infer a Hypothesis, Evidence polarity, Decision, Principle, or
organizational belief merely by collecting source material.

## Connector Conformance 0.1.0

### Purpose

The conformance entrypoint gives connector authors one reusable way to prove
that their output satisfies the SDK boundary without requiring a shared
connector runtime, registry, transport, or configuration format.

### Public Interface

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

The implementation snapshots untrusted case definitions through own
enumerable data-property descriptors before invoking connector code. It never
uses ordinary reads on unknown case objects.

### Required Checks

For each case, the runner verifies:

- collection returns an array;
- every item is a valid `SourceRecord`;
- returned records are detached and deeply frozen;
- serialized records round-trip through the normative codec;
- output contains no duplicate revision keys;
- optional repeated collection is canonically deterministic; and
- one failed case does not abort later cases.

The runner returns frozen structured results. Connector exceptions become
secret-safe diagnostics and do not expose arbitrary exception messages, paths,
credentials, or source content.

### Deliberate Non-Goals

The generic conformance runner does not define:

- connector discovery or registration;
- authentication or credential loading;
- pagination, polling, cursors, or webhooks;
- scheduling or retries;
- source-specific no-mutation checks;
- network security policy;
- connector support tiers; or
- a certification program.

Source-specific packages add their own safety tests around the common
conformance evidence.

## Team-Memory-Compatible Connector 0.1.0

### Ledger Identity

The connector accepts the documented `teammem-event-ledger/1` table shape:

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

Schema compatibility is structural. A database does not need to be created by
the official `team-memory-agent` implementation.

The connector rejects:

- missing or non-absolute paths;
- SQLite URLs, `:memory:`, `~`, and implicit discovery;
- missing or incompatible `events` tables;
- missing or incompatibly typed required columns;
- malformed row values; and
- timestamps without an explicit UTC offset.

Additional tables and columns are allowed and ignored. This keeps the format
usable by compatible public implementations that retain the required event
fields while adding their own storage metadata.

Offsetless timestamps are never assigned a guessed local timezone. Producers
that store local timestamps must normalize them before using this connector.

### Public Interface

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

`sourceInstance` is required, non-empty, non-secret, and stable for one logical
ledger. It is public record metadata, must be 1 through 128 Unicode scalar
values, must contain no control characters, and must have no leading or
trailing whitespace. It is copied into `SourceRecord.source.instance`. It
prevents identical `(person, source, hash)` tuples from two compatible ledgers
from becoming the same SourceRecord identity.

The connector does not export SQLite row types. Consumers receive only
validated immutable `SourceRecord` values and connector-specific structured
errors. Error messages and details never contain the database path, SQL text,
row content, raw content, arbitrary SQLite messages, or credentials.

### Read Behavior

- Open only the explicitly supplied database.
- Open SQLite read-only.
- Execute `SELECT` statements only.
- Bind every filter value.
- Order rows deterministically by timestamp and row ID.
- Default to omitting `raw`.
- Include `raw` only when `includeRaw: true`.
- Validate all selected rows before returning any records.
- Leave database byte size and nanosecond modification time unchanged.

Timestamp range filters retain the ledger's existing lexical-text behavior.
The connector documents that mixed offsets can differ from absolute-time
ordering near a boundary.

### Record Mapping

Each output uses:

```text
id              = collision-safe canonical identity over
                  sourceInstance/person/source/hash
source.system   = teammem-event-ledger
source.instance = caller-supplied sourceInstance
sourceId        = collision-safe canonical identity over person/source
revisionId      = upstream hash
mediaType       = application/vnd.team-memory.event+json
```

The neutral content retains the source project, kind, summary, references, and
attributed actor. It does not infer readiness, success, support, challenge,
confidence, evidence quality, or decisions.

## Dedicated CLI

The installed command is:

```bash
collective-cognition-teammem export \
  --db /absolute/path/to/ledger.db \
  --source-instance engineering-hub \
  --limit 5
```

Supported export filters are:

```text
--from
--to
--person
--project
--limit
--include-raw
```

The command writes canonical SourceRecord JSONL to stdout. `--include-raw` is
an explicit privacy-sensitive opt-in. Help and version output touch no source.

Every failure writes exactly one sanitized JSON diagnostic to stderr and
nothing to stdout. Unknown flags, duplicate flags, relative paths, missing
values, incompatible schemas, malformed rows, and output failures are closed
errors.

The connector CLI does not promote or persist cognition. Callers compose it
with the generic SDK CLI or APIs:

```bash
collective-cognition-teammem export ... > records.jsonl
collective-cognition validate --input records.jsonl --format jsonl
```

## Compatibility and Packaging

This additive slice advances the private package to `0.5.0`.

Required package changes:

- add `./connector-conformance/0.1.0`;
- add `./connectors/team-memory/0.1.0`;
- install `collective-cognition-teammem`;
- add compatibility baseline and change cases for `0.5.0`;
- pin declaration closures for both new subpaths;
- test exact emitted and tarball inventories;
- prove clean-consumer runtime and type imports;
- prove the root runtime and type inventories are unchanged; and
- retain `"private": true`.

The connector and conformance subpaths are Supported Experimental before
`1.0.0`. `SourceRecord` remains Normative Stable. Connector-specific record
mapping is versioned by the connector subpath and ledger-format constant.

## Testing

Implementation follows red-green-refactor.

### Generic Conformance

- valid sync and async connectors pass;
- invalid records fail without aborting later cases;
- connector exceptions are sanitized;
- hostile descriptors and proxies fail closed;
- returned results are detached and deeply frozen;
- duplicate revision keys fail; and
- repeated collection must be canonically deterministic when supplied.

### Maintained Connector

- absolute-path and strict schema validation;
- read-only database access;
- bound-filter injection resistance;
- deterministic repeated export;
- two ledgers with identical rows produce distinct SourceRecord IDs when
  `sourceInstance` differs;
- raw omission and explicit opt-in;
- malformed references, timestamps, and rows fail closed;
- offsetless timestamps are rejected;
- source size and modification time remain unchanged;
- connector output passes generic conformance; and
- no team-memory API leaks through the root export.

### Package and CLI

- clean-package runtime and type imports;
- exact CLI help, version, and parser behavior;
- stdout contains only SourceRecord JSONL;
- failures produce one sanitized stderr diagnostic;
- package inventory contains only approved public artifacts;
- historical compatibility artifacts remain byte-identical; and
- root and generic CLI contracts remain unchanged.

### Real-Ledger Acceptance

A manual acceptance run may use an explicitly supplied local ledger only to
verify compatibility. It must:

- record source byte size and nanosecond modification time before and after;
- export without `raw`;
- validate every output through generic ingestion;
- prove deterministic repeated export;
- avoid writing any cognition database;
- avoid reading a personal vault;
- avoid modifying a scheduler or rendered output; and
- retain no copied production records in the repository or reports.

Acceptance evidence may record counts and hashes, but not source content,
identities, private paths beyond the operator-supplied local path, or secrets.

## Documentation

Update:

- `README.md`;
- `docs/ROADMAP.md`;
- `spec/README.md`;
- `spec/compatibility.md`;
- RFC index and a connector RFC;
- package commands and examples; and
- a public connector-author guide explaining independent-package use.

The guide must make clear that future connectors do not need to live in this
repository. They need to emit valid `SourceRecord` values and may use the
conformance package without depending on the team-memory connector.

## Alternatives Considered

### Separate Companion Package Now

A separate package would provide the strongest release isolation, but it adds
workspace, dependency, baseline, and publication administration while the core
package is still private and unpublished. The versioned subpath is designed so
later extraction remains possible.

### Team-Memory-Agent-Owned Connector

Keeping the connector in the source repository would preserve producer schema
ownership, but it would make the first public conformance example depend on a
second release process. This remains a valid future home. This slice does not
modify that repository.

### Generic Root Connector Interface

Adding connector types to the root would make source integration appear to be
required core behavior and would prematurely standardize discovery,
authentication, scheduling, and transport concerns. Versioned subpaths keep
the root neutral.

## Explicit Deferrals

- Changes to `team-memory-agent` or MemberKit.
- Automatic execution from `run-daily` or any scheduler.
- Automatic promotion or cognition persistence.
- A maintained `journal-highlight` interpretation policy.
- Connector discovery, marketplace, plugin registry, or dynamic loading.
- Network connectors and credential policy.
- Durable publication outbox.
- npm publication or registry-name confirmation.
- Production certification or long-term-support commitment.

## Acceptance Criteria

This slice is complete when:

1. any connector author can import the versioned conformance runner without
   importing team-memory code;
2. the maintained connector reads any compatible explicitly supplied ledger
   into valid immutable SourceRecords;
3. two compatible ledgers remain identity-isolated through required
   `sourceInstance`;
4. raw content remains opt-in and all failures are secret-safe;
5. repeated export is deterministic and does not mutate the source;
6. the dedicated installed CLI works in a clean consumer;
7. package `0.5.0` adds only reviewed subpaths and executable behavior while
   leaving root contracts unchanged;
8. historical compatibility artifacts remain byte-identical;
9. all source, conformance, compatibility, package, type, syntax, and example
   checks pass; and
10. independent final review finds no unresolved Critical or Important issue.
