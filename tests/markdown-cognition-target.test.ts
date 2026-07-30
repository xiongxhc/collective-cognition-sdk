import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  lstatSync,
  linkSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  MARKDOWN_COGNITION_MANIFEST_FILE,
  MARKDOWN_COGNITION_MARKER_FILE,
  MarkdownCognitionError,
  initializeMarkdownCognitionTarget,
  verifyMarkdownCognitionTarget,
} from "../src/markdown-cognition.ts";

function temporaryRoot(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), "ccsdk-markdown-target-")));
}

function marker(targetId: string, fields: Record<string, unknown> = {}): string {
  return JSON.stringify({
    format: "collective-cognition-markdown-target/1",
    initializedByPackageVersion: "0.5.0",
    profileVersion: "portable-cognition-markdown/0.1.0",
    targetId,
    ...fields,
  });
}

function manifest(targetId: string, fields: Record<string, unknown> = {}): string {
  return JSON.stringify({
    entries: [],
    format: "collective-cognition-markdown-manifest/1",
    profileVersion: "portable-cognition-markdown/0.1.0",
    targetId,
    ...fields,
  });
}

function writeInitializedFiles(target: string, targetId = "a".repeat(32)): void {
  writeFileSync(join(target, MARKDOWN_COGNITION_MARKER_FILE), marker(targetId));
  writeFileSync(join(target, MARKDOWN_COGNITION_MANIFEST_FILE), manifest(targetId));
}

function assertInvalidTarget(action: () => Promise<unknown>): Promise<void> {
  return assert.rejects(
    action,
    (error: unknown) => error instanceof MarkdownCognitionError && error.code === "invalid_target",
  );
}

