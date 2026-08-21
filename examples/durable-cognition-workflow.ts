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
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  createObject,
  createSourceRecord,
  neutralEvidencePolicyV1,
  serializePortableCognitionRecord,
} from "../src/index.ts";
import {
  initializeMarkdownCognitionTarget,
  verifyMarkdownCognitionTarget,
} from "../src/markdown-cognition.ts";
import type { MarkdownCognitionRecord } from "../src/markdown-cognition.ts";
import { prepareDurableCognitionWorkflow } from "../src/workflows/durable.ts";
import type {
  DurableCognitionWorkflowRequest,
  PreparedDurableCognitionCommit,
} from "../src/workflows/durable.ts";

const cliPath = fileURLToPath(new URL("../src/workflow-cli.ts", import.meta.url));
const unsupportedRuntimeSummary =
  '{"status":"skipped","reason":"unsupported_runtime"}\n';

interface WorkflowResult {
  readonly status: string;
  readonly persistence: string;
  readonly publication: string;
  readonly projection: string;
  readonly workflowId: string;
  readonly records: readonly MarkdownCognitionRecord[];
}

interface SourceNeutralFixture {
  readonly request: DurableCognitionWorkflowRequest;
  readonly serializedRequest: Record<string, unknown>;
}

export interface DurableCognitionWorkflowExampleOptions {
  readonly temporaryParent?: string;
  readonly afterTemporaryRootCreated?: (temporaryRoot: string) => void;
}

function sourceNeutralFixture(): SourceNeutralFixture {
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
  const record = createSourceRecord({
    id: "source-record:durable-workflow-example:1",
    source: { system: "source-neutral-example" },
    sourceId: "example:record:1",
    revisionId: "1",
    capturedAt: "2026-08-13T09:00:00.000Z",
    mediaType: "application/json",
    content: { summary: "The explicit evidence is available for review." },
  });
  const request: DurableCognitionWorkflowRequest = {
    workflowVersion: "0.1.0",
    workflowId: "workflow:durable-workflow-example:1",
    records: [record],
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
    policy: neutralEvidencePolicyV1,
  };
  return {
    request,
    serializedRequest: {
      workflowVersion: request.workflowVersion,
      workflowId: request.workflowId,
      hypothesis: request.hypothesis,
      promotion: request.promotion,
      reviewTransition: request.reviewTransition,
      policyId: "neutral-evidence-v1",
    },
  };
}

function runCli(arguments_: readonly string[]): WorkflowResult {
  const result = spawnSync(
    process.execPath,
    ["--disable-warning=ExperimentalWarning", cliPath, ...arguments_],
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

function expectedObjectRows(
  prepared: PreparedDurableCognitionCommit,
): readonly Record<string, unknown>[] {
  return [
    prepared.initialHypothesis,
    prepared.evidence,
    prepared.reviewedHypothesis,
  ].map((record) => ({
    object_id: record.payload.id,
    object_version: record.payload.version,
    object_type: record.payload.type,
    record_json: serializePortableCognitionRecord(record),
  })).sort((left, right) =>
    String(left.object_id).localeCompare(String(right.object_id)) ||
    Number(left.object_version) - Number(right.object_version)
  );
}

function verifyReopenedRecords(
  databasePath: string,
  prepared: PreparedDurableCognitionCommit,
): void {
  const reopened = new DatabaseSync(databasePath, { readOnly: true });
  try {
    assert.deepEqual(reopened.prepare(`
      SELECT object_id, object_version, object_type, record_json
      FROM cognition_objects
      ORDER BY object_id, object_version
    `).all().map((row) => ({ ...row })), expectedObjectRows(prepared));
    assert.deepEqual(reopened.prepare(`
      SELECT event_id, object_id, object_version, record_json
      FROM cognition_events
      ORDER BY event_id
    `).all().map((row) => ({ ...row })), [{
      event_id: prepared.event.payload.id,
      object_id: prepared.event.payload.objectId,
      object_version: prepared.event.payload.objectVersion,
      record_json: serializePortableCognitionRecord(prepared.event),
    }]);
    assert.deepEqual(reopened.prepare(`
      SELECT
        workflow_id,
        request_digest,
        initial_hypothesis_id,
        evidence_id,
        reviewed_hypothesis_version,
        event_id
      FROM cognition_workflows
      ORDER BY workflow_id
    `).all().map((row) => ({ ...row })), [{
      workflow_id: prepared.workflowId,
      request_digest: prepared.requestDigest,
      initial_hypothesis_id: prepared.initialHypothesis.payload.id,
      evidence_id: prepared.evidence.payload.id,
      reviewed_hypothesis_version: prepared.reviewedHypothesis.payload.version,
      event_id: prepared.event.payload.id,
    }]);
  } finally {
    reopened.close();
  }
}

export async function runDurableCognitionWorkflowExample(
  options: DurableCognitionWorkflowExampleOptions = {},
): Promise<void> {
  if (typeof DatabaseSync.prototype.enableDefensive !== "function") {
    process.stdout.write(unsupportedRuntimeSummary);
    return;
  }
  const temporaryRoot = mkdtempSync(join(
    options.temporaryParent ?? tmpdir(),
    "ccsdk-durable-workflow-example-",
  ));
  try {
    options.afterTemporaryRootCreated?.(temporaryRoot);
    const root = realpathSync.native(temporaryRoot);
    const requestPath = join(root, "request.json");
    const inputPath = join(root, "records.jsonl");
    const databasePath = join(root, "cognition.db");
    const markdownTarget = join(root, "markdown");
    const fixture = sourceNeutralFixture();
    const expected = prepareDurableCognitionWorkflow(fixture.request);
    const expectedRecords = [
      expected.initialHypothesis,
      expected.evidence,
      expected.reviewedHypothesis,
      expected.event,
    ];
    writeFileSync(requestPath, JSON.stringify(fixture.serializedRequest));
    writeFileSync(
      inputPath,
      `${fixture.request.records.map((record) => JSON.stringify(record)).join("\n")}\n`,
    );
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
    assert.deepEqual(first.records, expectedRecords);

    verifyReopenedRecords(databasePath, expected);
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
    assert.deepEqual(replay.records, expectedRecords);
    assert.deepEqual(databaseSummary(databasePath), persisted);
    verifyReopenedRecords(databasePath, expected);

    const verification = await verifyMarkdownCognitionTarget({
      targetDirectory: markdownTarget,
    });
    assert.equal(verification.status, "passed");

    process.stdout.write(`${JSON.stringify({
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
    })}\n`);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await runDurableCognitionWorkflowExample();
}
