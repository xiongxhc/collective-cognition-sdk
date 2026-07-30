import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test from "node:test";

import {
  MARKDOWN_COGNITION_MANIFEST_FILE,
  MarkdownCognitionError,
  initializeMarkdownCognitionTarget,
  markdownCognitionRelativePath,
  parseMarkdownCognitionRecord,
  projectMarkdownCognition,
  verifyMarkdownCognitionTarget,
} from "../src/markdown-cognition.ts";
import type { MarkdownCognitionRecord } from "../src/markdown-cognition.ts";

const fixtureUrl = new URL(
  "./fixtures/markdown-cognition/0.1.0/records.jsonl",
  import.meta.url,
);

function completeCognitiveLoopRecords(): MarkdownCognitionRecord[] {
  return readFileSync(fixtureUrl, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as MarkdownCognitionRecord);
}

function writeTree(root: string, files: Readonly<Record<string, string>>): void {
  for (const [path, contents] of Object.entries(files)) {
    const destination = join(root, path);
    mkdirSync(join(destination, ".."), { recursive: true });
    writeFileSync(destination, contents);
  }
}

function hashTreeExcluding(root: string, excluded: readonly string[]): readonly string[] {
  const result: string[] = [];
  const visit = (directory: string): void => {
    for (const name of readdirSync(directory).sort()) {
      const absolute = join(directory, name);
      const path = relative(root, absolute).split("\\").join("/");
      if (excluded.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) continue;
      const entry = statSync(absolute);
      if (entry.isDirectory()) visit(absolute);
      else result.push(`${path}:${createHash("sha256").update(readFileSync(absolute)).digest("hex")}`);
    }
  };
  visit(root);
  return Object.freeze(result.sort());
}

function createTemporaryTeamVault(): { readonly cognitionTarget: string; readonly remove: () => void; readonly root: string } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ccsdk-team-vault-")));
  writeTree(root, {
    ".git/HEAD": "ref: refs/heads/master\n",
    ".obsidian/app.json": "{}\n",
    "Daily/2026-07-30.md": "# Daily\n",
    "People/Ada.md": "# Ada\n",
    "Projects/Atlas.md": "# Atlas\n",
  });
  return Object.freeze({
    cognitionTarget: join(root, "Collective Cognition"),
    remove: () => rmSync(root, { recursive: true, force: true }),
    root,
  });
}

test("projects only into an initialized team-vault subtree", async () => {
  const vault = createTemporaryTeamVault();
  const before = hashTreeExcluding(vault.root, ["Collective Cognition"]);
  try {
    const records = completeCognitiveLoopRecords();
    await initializeMarkdownCognitionTarget({ targetDirectory: vault.cognitionTarget });
    const first = await projectMarkdownCognition({ targetDirectory: vault.cognitionTarget, records });
    const verification = await verifyMarkdownCognitionTarget({ targetDirectory: vault.cognitionTarget });
    assert.equal(verification.status, "passed");
    assert.deepEqual(hashTreeExcluding(vault.root, ["Collective Cognition"]), before);
    assert.ok(first.created.includes("Index.md"));

    for (const record of records) {
      const markdown = readFileSync(join(vault.cognitionTarget, markdownCognitionRelativePath(record)), "utf8");
      assert.deepEqual(parseMarkdownCognitionRecord(markdown), record);
    }
    const index = readFileSync(join(vault.cognitionTarget, "Index.md"), "utf8");
    const latestByObject = new Map<string, MarkdownCognitionRecord>();
    for (const object of records.filter((record) => record.recordType === "cognitive-object")) {
      const existing = latestByObject.get(object.payload.id);
      if (existing === undefined || (existing.recordType === "cognitive-object" && existing.payload.version < object.payload.version)) {
        latestByObject.set(object.payload.id, object);
      }
    }
    for (const object of latestByObject.values()) {
      assert.match(index, new RegExp(markdownCognitionRelativePath(object).slice(0, -3).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    const managedPaths = [...first.created, MARKDOWN_COGNITION_MANIFEST_FILE].sort();
    const mtimes = managedPaths.map((path) => `${path}:${statSync(join(vault.cognitionTarget, path)).mtimeMs}`);
    const second = await projectMarkdownCognition({ targetDirectory: vault.cognitionTarget, records: [...records].reverse() });
    assert.deepEqual(second.created, []);
    assert.deepEqual(
      managedPaths.map((path) => `${path}:${statSync(join(vault.cognitionTarget, path)).mtimeMs}`),
      mtimes,
    );

    const successor = structuredClone(records.find((record) =>
      record.recordType === "cognitive-object" && record.payload.type === "hypothesis",
    )!) as MarkdownCognitionRecord;
    if (successor.recordType !== "cognitive-object") throw new Error("fixture mismatch");
    (successor.payload as { version: number }).version += 10;
    (successor.payload as { updatedAt: string }).updatedAt = "2026-07-30T00:00:00Z";
    const successorReport = await projectMarkdownCognition({
      targetDirectory: vault.cognitionTarget,
      records: [...records, successor],
    });
    assert.deepEqual(successorReport.created, [markdownCognitionRelativePath(successor)]);
    assert.ok(successorReport.updated.includes("Index.md"));

    const path = markdownCognitionRelativePath(records[0]!);
    writeFileSync(join(vault.cognitionTarget, path), "manual change\n");
    await assert.rejects(
      () => projectMarkdownCognition({ targetDirectory: vault.cognitionTarget, records: [...records, successor] }),
      (error: unknown) => error instanceof MarkdownCognitionError && error.code === "managed_file_conflict",
    );
    assert.equal(readFileSync(join(vault.cognitionTarget, path), "utf8"), "manual change\n");
  } finally {
    vault.remove();
  }
});
