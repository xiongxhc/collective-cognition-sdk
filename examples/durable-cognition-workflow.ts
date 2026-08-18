import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  createObject,
  createSourceRecord,
} from "../src/index.ts";
import {
  initializeMarkdownCognitionTarget,
  verifyMarkdownCognitionTarget,
} from "../src/markdown-cognition.ts";
import type { MarkdownCognitionRecord } from "../src/markdown-cognition.ts";
import { SqliteCognitionWorkflowStore } from "../src/stores/sqlite-workflow.ts";

const cliPath = new URL("../src/workflow-cli.ts", import.meta.url);

interface WorkflowResult {
  readonly status: string;
  readonly persistence: string;
  readonly publication: string;
  readonly projection: string;
  readonly workflowId: string;
  readonly records: readonly MarkdownCognitionRecord[];
}

function sourceNeutralRequest(): Record<string, unknown> {
  const hypothesis = createObject({
    id: "hypothesis:durable-workflow-example",
    type: "hypothesis",
    version: 1,
    state: "proposed",
    title: "Explicit evidence is ready for governed review",
    data: {
      statement: "A source-neutral record can support an explicit hypothesis.",
    },
    createdAt: "2026-08-13T08:00:00.000Z",
    updatedAt: "2026-08-13T08:00:00.000Z",
    attribution: {
      initiatorId: "human:example-author",
      executorId: "human:example-author",
      accountableId: "human:example-owner",
    },
    provenance: [{
      source: "durable-workflow-example",
      sourceId: "hypothesis:input",
      capturedAt: "2026-08-13T08:00:00.000Z",
    }],
    contextId: "context:durable-workflow-example",
    relationships: [{
      type: "supports-goal",
      targetId: "goal:durable-workflow-example",
    }],
  });
  return {
    workflowVersion: "0.1.0",
    workflowId: "workflow:durable-workflow-example:1",
    hypothesis,
    promotion: {
      hypothesisId: hypothesis.id,
      contextId: hypothesis.contextId,
      rationale: "The explicit source record is relevant to this hypothesis.",
      promotedAt: "2026-08-13T09:00:00.000Z",
      attribution: {
        initiatorId: "human:example-reviewer",
        executorId: "human:example-reviewer",
        accountableId: "human:example-owner",
      },
    },
    reviewTransition: {
      eventId: "event:durable-workflow-example:1",
      occurredAt: "2026-08-13T10:00:00.000Z",
      initiator: { id: "human:example-reviewer", kind: "human" },
      executor: { id: "human:example-reviewer", kind: "human" },
      accountableParty: { id: "human:example-owner", kind: "human" },
      automationMode: "manual",
      consequenceLevel: "routine",
      rationale: "Review the hypothesis with the explicit evidence.",
    },
    policyId: "neutral-evidence-v1",
  };
}

function sourceNeutralRecord(): Record<string, unknown> {
  return createSourceRecord({
    id: "source-record:durable-workflow-example:1",
    source: { system: "source-neutral-example" },
    sourceId: "example:record:1",
    revisionId: "1",
    capturedAt: "2026-08-13T09:00:00.000Z",
    mediaType: "application/json",
    content: { summary: "The explicit evidence is available for review." },
  }) as unknown as Record<string, unknown>;
}

function runCli(arguments_: readonly string[]): WorkflowResult {
  const result = spawnSync(
    process.execPath,
    ["--disable-warning=ExperimentalWarning", cliPath.pathname, ...arguments_],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /^\{[^\n]+\}\n$/);
  return JSON.parse(result.stdout) as WorkflowResult;
}