test("initializes only an explicit empty absolute directory", async () => {
  const root = temporaryRoot();
  const target = join(root, "Collective Cognition");
  try {
    await initializeMarkdownCognitionTarget({ targetDirectory: target });
    assert.equal(lstatSync(target).isDirectory(), true);
    assert.doesNotThrow(() =>
      JSON.parse(readFileSync(join(target, MARKDOWN_COGNITION_MARKER_FILE), "utf8"))
    );
    assert.doesNotThrow(() =>
      JSON.parse(readFileSync(join(target, MARKDOWN_COGNITION_MANIFEST_FILE), "utf8"))
    );
    const report = await verifyMarkdownCognitionTarget({ targetDirectory: target });
    assert.equal(report.status, "passed");
    assert.deepEqual(report.managedPaths, [
      MARKDOWN_COGNITION_MANIFEST_FILE,
      MARKDOWN_COGNITION_MARKER_FILE,
    ].sort());
    assert.equal(Object.isFrozen(report), true);
    assert.equal(Object.isFrozen(report.diagnostics), true);
    assert.equal(Object.isFrozen(report.managedPaths), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects relative paths, filesystem root, missing parents, and non-directories", async () => {
  const root = temporaryRoot();
  try {
    await assertInvalidTarget(() => initializeMarkdownCognitionTarget({ targetDirectory: "relative" }));
    await assertInvalidTarget(() => initializeMarkdownCognitionTarget({ targetDirectory: "/" }));
    await assertInvalidTarget(() => initializeMarkdownCognitionTarget({ targetDirectory: join(root, "missing", "target") }));
    const file = join(root, "file");
    writeFileSync(file, "not a directory");
    await assertInvalidTarget(() => initializeMarkdownCognitionTarget({ targetDirectory: file }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("initialization never adopts non-empty directories", async () => {
  const root = temporaryRoot();
  const target = join(root, "target");
  try {
    mkdirSync(target);
    writeFileSync(join(target, "human.md"), "human");
    await assertInvalidTarget(() => initializeMarkdownCognitionTarget({ targetDirectory: target }));
    assert.equal(readFileSync(join(target, "human.md"), "utf8"), "human");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects symbolic-link targets and parent components", async () => {
  const root = temporaryRoot();
  try {
    const actual = join(root, "actual");
    mkdirSync(actual);
    const targetLink = join(root, "target-link");
    symlinkSync(actual, targetLink);
    await assertInvalidTarget(() => initializeMarkdownCognitionTarget({ targetDirectory: targetLink }));

    const parent = join(root, "parent");
    mkdirSync(parent);
    const parentLink = join(root, "parent-link");
    symlinkSync(parent, parentLink);
    await assertInvalidTarget(() => initializeMarkdownCognitionTarget({ targetDirectory: join(parentLink, "target") }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects inherited, accessor-bearing, and reflection-hostile options", async () => {
  const root = temporaryRoot();
  let accessed = false;
  try {
    await assertInvalidTarget(() => initializeMarkdownCognitionTarget(Object.create({ targetDirectory: join(root, "target") })));
    const accessor = {} as { readonly targetDirectory: string };
    Object.defineProperty(accessor, "targetDirectory", {
      enumerable: true,
      get() {
        accessed = true;
        throw new Error("SECRET_ACCESSOR");
      },
    });
    await assertInvalidTarget(() => initializeMarkdownCognitionTarget(accessor));
    assert.equal(accessed, false);
    const hostile = new Proxy({}, {
      ownKeys() {
        throw new Error("SECRET_REFLECTION");
      },
    });
    await assertInvalidTarget(() => initializeMarkdownCognitionTarget(hostile as never));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("verification rejects malformed, incompatible, and mismatched metadata", async () => {
  const root = temporaryRoot();
  const target = join(root, "target");
  try {
    mkdirSync(target);
    writeInitializedFiles(target);
    for (const [name, contents] of [
      [MARKDOWN_COGNITION_MARKER_FILE, "{\"format\":\"collective-cognition-markdown-target/1\",\"format\":\"collective-cognition-markdown-target/1\"}"],
      [MARKDOWN_COGNITION_MARKER_FILE, marker("a".repeat(32), { extra: true })],
      [MARKDOWN_COGNITION_MARKER_FILE, marker("a".repeat(32), { format: "collective-cognition-markdown-target/999" })],
      [MARKDOWN_COGNITION_MARKER_FILE, marker("a".repeat(32), { profileVersion: "portable-cognition-markdown/999.0.0" })],
      [MARKDOWN_COGNITION_MANIFEST_FILE, manifest("b".repeat(32))],
      [MARKDOWN_COGNITION_MANIFEST_FILE, manifest("a".repeat(32), { extra: true })],
      [MARKDOWN_COGNITION_MANIFEST_FILE, manifest("a".repeat(32), { entries: {}, })],
      [MARKDOWN_COGNITION_MANIFEST_FILE, "{\"entries\":[],\"entries\":[],\"format\":\"collective-cognition-markdown-manifest/1\",\"profileVersion\":\"portable-cognition-markdown/0.1.0\",\"targetId\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"}"],
      [MARKDOWN_COGNITION_MANIFEST_FILE, "{ \"entries\": [], \"format\": \"collective-cognition-markdown-manifest/1\", \"profileVersion\": \"portable-cognition-markdown/0.1.0\", \"targetId\": \"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\" }"],
    ] as const) {
      writeInitializedFiles(target);
      writeFileSync(join(target, name), contents);
      const report = await verifyMarkdownCognitionTarget({ targetDirectory: target });
      assert.equal(report.status, "failed");
      assert.ok(report.diagnostics.some((diagnostic) => diagnostic.code === "incompatible_target"));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("verification rejects symbolic metadata and unsafe manifest paths", async () => {
  const root = temporaryRoot();
  const target = join(root, "target");
  try {
    mkdirSync(target);
    writeInitializedFiles(target);
    const markerPath = join(target, MARKDOWN_COGNITION_MARKER_FILE);
    const markerCopy = join(target, "marker-copy");
    writeFileSync(markerCopy, readFileSync(markerPath));
    rmSync(markerPath);
    symlinkSync(markerCopy, markerPath);
    let report = await verifyMarkdownCognitionTarget({ targetDirectory: target });
    assert.equal(report.status, "failed");
    assert.ok(report.diagnostics.some((diagnostic) => diagnostic.code === "unsafe_target_entry"));

    rmSync(markerPath);
    writeInitializedFiles(target);
    const manifestPath = join(target, MARKDOWN_COGNITION_MANIFEST_FILE);
    const manifestCopy = join(target, "manifest-copy");
    writeFileSync(manifestCopy, readFileSync(manifestPath));
    rmSync(manifestPath);
    symlinkSync(manifestCopy, manifestPath);
    report = await verifyMarkdownCognitionTarget({ targetDirectory: target });
    assert.equal(report.status, "failed");
    assert.ok(report.diagnostics.some((diagnostic) => diagnostic.code === "unsafe_target_entry"));

    rmSync(manifestPath);
    writeInitializedFiles(target);
    writeFileSync(join(target, MARKDOWN_COGNITION_MANIFEST_FILE), manifest("a".repeat(32), {
      entries: [{ digest: "c".repeat(64), recordType: "index", relativePath: "../outside.md" }],
    }));
    report = await verifyMarkdownCognitionTarget({ targetDirectory: target });
    assert.equal(report.status, "failed");
    assert.ok(report.diagnostics.some((diagnostic) => diagnostic.code === "unsafe_target_entry"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("verification rejects hard-linked metadata without reading linked content", async () => {
  const root = temporaryRoot();
  const target = join(root, "target");
  try {
    mkdirSync(target);
    writeInitializedFiles(target);
    const markerPath = join(target, MARKDOWN_COGNITION_MARKER_FILE);
    const markerLink = join(target, "marker-hard-link");
    linkSync(markerPath, markerLink);
    const report = await verifyMarkdownCognitionTarget({ targetDirectory: target });
    assert.equal(report.status, "failed");
    assert.ok(report.diagnostics.some((diagnostic) => diagnostic.code === "unsafe_target_entry"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("verification reads only a validated manifest-owned regular file", async () => {
  const root = temporaryRoot();
  const target = join(root, "target");
  try {
    mkdirSync(target);
    const index = "# Collective Cognition Index\n";
    writeFileSync(join(target, "Index.md"), index);
    const targetId = "a".repeat(32);
    writeFileSync(join(target, MARKDOWN_COGNITION_MARKER_FILE), marker(targetId));
    writeFileSync(join(target, MARKDOWN_COGNITION_MANIFEST_FILE), manifest(targetId, {
      entries: [{
        digest: createHash("sha256").update(index, "utf8").digest("hex"),
        recordType: "index",
        relativePath: "Index.md",
      }],
    }));
    const report = await verifyMarkdownCognitionTarget({ targetDirectory: target });
    assert.equal(report.status, "passed");
    assert.deepEqual(report.managedPaths, [
      MARKDOWN_COGNITION_MANIFEST_FILE,
      MARKDOWN_COGNITION_MARKER_FILE,
      "Index.md",
    ].sort());
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("verification diagnostics never expose absolute paths", async () => {
  const root = temporaryRoot();
  const target = join(root, "target");
  try {
    const report = await verifyMarkdownCognitionTarget({ targetDirectory: target });
    assert.equal(report.status, "failed");
    assert.ok(report.diagnostics.length > 0);
    for (const diagnostic of report.diagnostics) {
      assert.equal(diagnostic.message.includes(root), false);
      assert.equal(
        diagnostic.relativePath === undefined || !diagnostic.relativePath.startsWith("/"),
        true,
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
