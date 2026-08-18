import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  createObject,
  createSourceRecord,
} from "../src/index.ts";
import {
  MARKDOWN_COGNITION_MARKER_FILE,
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

function defensiveModeIsEnforced(): boolean {
  let database: DatabaseSync | undefined;
  try {
    database = new DatabaseSync(":memory:", {
      allowExtension: false,
      defensive: true,
      enableDoubleQuotedStringLiterals: false,
      enableForeignKeyConstraints: true,
    });
    if (typeof database.enableDefensive !== "function") return false;
    database.enableDefensive(true);
    database.exec("PRAGMA writable_schema = ON");
    const result = database.prepare("PRAGMA writable_schema").get() as {
      readonly writable_schema?: unknown;
    };
    return result.writable_schema === 0;
  } catch {
    return false;
  } finally {
    if (database?.isOpen) database.close();
  }
}

const sqliteTest = defensiveModeIsEnforced() ? test : test.skip;

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

function workflowDatabaseSummary(databasePath: string): {
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

function filesBelow(root: string): string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)))
    .sort();
}

function stableFileMetadata(root: string): readonly Record<string, unknown>[] {
  return filesBelow(root).map((relativePath) => {
    const metadata = statSync(join(root, relativePath), { bigint: true });
    return {
      relativePath,
      modifiedAtNanoseconds: metadata.mtimeNs,
      size: metadata.size,
    };
  });
}

sqliteTest(
  "recovers an incompatible Markdown projection after exact SQLite reopen replay",
  async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "ccsdk-workflow-markdown-")));
    try {
      const requestPath = join(root, "request.json");
      const inputPath = join(root, "records.jsonl");
      const databasePath = join(root, "cognition.db");
      const markdownTarget = join(root, "markdown");
      writeFileSync(requestPath, JSON.stringify(sourceNeutralRequest()));
      writeFileSync(inputPath, `${JSON.stringify(sourceNeutralRecord())}\n`);
      await initializeMarkdownCognitionTarget({ targetDirectory: markdownTarget });
      const markerPath = join(markdownTarget, MARKDOWN_COGNITION_MARKER_FILE);
      const marker = JSON.parse(readFileSync(markerPath, "utf8")) as {
        format: string;
      };
      marker.format = "collective-cognition-markdown-target/0";
      writeFileSync(markerPath, JSON.stringify(marker));
      const incompatibleVerification = await verifyMarkdownCognitionTarget({
        targetDirectory: markdownTarget,
      });
      assert.equal(incompatibleVerification.status, "failed");
      assert.ok(incompatibleVerification.diagnostics.some(
        (diagnostic) => diagnostic.code === "incompatible_target",
      ));
      const incompatibleFiles = filesBelow(markdownTarget).map((relativePath) => ({
        relativePath,
        contents: readFileSync(join(markdownTarget, relativePath)),
      }));

      const baseArguments = [
        "run",
        "--request", requestPath,
        "--input", inputPath,
        "--format", "jsonl",
        "--cognition-db", databasePath,
        "--markdown-target", markdownTarget,
      ];
      const first = runCli([...baseArguments, "--create-cognition-db"]);

      assert.equal(first.status, "committed_but_unprojected");
      assert.equal(first.persistence, "committed");
      assert.equal(first.publication, "not_requested");
      assert.equal(first.projection, "failed");
      assert.deepEqual(
        filesBelow(markdownTarget).map((relativePath) => ({
          relativePath,
          contents: readFileSync(join(markdownTarget, relativePath)),
        })),
        incompatibleFiles,
      );
      assert.deepEqual(workflowDatabaseSummary(databasePath), {
        schemaVersion: 2,
        objects: 3,
        events: 1,
        receipts: 1,
      });

      const [initialHypothesis, evidence, reviewedHypothesis, event] = first.records;
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

      rmSync(markdownTarget, { recursive: true, force: true });
      await initializeMarkdownCognitionTarget({ targetDirectory: markdownTarget });
      const recovered = runCli(baseArguments);
      assert.equal(recovered.status, "committed");
      assert.equal(recovered.persistence, "already_committed");
      assert.equal(recovered.publication, "not_requested");
      assert.equal(recovered.projection, "projected");
      assert.deepEqual(recovered.records, first.records);
      assert.deepEqual(workflowDatabaseSummary(databasePath), {
        schemaVersion: 2,
        objects: 3,
        events: 1,
        receipts: 1,
      });
      assert.equal(
        (await verifyMarkdownCognitionTarget({ targetDirectory: markdownTarget })).status,
        "passed",
      );

      const oldTimestamp = new Date("2000-01-01T00:00:00.000Z");
      for (const relativePath of filesBelow(markdownTarget)) {
        utimesSync(join(markdownTarget, relativePath), oldTimestamp, oldTimestamp);
      }
      const beforeReplay = stableFileMetadata(markdownTarget);
      const unchanged = runCli(baseArguments);
      assert.equal(unchanged.status, "committed");
      assert.equal(unchanged.persistence, "already_committed");
      assert.equal(unchanged.publication, "not_requested");
      assert.equal(unchanged.projection, "unchanged");
      assert.deepEqual(unchanged.records, first.records);
      assert.deepEqual(stableFileMetadata(markdownTarget), beforeReplay);
      assert.deepEqual(workflowDatabaseSummary(databasePath), {
        schemaVersion: 2,
        objects: 3,
        events: 1,
        receipts: 1,
      });
      assert.equal(
        (await verifyMarkdownCognitionTarget({ targetDirectory: markdownTarget })).status,
        "passed",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