function databaseSummary(databasePath: string): {
  readonly schemaVersion: number;
  readonly objects: number;
  readonly events: number;
  readonly receipts: number;
} {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return {
      schemaVersion: (database.prepare(
        "SELECT schema_version AS value FROM cognition_schema WHERE singleton = 1",
      ).get() as { readonly value: number }).value,
      objects: (database.prepare(
        "SELECT COUNT(*) AS value FROM cognition_objects",
      ).get() as { readonly value: number }).value,
      events: (database.prepare(
        "SELECT COUNT(*) AS value FROM cognition_events",
      ).get() as { readonly value: number }).value,
      receipts: (database.prepare(
        "SELECT COUNT(*) AS value FROM cognition_workflows",
      ).get() as { readonly value: number }).value,
    };
  } finally {
    database.close();
  }
}

async function verifyReopenedRecords(
  databasePath: string,
  records: readonly MarkdownCognitionRecord[],
): Promise<void> {
  const [initialHypothesis, evidence, reviewedHypothesis, event] = records;
  assert.ok(initialHypothesis?.recordType === "cognitive-object");
  assert.ok(evidence?.recordType === "cognitive-object");
  assert.ok(reviewedHypothesis?.recordType === "cognitive-object");
  assert.ok(event?.recordType === "cognition-event");
  const reopened = new SqliteCognitionWorkflowStore({ databasePath });
  try {
    assert.deepEqual(
      await reopened.getObjectVersion(initialHypothesis.payload.id, 1),
      initialHypothesis,
    );
    assert.deepEqual(
      await reopened.getObjectVersion(evidence.payload.id, 1),
      evidence,
    );
    assert.deepEqual(
      await reopened.getObjectVersion(reviewedHypothesis.payload.id, 2),
      reviewedHypothesis,
    );
    assert.deepEqual(
      await reopened.listObjectEvents(reviewedHypothesis.payload.id),
      [event],
    );
  } finally {
    reopened.close();
  }
}

const temporaryRoot = mkdtempSync(
  join(tmpdir(), "ccsdk-durable-workflow-example-"),
);

try {
  const root = realpathSync(temporaryRoot);
  const requestPath = join(root, "request.json");
  const inputPath = join(root, "records.jsonl");
  const databasePath = join(root, "cognition.db");
  const markdownTarget = join(root, "markdown");
  writeFileSync(requestPath, JSON.stringify(sourceNeutralRequest()));
  writeFileSync(inputPath, `${JSON.stringify(sourceNeutralRecord())}\n`);
  await initializeMarkdownCognitionTarget({ targetDirectory: markdownTarget });

  const baseArguments = [
    "run",
    "--request", requestPath,
    "--input", inputPath,
    "--format", "jsonl",
    "--cognition-db", databasePath,
    "--markdown-target", markdownTarget,
  ];
  const first = runCli([...baseArguments, "--create-cognition-db"]);
  assert.equal(first.status, "committed");
  assert.equal(first.persistence, "committed");
  assert.equal(first.publication, "not_requested");
  assert.equal(first.projection, "projected");
  assert.equal(first.records.length, 4);

  await verifyReopenedRecords(databasePath, first.records);
  const persisted = databaseSummary(databasePath);
  assert.deepEqual(persisted, {
    schemaVersion: 2,
    objects: 3,
    events: 1,
    receipts: 1,
  });

  const replay = runCli(baseArguments);
  assert.equal(replay.status, "committed");
  assert.equal(replay.persistence, "already_committed");
  assert.equal(replay.publication, "not_requested");
  assert.equal(replay.projection, "unchanged");
  assert.deepEqual(replay.records, first.records);
  assert.deepEqual(databaseSummary(databasePath), persisted);

  const verification = await verifyMarkdownCognitionTarget({
    targetDirectory: markdownTarget,
  });
  assert.equal(verification.status, "passed");

  console.log(JSON.stringify({
    workflowId: first.workflowId,
    schemaVersion: persisted.schemaVersion,
    firstPersistence: first.persistence,
    replayPersistence: replay.persistence,
    publication: replay.publication,
    firstProjection: first.projection,
    replayProjection: replay.projection,
    objects: persisted.objects,
    events: persisted.events,
    receipts: persisted.receipts,
    markdownVerification: verification.status,
  }));
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
