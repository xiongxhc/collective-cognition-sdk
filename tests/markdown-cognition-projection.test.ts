import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  lstatSync,
  linkSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { setMarkdownCognitionTargetTestHook } from "../src/markdown-cognition-target.ts";
import {
  MARKDOWN_COGNITION_MANIFEST_FILE,
  MarkdownCognitionError,
  initializeMarkdownCognitionTarget,
  markdownCognitionRelativePath,
  projectMarkdownCognition,
} from "../src/markdown-cognition.ts";
import type { MarkdownCognitionRecord } from "../src/markdown-cognition.ts";

const fixtureUrl = new URL(
  "./fixtures/markdown-cognition/0.1.0/records.jsonl",
  import.meta.url,
);

function fixtureRecords(): MarkdownCognitionRecord[] {
  return readFileSync(fixtureUrl, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as MarkdownCognitionRecord);
}

function temporaryInitializedTarget(): { readonly root: string; readonly target: string; readonly remove: () => void } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ccsdk-markdown-projection-")));
  const target = join(root, "Collective Cognition");
  return {
    remove: () => rmSync(root, { recursive: true, force: true }),
    root,
    target,
  };
}

function managedStats(target: string, paths: readonly string[]): readonly string[] {
  return paths.map((relativePath) => {
    const entry = statSync(join(target, relativePath));
    return `${relativePath}:${entry.mtimeMs}:${entry.size}`;
  });
}

function digest(contents: Buffer): string {
  return createHash("sha256").update(contents).digest("hex");
}

test.afterEach(() => {
  setMarkdownCognitionTargetTestHook(undefined);
});

test("projects records deterministically and preserves identical replay mtimes", async () => {
  const fixture = temporaryInitializedTarget();
  try {
    await initializeMarkdownCognitionTarget({ targetDirectory: fixture.target });
    const records = fixtureRecords();
    const first = await projectMarkdownCognition({ targetDirectory: fixture.target, records });
    assert.ok(first.created.length > 0);
    assert.deepEqual(first.updated, []);
    const paths = [...first.created, "Index.md", MARKDOWN_COGNITION_MANIFEST_FILE].sort();
    const before = managedStats(fixture.target, paths);

    const second = await projectMarkdownCognition({
      targetDirectory: fixture.target,
      records: [...records].reverse(),
    });
    assert.deepEqual(second.created, []);
    assert.deepEqual(second.updated, []);
    assert.deepEqual(second.pruned, []);
    assert.deepEqual(managedStats(fixture.target, paths), before);
    assert.equal(Object.isFrozen(second), true);
    assert.equal(Object.isFrozen(second.unchanged), true);
  } finally {
    fixture.remove();
  }
});

test("fails on changed immutable identities before any write", async () => {
  const fixture = temporaryInitializedTarget();
  try {
    await initializeMarkdownCognitionTarget({ targetDirectory: fixture.target });
    const records = fixtureRecords();
    const original = records.find((record) => record.recordType === "cognitive-object")!;
    const conflicting = structuredClone(original) as MarkdownCognitionRecord;
    if (conflicting.recordType !== "cognitive-object") throw new Error("fixture mismatch");
    (conflicting.payload as { title: string }).title = "Conflicting immutable identity";
    await assert.rejects(
      () => projectMarkdownCognition({
        targetDirectory: fixture.target,
        records: [...records, conflicting],
      }),
      (error: unknown) => error instanceof MarkdownCognitionError && error.code === "invalid_projection_input",
    );
  } finally {
    fixture.remove();
  }
});

