# Team-Memory Connector Guide

The maintained team-memory-compatible connector is isolated below
`collective-cognition-sdk/connectors/team-memory/0.1.0`. It is one maintained
source connector, not SDK root behavior. See [RFC
0006](../rfcs/0006-maintained-source-connectors.md) for the normative contract
and the [connector author guide](connector-author-guide.md) for the general
connector model.

## Accepted ledger shape

The connector accepts any explicitly supplied SQLite database with this
structural `teammem-event-ledger/1` table:

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
`team-memory-agent`; compatibility is structural rather than tied to one producer
repository or deployment.

## Source instance identity

`sourceInstance` is public, non-secret identity for one logical ledger. Use a
stable value that contains no credentials, tokens, private paths, or sensitive
tenant labels. It prevents identical `(person, source, hash)` tuples from
different compatible ledgers from colliding.

## Raw content

The connector omits `raw` by default. Callers must pass connector option
`{ includeRaw: true }` or CLI flag `--include-raw` to include it. The flag
authorizes inclusion in output for that invocation only; it does not authorize
promotion, persistence, logging, or further disclosure.

## Imports

Import the two public surfaces separately from the root API:

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

## Safety properties

- SQLite is opened read-only and queried with `SELECT` only.
- Every selected row maps to a cloned, deeply frozen SourceRecord before any interpretation.
- Collection and promotion are separate caller-selected operations; collection never persists cognition.
- The connector does not infer support, challenge, truth, confidence, decisions, or evidence quality.
- The provided ledger path is the only external source.
- The personal Obsidian vault is not read or written.
- The connector does not modify source schedulers or rendered outputs.
- Time filtering follows stored timestamp text; mixed offsets can differ from absolute-time ordering near a boundary.
- `node:sqlite` is experimental in Node 24 and may emit an `ExperimentalWarning`; npm scripts suppress the warning only for readable output.

## Export CLI

`collective-cognition-teammem export` writes canonical SourceRecord JSONL to
stdout. See the [CLI reference](cli-reference.md) for its complete flag set,
diagnostics, and the composition pattern with the generic CLI. Export does not
create Evidence or write a cognition database.
