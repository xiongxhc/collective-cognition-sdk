# Connector Author Guide

This guide is for maintainers of source connectors that emit records for
Collective Cognition SDK. `SourceRecord` is the universal boundary between
source collection and the SDK's generic ingestion behavior.

Current package `0.10.0` is private and unpublished. The example can run against a
local checkout or packed tarball, but the package is not yet available from a
public registry. Connector conformance is not certification, does not imply
endorsement, and is not an LTS commitment.

## Package Independence

A connector may live in this repository, but it does not need to. An
independent maintainer can use a separate repository and package with its own
release cadence, source-system dependencies, credentials, and support policy.

An independent connector needs only:

```text
collective-cognition-sdk
collective-cognition-sdk/connector-conformance/0.1.0
```

The root provides `SourceRecord` creation and validation. The versioned
conformance subpath checks connector output. No team-memory connector,
`team-memory-agent`, shared connector runtime, registry, transport, or
configuration format is required.

## Maintained Examples

Package `0.10.0` has two maintained connectors with independent source
boundaries. The team-memory connector reads an explicitly selected compatible
SQLite ledger. The Git connector at
`collective-cognition-sdk/connectors/git/0.1.0` reads an explicit local
repository through a local Git executable, follows first-parent history from
an exact tip, performs read-only bounded collection, and keeps messages and
author email behind disabled-by-default privacy options.

These are maintained examples, not an architecture external connectors must
copy. External connectors do not need to import either implementation or use
SQLite, Git, child processes, their option shapes, or their error classes.
Package `0.10.0` adds no connector registry, plugin discovery or runtime,
network connector, scheduler, automatic cognition, or Git CLI. The
[Interoperability Profile `0.1.0`](../spec/interoperability.md), owned by
`collective-cognition-sdk-maintainers`, supplies evidence for the maintained
pair only; it is not production certification, endorsement, or an LTS
commitment.

## Complete Fictional Connector

The following module is a complete, runnable fictional connector example. It
imports the package root and the connector-conformance subpath only.

```ts
import {
  createSourceRecord,
} from "collective-cognition-sdk";
import {
  runSourceConnectorConformance,
} from "collective-cognition-sdk/connector-conformance/0.1.0";

interface FictionalLedgerEntry {
  readonly entryId: string;
  readonly revision: string;
  readonly occurredAt: string;
  readonly summary: string;
}

const entries: readonly FictionalLedgerEntry[] = [{
  entryId: "entry-1",
  revision: "revision-1",
  occurredAt: "2026-07-29T10:00:00.000Z",
  summary: "A fictional source entry.",
}];

function collect() {
  return entries.map((entry) =>
    createSourceRecord({
      id:
        `source-record:fictional:${entry.entryId}:${entry.revision}`,
      source: {
        system: "fictional-ledger",
        instance: "public-demo",
      },
      sourceId: entry.entryId,
      revisionId: entry.revision,
      capturedAt: entry.occurredAt,
      mediaType: "application/json",
      content: {
        summary: entry.summary,
      },
    })
  );
}

const results = await runSourceConnectorConformance([{
  name: "fictional-ledger",
  collect,
  collectAgain: collect,
}]);

if (results.some((result) => result.status === "failed")) {
  throw new Error("Fictional connector failed conformance.");
}

console.log(JSON.stringify(results));
```

Each call allocates records through `createSourceRecord`, which validates,
detaches, and deeply freezes them. `collectAgain` asks the conformance runner
to compare canonical repeated output. The example uses a stable public source
instance and immutable upstream revision identity; it does not import or call
any maintained connector.

## Mapping Rules

For each source revision, choose:

- `source.system`: a stable public identifier for the source format or system;
- `source.instance`: stable public non-secret identity for one logical source
  instance;
- `sourceId`: the upstream logical item identity;
- `revisionId`: the immutable upstream revision identity;
- `id`: a collision-safe record identity derived from the source instance,
  source item, and revision;