test("adopts exact unmanifested desired files but rejects mismatches", async () => {
  const fixture = temporaryInitializedTarget();
  try {
    await initializeMarkdownCognitionTarget({ targetDirectory: fixture.target });
    const [record] = fixtureRecords();
    if (record === undefined) throw new Error("missing fixture");
    const relativePath = markdownCognitionRelativePath(record);
    await projectMarkdownCognition({ targetDirectory: fixture.target, records: [record] });
    const desired = readFileSync(join(fixture.target, relativePath));
    const manifest = readFileSync(join(fixture.target, MARKDOWN_COGNITION_MANIFEST_FILE), "utf8");
    rmSync(join(fixture.target, relativePath));
    writeFileSync(join(fixture.target, relativePath), desired);
    const parsedManifest = JSON.parse(manifest) as { entries: { relativePath: string }[] };
    parsedManifest.entries = parsedManifest.entries.filter((entry) => entry.relativePath !== relativePath);
    writeFileSync(join(fixture.target, MARKDOWN_COGNITION_MANIFEST_FILE), JSON.stringify({
      entries: parsedManifest.entries,
      format: "collective-cognition-markdown-manifest/1",
      profileVersion: "portable-cognition-markdown/0.1.0",
      targetId: JSON.parse(readFileSync(join(fixture.target, ".collective-cognition.json"), "utf8")).targetId,
    }));
    const adopted = await projectMarkdownCognition({ targetDirectory: fixture.target, records: [record] });
    assert.ok(adopted.unchanged.includes(relativePath));
    writeFileSync(join(fixture.target, relativePath), "not desired\n");
    const manifestAfterAdoption = readFileSync(join(fixture.target, MARKDOWN_COGNITION_MANIFEST_FILE));
    await assert.rejects(
      () => projectMarkdownCognition({ targetDirectory: fixture.target, records: [record] }),
      (error: unknown) => error instanceof MarkdownCognitionError && error.code === "managed_file_conflict",
    );
    assert.deepEqual(readFileSync(join(fixture.target, MARKDOWN_COGNITION_MANIFEST_FILE)), manifestAfterAdoption);
  } finally {
    fixture.remove();
  }
});

test("rejects manual managed edits without overwriting them", async () => {
  const fixture = temporaryInitializedTarget();
  try {
    await initializeMarkdownCognitionTarget({ targetDirectory: fixture.target });
    const [record] = fixtureRecords();
    if (record === undefined) throw new Error("missing fixture");
    const relativePath = markdownCognitionRelativePath(record);
    await projectMarkdownCognition({ targetDirectory: fixture.target, records: [record] });
    writeFileSync(join(fixture.target, relativePath), "manual edit\n");
    await assert.rejects(
      () => projectMarkdownCognition({ targetDirectory: fixture.target, records: [record] }),
      (error: unknown) =>
        error instanceof MarkdownCognitionError &&
        error.code === "managed_file_conflict" &&
        error.relativePath === relativePath &&
        !error.message.includes(fixture.target),
    );
    assert.equal(readFileSync(join(fixture.target, relativePath), "utf8"), "manual edit\n");
  } finally {
    fixture.remove();
  }
});

test("prunes only unchanged stale managed files", async () => {
  const fixture = temporaryInitializedTarget();
  try {
    await initializeMarkdownCognitionTarget({ targetDirectory: fixture.target });
    const records = fixtureRecords();
    const first = await projectMarkdownCognition({ targetDirectory: fixture.target, records });
    const stale = first.created[0]!;
    const remaining = records.filter((record) => markdownCognitionRelativePath(record) !== stale);
    const preserved = await projectMarkdownCognition({ targetDirectory: fixture.target, records: remaining });
    assert.ok(preserved.unchanged.includes(stale));
    assert.equal(lstatSync(join(fixture.target, stale)).isFile(), true);
    const pruned = await projectMarkdownCognition({
      targetDirectory: fixture.target,
      records: remaining,
      pruneManaged: true,
    });
    assert.deepEqual(pruned.pruned, [stale]);
    assert.throws(() => lstatSync(join(fixture.target, stale)), { code: "ENOENT" });
  } finally {
    fixture.remove();
  }
});

test("reports a fixed limit error before target mutation", async () => {
  const fixture = temporaryInitializedTarget();
  try {
    await initializeMarkdownCognitionTarget({ targetDirectory: fixture.target });
    const records = fixtureRecords();
    const before = readFileSync(join(fixture.target, MARKDOWN_COGNITION_MANIFEST_FILE));
    await assert.rejects(
      () => projectMarkdownCognition({
        targetDirectory: fixture.target,
        records: Array.from({ length: 10_001 }, () => records[0]!),
      }),
      (error: unknown) => error instanceof MarkdownCognitionError && error.code === "projection_limit_exceeded",
    );
    const manifest = readFileSync(join(fixture.target, MARKDOWN_COGNITION_MANIFEST_FILE));
    assert.equal(digest(manifest), digest(before));
  } finally {
    fixture.remove();
  }
});

