# CLI Reference

The package installs four executables. The [public API
reference](public-api.md) records their stability classes.

| Executable | Purpose |
| --- | --- |
| `collective-cognition` | Source-neutral validate, ingest, promote, and ingest-promote |
| `collective-cognition-teammem` | Read-only export from a compatible team-memory ledger |
| `collective-cognition-markdown` | Managed Markdown target init, project, and verify |
| `collective-cognition-workflow` | One closed durable `run` command |

In a source checkout, run the generic CLI through `npm run --silent cc --` and
the export CLI through `npm run --silent teammem:export --`.

## Generic CLI

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

`validate` emits one item-result JSON line per input item. `ingest` emits
accepted unique SourceRecords. `promote` reclassifies its direct inputs, rejects
source-revision collisions, and creates one Evidence object from the accepted
unique records. Its ID is a SHA-256 hash over the complete canonical validated
promotion payload: records, context, hypothesis, policy identity, rationale,
attribution, timestamp, and mapping output. `ingest-promote` emits one composed
result whose `promotion` is a discriminated `succeeded` or `failed` result;
promotion failure never conceals successful ingestion. SDK consumers can inspect
`SOURCE_RECORD_MAX_JSON_DEPTH` to discover the fixed SourceRecord depth profile.

### Input limits

The generic CLI accepts `--max-input-bytes`, `--max-records`, and
`--max-record-bytes`. Defaults are `10485760`, `10000`, and `1048576`
respectively. File and stdin input use the same incremental bounded reader.
JSONL line size is checked before parsing. Unknown SDK values pass a
descriptor-based structural preflight that never invokes accessors or `toJSON`,
rejects cycles, `BigInt`, and other non-JSON values per item, and enforces record
size while building one isolated plain JSON snapshot. Normalization and
classification use only that snapshot and never reread the original value. Proxy
reflection failures become secret-safe item rejections in collect-all mode. The
normalized plain frozen record is measured exactly again as defense in depth. SDK
callers can configure the corresponding ingestion options. Limit breaches use
`INGESTION_LIMIT_EXCEEDED`.

### Promotion capture

Promotion snapshots and freezes the validated request and contributing records
before reading any policy property. Policy identity and `map` are then captured
once inside a secret-safe fail-closed boundary. The mapper receives a frozen
captured receiver containing that identity, so methods using `this.id` or
`this.version` work without rereading mutable policy state. Mapping output is
captured exactly once through own data-property descriptors inside the same
boundary; accessors, unknown fields, malformed fields, and reflection failures
are rejected, and all later validation, identity, and object construction use
only the plain frozen mapping snapshot.

### Diagnostics

Pre-output generic CLI failures write exactly one JSON diagnostic to stderr with
`code`, `message`, `details`, and `stage`, and write nothing to stdout. Parser
details, arbitrary promotion-policy exceptions, input paths, and non-domain
exception messages are not exposed. Rejected collect-all items remain item
diagnostics because they are batch outcomes rather than top-level failures.

## Team-memory export CLI

```bash
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

Export writes canonical SourceRecord JSONL and supports `--from`, `--to`,
`--person`, `--project`, `--limit`, and `--include-raw`. It requires `--db` and
`--source-instance`; help and version output do not open a source. Failures write
one sanitized JSON diagnostic to stderr shaped as
`{ "code": "...", "message": "...", "stage": "..." }`. Failures detected before
output write nothing to stdout; an operating system pipe failure can occur after
already-written bytes and cannot retract them.

The former experimental `--hypothesis-id` and `--context-id` export arguments
were removed because export no longer creates Evidence. Compose export with the
generic CLI explicitly:

```bash
collective-cognition-teammem export \
  --db /absolute/path/to/compatible-ledger.db \
  --source-instance public-demo \
  > records.jsonl
collective-cognition validate --input records.jsonl --format jsonl
```

Export does not create Evidence or write a cognition database. See the
[team-memory connector guide](team-memory-connector-guide.md).

## Workflow CLI

```bash
collective-cognition-workflow run \
  --request /absolute/path/to/workflow-request.json \
  --input /absolute/path/to/source-records.jsonl \
  --format jsonl \
  --cognition-db /absolute/path/to/new-cognition-v2.db \
  --create-cognition-db
```

See the [Durable Cognition Workflow
Guide](durable-cognition-workflow-guide.md) for the request shape, replay
behavior, and limits.

## Markdown CLI

The dedicated Markdown executable has a closed `init`, `project`, and `verify`
command set. The [Markdown cognition adapter
guide](markdown-cognition-adapter-guide.md) documents every flag, the generated
layout, and the conflict and pruning rules.

## Repository scripts

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
npm run example:interoperability
npm run example:stable-host:acceptance
npm run example:stable-host -- \
  --source-records /absolute/path/to/fictional-source-records.jsonl \
  --cognition-db /absolute/path/to/fictional-cognition.db
```

Run the canonical conformance suite directly:

```bash
npm run test:schema
node --test tests/conformance.test.ts
node --disable-warning=ExperimentalWarning --test tests/portable-cognition-conformance.test.ts
```

## What each example prints

`npm run example` prints an attributed complete chain, a rejected unconfirmed
decision approval, a successful human-confirmed approval, and the successful
event count.

`npm run example:portable` creates one cognitive-object record, serializes and
deserializes its Portable Cognition `0.1.0` envelope, and prints that one
restored envelope to stdout.

`npm run example:markdown` creates an operating-system temporary directory,
initializes its `Collective Cognition` subtree, projects one Goal and related
Hypothesis, parses a generated note, repeats the projection without updates,
verifies the target, prints one JSON summary, and removes the temporary root. It
does not access a live vault, ledger, or cognition database.

`npm run example:host` prints one JSON outcome showing an initial commit,
`committed_but_unpublished` after the first publication attempt, and this
example's identical retry returning `committed`, with object version `2`, one
stored event, and one published event. The contract makes publication failure
retryable but does not guarantee that every retry succeeds.

`npm run example:workflow` creates only temporary SourceRecord, request,
SQLite-v2, and managed Markdown targets. It commits, replays, closes, reopens,
verifies exact records, and confirms unchanged projection without accessing a
live ledger or vault. On a Node.js runtime lacking
`DatabaseSync.prototype.enableDefensive`, it exits `0`, creates no temporary
files, and prints exactly `{"status":"skipped","reason":"unsupported_runtime"}`.

`npm run example:stable-host -- ...` requires two explicit absolute paths: one
JSONL source path containing exactly two fictional SourceRecords and a different
SQLite cognition path. On a runtime with enforced SQLite defensive mode it
reports two source records, six persisted and reloaded objects, three persisted
and reloaded events, and nine portable records. Local capability skips do not
replace real-device or supported-runtime acceptance.

Repository automation runs `npm run example:stable-host:acceptance` without
arguments. That self-contained harness creates fictional temporary inputs and
either verifies the same summary on a supported runtime or records the local
SQLite capability skip.
