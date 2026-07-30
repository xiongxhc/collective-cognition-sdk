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

function managedTree(root: string): ReadonlyMap<string, Buffer> {
  const result = new Map<string, Buffer>();
  const visit = (directory: string): void => {
    for (const name of readdirSync(directory).sort()) {
      const absolute = join(directory, name);
      const path = relative(root, absolute).split("\\").join("/");
      const entry = statSync(absolute);
      if (entry.isDirectory()) visit(absolute);
      else result.set(path, readFileSync(absolute));
    }
  };
  visit(root);
  return result;
}

function changedManagedPaths(
  before: ReadonlyMap<string, Buffer>,
  after: ReadonlyMap<string, Buffer>,
): readonly string[] {
  return [...new Set([...before.keys(), ...after.keys()])]
    .filter((path) => !before.get(path)?.equals(after.get(path) ?? Buffer.alloc(0)))
    .sort();
}

function wikiLinks(markdown: string): readonly string[] {
  return [...markdown.matchAll(/\[\[([^|\]]+)(?:\|[^\]]+)?\]\]/g)]
    .map((match) => match[1]!);
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
    const lowerVersionSource = structuredClone(records.find((record) =>
      record.recordType === "cognitive-object" && record.payload.type === "evidence"
    )!) as MarkdownCognitionRecord;
    if (lowerVersionSource.recordType !== "cognitive-object") throw new Error("fixture mismatch");
    (lowerVersionSource.payload as { id: string }).id = "evidence:lower-version-source";
    (lowerVersionSource.payload as { title: string }).title = "Lower-version evidence source";
    (lowerVersionSource.payload as { version: number }).version = 1;
    records.push(lowerVersionSource);
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
    const latestObjects = [...latestByObject.values()].filter(
      (record): record is Extract<MarkdownCognitionRecord, { recordType: "cognitive-object" }> =>
        record.recordType === "cognitive-object",
    );
    const byType = new Map(latestObjects.map((record) => [record.payload.type, record]));
    const goal = byType.get("goal")!;
    const hypothesis = byType.get("hypothesis")!;
    const evidence = latestObjects.find((record) => record.payload.id === "evidence:loop")!;
    const decision = byType.get("decision")!;
    const objectAnchor = (objectId: string): string =>
      `Index#^cc-object-${createHash("sha256").update(objectId, "utf8").digest("hex")}`;
    assert.ok(
      wikiLinks(readFileSync(
        join(vault.cognitionTarget, markdownCognitionRelativePath(lowerVersionSource)),
        "utf8",
      )).includes(objectAnchor(hypothesis.payload.id)),
    );
    const inverseResolvedLinks = new Map<string, string[]>();
    for (const record of [hypothesis, evidence, decision]) {
      const sourcePath = markdownCognitionRelativePath(record);
      for (const target of wikiLinks(readFileSync(join(vault.cognitionTarget, sourcePath), "utf8"))) {
        const [targetPath, block] = target.split("#^");
        assert.equal(targetPath, "Index");
        assert.match(index, new RegExp(`\\^${block}$`, "m"));
        const sources = inverseResolvedLinks.get(target) ?? [];
        sources.push(sourcePath);
        inverseResolvedLinks.set(target, sources);
      }
    }
    assert.ok(inverseResolvedLinks.get(objectAnchor(goal.payload.id))?.includes(markdownCognitionRelativePath(hypothesis)));
    assert.ok(inverseResolvedLinks.get(objectAnchor(hypothesis.payload.id))?.includes(markdownCognitionRelativePath(evidence)));
    assert.ok(inverseResolvedLinks.get(objectAnchor(evidence.payload.id))?.includes(markdownCognitionRelativePath(decision)));
    const managedPaths = [...first.created, MARKDOWN_COGNITION_MANIFEST_FILE].sort();
    const mtimes = managedPaths.map((path) => `${path}:${statSync(join(vault.cognitionTarget, path)).mtimeMs}`);
    const second = await projectMarkdownCognition({ targetDirectory: vault.cognitionTarget, records: [...records].reverse() });
    assert.deepEqual(second.created, []);
    assert.deepEqual(
      managedPaths.map((path) => `${path}:${statSync(join(vault.cognitionTarget, path)).mtimeMs}`),
      mtimes,
    );

    const successor = structuredClone(records.find((record) =>
      record.recordType === "cognitive-object" &&
      record.payload.id === "hypothesis:loop" &&
      record.payload.version === 3,
    )!) as MarkdownCognitionRecord;
    if (successor.recordType !== "cognitive-object") throw new Error("fixture mismatch");
    (successor.payload as { version: number }).version += 1;
    (successor.payload as { title: string }).title = "Renamed referenced successor";
    (successor.payload as { updatedAt: string }).updatedAt = "2026-07-30T00:00:00Z";
    const beforeSuccessor = managedTree(vault.cognitionTarget);
    const successorReport = await projectMarkdownCognition({
      targetDirectory: vault.cognitionTarget,
      records: [...records, successor],
    });
    assert.deepEqual(successorReport.created, [markdownCognitionRelativePath(successor)]);
    assert.ok(successorReport.updated.includes("Index.md"));
    const afterSuccessor = managedTree(vault.cognitionTarget);
    assert.deepEqual(changedManagedPaths(beforeSuccessor, afterSuccessor), [
      MARKDOWN_COGNITION_MANIFEST_FILE,
      "Index.md",
      markdownCognitionRelativePath(successor),
    ].sort());
    const successorIndex = readFileSync(join(vault.cognitionTarget, "Index.md"), "utf8");
    assert.match(
      successorIndex,
      new RegExp(
        `\\[\\[${markdownCognitionRelativePath(successor).slice(0, -3)}\\|Renamed referenced successor\\]\\].*\\^cc-object-${createHash("sha256").update(successor.payload.id, "utf8").digest("hex")}`,
      ),
    );
    const changedBytes = changedManagedPaths(beforeSuccessor, afterSuccessor).reduce(
      (total, path) =>
        total + (beforeSuccessor.get(path)?.length ?? 0) + (afterSuccessor.get(path)?.length ?? 0),
      0,
    );
    assert.ok(changedBytes > 0 && changedBytes < 128 * 1024);

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