test("aborts every write during preflight conflicts", async () => {
  const fixture = temporaryInitializedTarget();
  try {
    await initializeMarkdownCognitionTarget({ targetDirectory: fixture.target });
    const records = fixtureRecords();
    await projectMarkdownCognition({ targetDirectory: fixture.target, records });
    const changed = structuredClone(records.find((record) => record.recordType === "cognitive-object")!) as MarkdownCognitionRecord;
    if (changed.recordType !== "cognitive-object") throw new Error("fixture mismatch");
    (changed.payload as { version: number }).version += 10;
    (changed.payload as { updatedAt: string }).updatedAt = "2026-07-30T00:00:00Z";
    const changedPath = markdownCognitionRelativePath(changed);
    const manualPath = markdownCognitionRelativePath(records[0]!);
    writeFileSync(join(fixture.target, manualPath), "manual change\n");
    await assert.rejects(
      () => projectMarkdownCognition({ targetDirectory: fixture.target, records: [...records, changed] }),
      (error: unknown) => error instanceof MarkdownCognitionError && error.code === "managed_file_conflict",
    );
    assert.throws(() => lstatSync(join(fixture.target, changedPath)), { code: "ENOENT" });
  } finally {
    fixture.remove();
  }
});

test("converges after manifest failure following an update", async () => {
  const fixture = temporaryInitializedTarget();
  try {
    await initializeMarkdownCognitionTarget({ targetDirectory: fixture.target });
    const records = fixtureRecords();
    await projectMarkdownCognition({ targetDirectory: fixture.target, records });
    const successor = structuredClone(records.find((record) =>
      record.recordType === "cognitive-object" && record.payload.type === "principle" &&
      record.payload.version === 3
    )!) as MarkdownCognitionRecord;
    if (successor.recordType !== "cognitive-object") throw new Error("fixture mismatch");
    (successor.payload as { version: number }).version += 1;
    (successor.payload as { updatedAt: string }).updatedAt = "2026-07-30T00:00:00Z";
    const desired = [...records, successor];
    const replacements: string[] = [];
    setMarkdownCognitionTargetTestHook((event, relativePath) => {
      if (event !== "projection:before-replace" || relativePath === undefined) return;
      replacements.push(relativePath);
      if (relativePath === MARKDOWN_COGNITION_MANIFEST_FILE) {
        throw new Error("injected manifest replacement failure");
      }
    });
    await assert.rejects(
      () => projectMarkdownCognition({ targetDirectory: fixture.target, records: desired }),
      (error: unknown) => error instanceof MarkdownCognitionError && error.code === "projection_io_failed",
    );
    assert.ok(replacements.indexOf("Index.md") < replacements.indexOf(MARKDOWN_COGNITION_MANIFEST_FILE));
    setMarkdownCognitionTargetTestHook(undefined);
    const retry = await projectMarkdownCognition({ targetDirectory: fixture.target, records: desired });
    assert.deepEqual(retry.updated, []);
    assert.ok(retry.unchanged.includes("Index.md"));
  } finally {
    fixture.remove();
  }
});

test("converges after manifest failure following a prune", async () => {
  const fixture = temporaryInitializedTarget();
  try {
    await initializeMarkdownCognitionTarget({ targetDirectory: fixture.target });
    const records = fixtureRecords();
    const first = await projectMarkdownCognition({ targetDirectory: fixture.target, records });
    const stale = first.created.find((path) => path !== "Index.md")!;
    const remaining = records.filter((record) => markdownCognitionRelativePath(record) !== stale);
    setMarkdownCognitionTargetTestHook((event, relativePath) => {
      if (event === "projection:before-replace" && relativePath === MARKDOWN_COGNITION_MANIFEST_FILE) {
        throw new Error("injected manifest replacement failure");
      }
    });
    await assert.rejects(
      () => projectMarkdownCognition({
        targetDirectory: fixture.target,
        pruneManaged: true,
        records: remaining,
      }),
      (error: unknown) => error instanceof MarkdownCognitionError && error.code === "projection_io_failed",
    );
    assert.throws(() => lstatSync(join(fixture.target, stale)), { code: "ENOENT" });
    setMarkdownCognitionTargetTestHook(undefined);
    const retry = await projectMarkdownCognition({
      targetDirectory: fixture.target,
      pruneManaged: true,
      records: remaining,
    });
    assert.deepEqual(retry.pruned, [stale]);
  } finally {
    fixture.remove();
  }
});

