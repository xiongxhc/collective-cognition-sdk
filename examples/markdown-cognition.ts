import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";

import {
  createObject,
  createPortableCognitionRecord,
} from "../src/index.ts";
import {
  initializeMarkdownCognitionTarget,
  markdownCognitionRelativePath,
  parseMarkdownCognitionRecord,
  projectMarkdownCognition,
  verifyMarkdownCognitionTarget,
} from "../src/markdown-cognition.ts";
import type { MarkdownCognitionRecord } from "../src/markdown-cognition.ts";

const createdAt = "2026-07-30T10:00:00.000Z";
const contextId = "organization:example-collective";
const attribution = {
  initiatorId: "human:example-owner",
  executorId: "agent:example-projector",
  accountableId: "human:example-owner",
};

function provenance(sourceId: string) {
  return [{
    source: "markdown-cognition-example",
    sourceId,
    capturedAt: createdAt,
  }];
}

const goal = createObject({
  id: "goal:example-portable-projection",
  type: "goal",
  version: 1,
  state: "draft",
  title: "Make shared reasoning reviewable",
  data: {
    objective: "Project governed cognition into a readable, reproducible directory.",
  },
  createdAt,
  updatedAt: createdAt,
  attribution,
  provenance: provenance("goal"),
  contextId,
  relationships: [],
});

const hypothesis = createObject({
  id: "hypothesis:example-markdown-projection",
  type: "hypothesis",
  version: 1,
  state: "proposed",
  title: "Deterministic notes improve review",
  data: {
    statement: "A deterministic projection makes governed cognition easier to inspect without becoming its source of truth.",
  },
  createdAt,
  updatedAt: createdAt,
  attribution,
  provenance: provenance("hypothesis"),
  contextId,
  relationships: [{ type: "supports-goal", targetId: goal.id }],
});

const records: readonly MarkdownCognitionRecord[] = [
  createPortableCognitionRecord({
    schemaVersion: "0.1.0",
    recordType: "cognitive-object",
    payload: goal,
  }) as MarkdownCognitionRecord,
  createPortableCognitionRecord({
    schemaVersion: "0.1.0",
    recordType: "cognitive-object",
    payload: hypothesis,
  }) as MarkdownCognitionRecord,
];

const root = realpathSync(mkdtempSync(join(tmpdir(), "ccsdk-markdown-example-")));

try {
  const targetDirectory = join(root, "Collective Cognition");
  await initializeMarkdownCognitionTarget({ targetDirectory });
  await projectMarkdownCognition({ targetDirectory, records });

  const parsed = parseMarkdownCognitionRecord(
    readFileSync(join(targetDirectory, markdownCognitionRelativePath(records[0]!)), "utf8"),
  );
  const secondRun = await projectMarkdownCognition({ targetDirectory, records });
  const verification = await verifyMarkdownCognitionTarget({ targetDirectory });

  console.log(JSON.stringify({
    firstRunRecordCount: records.length,
    roundTripEqual: isDeepStrictEqual(parsed, records[0]!),
    secondRunUpdated: secondRun.updated.length,
    verification: verification.status,
  }));
} finally {
  rmSync(root, { recursive: true, force: true });
}