- `capturedAt`: when the connector captured or exported this revision;
- `observedAt`: the source event time, when available and trustworthy;
- `mediaType`: the format of the neutral `content`; and
- `content`: source-preserving JSON without connector-added cognitive
  conclusions.

`source.instance` and connector options such as the maintained connector's
`sourceInstance` are public record identity, not secret configuration. Never
put credentials, tokens, private filesystem paths, or sensitive tenant labels
in them.

Do not reuse one revision key for changed content. Do not infer Evidence
polarity, confidence, authority, truth, Decisions, Principles, or
organizational beliefs while collecting. Collection does not imply
interpretation, promotion, or persistence.

## Connector-Owned Responsibilities

The conformance runner deliberately does not define a connector runtime.
Every connector owner remains responsible for:

### Explicit source selection

Require the caller to identify the source. Do not scan home directories,
environment-dependent defaults, unrelated databases, personal vaults, or
running services implicitly.

### Authentication and credential handling

Keep credentials outside `SourceRecord`, `source.instance`, logs, diagnostics,
fixtures, and canonical output. Define the connector's own credential loading,
rotation, least-privilege, and redaction policy.

### Pagination, cursors, and change capture

Specify whether collection is a snapshot, bounded page, incremental cursor,
poll, or webhook projection. Cursor state is connector-owned and must not
silently change record identity.

### Retries and deterministic output

Define retry and rate-limit behavior. For the same selected revision set,
return records in a deterministic order with canonical-equivalent content.
Do not turn transient transport metadata into a new source revision.

### Source no-mutation checks

Use read-only APIs or permissions where available. Add source-specific tests
for no mutation, such as unchanged file size and modification time, no write
requests, or a read-only transaction. Generic conformance cannot prove this.

### Source-specific errors

Use structured, stable error codes and stages. Public diagnostics must not
include credentials, arbitrary upstream exception messages, private paths,
queries, row or document content, or raw response bodies.

### Privacy and raw data

Emit the minimum neutral content needed for the connector contract. Raw
content must be an explicit privacy-sensitive opt-in, omitted by default, and
documented with its downstream disclosure consequences. Raw opt-in does not
authorize interpretation, promotion, persistence, logging, or publication.

### Release and maintenance policy

Version public mapping behavior, declare supported source versions, test clean
consumers, and document deprecation or extraction. State ownership and support
capacity accurately. Passing conformance does not create certification,
endorsement, security assurance, interoperability guarantees, or long-term
support.

## What Conformance Checks

`runSourceConnectorConformance` checks:

- collection returns an array;
- each item is a valid `SourceRecord`;
- accepted records round-trip through the normative codec;
- duplicate source-revision keys fail;
- optional repeated output is canonically deterministic;
- one failed case does not abort later cases; and
- returned diagnostics and results are detached and deeply frozen.

Connector exceptions become sanitized `connector_exception` diagnostics.
Invalid arrays, records, duplicate revisions, and repeated output receive
stable diagnostic codes.

Conformance does not inspect source permissions, credentials, transport
security, privacy law, retention, pagination completeness, source mutation,
operational support, or semantic usefulness. Conformance is not
certification, does not imply endorsement, and is not an LTS commitment.

## Integration Boundary

A connector's complete responsibility ends at valid neutral records:

```text
explicit source
  → connector
  → SourceRecord[]
```

A caller separately chooses generic ingestion, interpretation, promotion, and
host persistence:

```text
SourceRecord[]
  → ingestSourceRecords(...)
  → optional explicit promotion policy
  → Portable Cognition
  → host-selected CognitionStore
```

Do not make collection success mean accepted Evidence or persisted cognition.
Keep source stores and cognition stores logically distinct.

See [RFC 0006](../rfcs/0006-maintained-source-connectors.md) for the public
extension decision and the
[RFC 0011](../rfcs/0011-cross-connector-interoperability.md) for the maintained
Git connector and cross-connector evidence boundary. See the
[SourceRecord specification](../spec/source-record.md) for the normative
record contract.
