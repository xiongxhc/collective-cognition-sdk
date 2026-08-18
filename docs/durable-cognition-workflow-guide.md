# Durable Cognition Workflow Guide

## Purpose

Durable Cognition Workflow `0.1.0` joins explicit SourceRecords, an explicit
Hypothesis, neutral Evidence promotion, a governed review transition, and one
atomic cognition commit. It is source-neutral: a connector, canonical JSONL,
or a host application may supply the SourceRecords.

```text
connector or canonical JSONL
  -> explicit durable workflow request
  -> atomic cognition database
  -> optional event publisher
  -> optional managed Markdown projection
```

Private package `0.9.0` is unpublished. The workflow is Supported
Experimental, and production use is not claimed.

## Choose Explicit Inputs and Targets

The workflow never discovers a source ledger, vault, repository, database, or
home directory. Supply every source and target explicitly. Keep source storage
and cognition storage logically separate.

The SQLite workflow store requires schema version `2`. It never upgrades a
version-`1` cognition database, so use a new explicit database for this slice.
Creation occurs only when `createIfMissing: true` in the SDK or
`--create-cognition-db` in the CLI is present.

## SDK Usage

Import the source-neutral workflow and the Node-specific store separately:

```ts
import {
  prepareDurableCognitionWorkflow,
  runDurableCognitionWorkflow,
  type DurableCognitionWorkflowHost,
  type DurableCognitionWorkflowRequest,
} from "collective-cognition-sdk/workflows/durable/0.1.0";
import {
  SqliteCognitionWorkflowStore,
} from "collective-cognition-sdk/stores/sqlite-workflow/0.1.0";

const request: DurableCognitionWorkflowRequest = {
  workflowVersion: "0.1.0",
  workflowId: "workflow:review:1",
  records,
  hypothesis,
  promotion,
  reviewTransition,
  policy,
};

const store = new SqliteCognitionWorkflowStore({
  databasePath: "/absolute/path/to/new-cognition-v2.db",
  createIfMissing: true,
});

try {
  const host: DurableCognitionWorkflowHost = { store };
  const prepared = prepareDurableCognitionWorkflow(request);
  const result = await runDurableCognitionWorkflow(request, host);
  console.log(prepared.requestDigest, result.status);
} finally {
  store.close();
}
```

A host may add its own `CognitionEventPublisher` and
`DurableCognitionProjector`. Persistence runs first. Publication and projection
statuses are separate because a committed cognition workflow remains durable
when either downstream stage fails.

## CLI Usage

Create a closed JSON request containing the Hypothesis, promotion context,
review transition, `workflowVersion: "0.1.0"`, and
`policyId: "neutral-evidence-v1"`. Keep SourceRecords in a separate canonical
JSON or JSONL file.

```bash
collective-cognition-workflow run \
  --request /absolute/path/to/workflow-request.json \
  --input /absolute/path/to/source-records.jsonl \
  --format jsonl \
  --cognition-db /absolute/path/to/new-cognition-v2.db \
  --create-cognition-db
```

Add `--markdown-target /absolute/path/to/initialized-managed-target` only when
the target was already initialized by `collective-cognition-markdown init`.
The workflow CLI does not initialize or discover a target.

The CLI has no publisher option and never publishes an event. It writes one
closed JSON result to stdout on success. Failures write one sanitized JSON
diagnostic to stderr and do not expose source contents, arbitrary adapter
messages, stack traces, or paths.

## Replay and Recovery

An identical request replay returns `already_committed` without duplicating
objects, events, or workflow receipts. Requested downstream stages run again
through their idempotent boundaries because this slice does not persist
publisher or projector completion state.

If Markdown projection fails after persistence, correct or initialize the
explicit managed target and replay the same request. Markdown is
non-authoritative; do not recover cognition by editing or importing generated
notes.

The CLI has no publisher, and the SDK supplies no durable publication outbox
or retry worker. A host that publishes events owns idempotency, credentials,
delivery recovery, and operational monitoring.

## Limits and Non-Claims

This slice supplies no scheduler, automatic cognition, Obsidian discovery,
authentication, encryption, durable outbox, production certification, or npm
publication. It does not infer Decisions or Principles, authenticate human
confirmation, certify connectors, or make Markdown authoritative. Package
`0.9.0` remains private and unpublished, and production use is not claimed.

See [RFC 0010](../rfcs/0010-durable-cognition-workflow.md), the
[public API reference](public-api.md), and the
[compatibility policy](../spec/compatibility.md).