test("rejects inherited projection options and accepts null-prototype options", async () => {
  const fixture = temporaryInitializedTarget();
  try {
    await initializeMarkdownCognitionTarget({ targetDirectory: fixture.target });
    const records = fixtureRecords();
    const inherited = Object.assign(Object.create({ inherited: true }), {
      targetDirectory: fixture.target,
      records,
    }) as { targetDirectory: string; records: MarkdownCognitionRecord[] };
    await assert.rejects(
      () => projectMarkdownCognition(inherited),
      (error: unknown) => error instanceof MarkdownCognitionError && error.code === "invalid_projection_input",
    );
    const nullPrototype = Object.assign(Object.create(null), {
      targetDirectory: fixture.target,
      records,
    }) as { targetDirectory: string; records: MarkdownCognitionRecord[] };
    await assert.doesNotReject(() => projectMarkdownCognition(nullPrototype));
  } finally {
    fixture.remove();
  }
});

test("applies interleaved creates and updates in global path order", async () => {
  const fixture = temporaryInitializedTarget();
  try {
    await initializeMarkdownCognitionTarget({ targetDirectory: fixture.target });
    const records = fixtureRecords();
    await projectMarkdownCognition({ targetDirectory: fixture.target, records });
    const successor = structuredClone(records.find((record) =>
      record.recordType === "cognitive-object" && record.payload.type === "principle" &&
      record.payload.version === 3
    )!) as MarkdownCognitionRecord;
    if (successor.recordType !== "cognitive-object") throw new Error("fixture mismatch");
    (successor.payload as { version: number }).version += 1;
    (successor.payload as { updatedAt: string }).updatedAt = "2026-07-30T00:00:00Z";
    const replacements: string[] = [];
    setMarkdownCognitionTargetTestHook((event, relativePath) => {
      if (
        event === "projection:before-replace" &&
        relativePath !== undefined &&
        relativePath !== MARKDOWN_COGNITION_MANIFEST_FILE
      ) {
        replacements.push(relativePath);
      }
    });
    await projectMarkdownCognition({
      targetDirectory: fixture.target,
      records: [...records, successor],
    });
    assert.deepEqual(replacements, [...replacements].sort());
    assert.deepEqual(replacements, ["Index.md", markdownCognitionRelativePath(successor)].sort());
  } finally {
    fixture.remove();
  }
});

test("rejects symlink and hard-link managed entries", async () => {
  const fixture = temporaryInitializedTarget();
  try {
    await initializeMarkdownCognitionTarget({ targetDirectory: fixture.target });
    const [record] = fixtureRecords();
    if (record === undefined) throw new Error("missing fixture");
    const path = markdownCognitionRelativePath(record);
    await projectMarkdownCognition({ targetDirectory: fixture.target, records: [record] });
    const copy = join(fixture.root, "copy.md");
    linkSync(join(fixture.target, path), copy);
    rmSync(join(fixture.target, path));
    linkSync(copy, join(fixture.target, path));
    await assert.rejects(
      () => projectMarkdownCognition({ targetDirectory: fixture.target, records: [record] }),
      (error: unknown) => error instanceof MarkdownCognitionError && error.code === "unsafe_target_entry",
    );
    rmSync(join(fixture.target, path));
    symlinkSync(copy, join(fixture.target, path));
    await assert.rejects(
      () => projectMarkdownCognition({ targetDirectory: fixture.target, records: [record] }),
      (error: unknown) => error instanceof MarkdownCognitionError && error.code === "unsafe_target_entry",
    );
  } finally {
    fixture.remove();
  }
});
