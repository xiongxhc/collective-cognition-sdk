import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  closeSync,
  lstatSync,
  linkSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  truncateSync,
  unlinkSync,
  writeSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { setMarkdownCognitionTargetTestHook } from "../src/markdown-cognition-target.ts";
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

test.afterEach(() => {
  setMarkdownCognitionTargetTestHook(undefined);
});

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

test("verification leaves unrelated unmanifested files untouched and unmanaged", async () => {
  const root = temporaryRoot();
  const target = join(root, "target");
  try {
    mkdirSync(target);
    const index = "# Collective Cognition Index\n";
    const unrelated = "operator-owned note\n";
    writeFileSync(join(target, "Index.md"), index);
    writeFileSync(join(target, "human.md"), unrelated);
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
    assert.equal(report.managedPaths.includes("human.md"), false);
    assert.equal(readFileSync(join(target, "human.md"), "utf8"), unrelated);
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

test("verification fails closed when the target or an ancestor is substituted", async () => {
  for (const substitution of ["target", "ancestor"] as const) {
    const root = temporaryRoot();
    const parent = join(root, "parent");
    const target = join(parent, "target");
    const outsideParent = join(root, "outside-parent");
    const outsideTarget = join(outsideParent, "target");
    try {
      mkdirSync(parent);
      mkdirSync(outsideParent);
      mkdirSync(target);
      mkdirSync(outsideTarget);
      writeInitializedFiles(target);
      writeInitializedFiles(outsideTarget);
      let substituted = false;
      setMarkdownCognitionTargetTestHook((event, relativePath) => {
        if (
          event !== "verify:before-managed-open" ||
          relativePath !== MARKDOWN_COGNITION_MARKER_FILE ||
          substituted
        ) {
          return;
        }
        substituted = true;
        if (substitution === "target") {
          renameSync(target, join(parent, "target-original"));
          symlinkSync(outsideTarget, target);
        } else {
          renameSync(parent, join(root, "parent-original"));
          symlinkSync(outsideParent, parent);
        }
      });

      const report = await verifyMarkdownCognitionTarget({ targetDirectory: target });

      assert.equal(report.status, "failed");
      assert.ok(report.diagnostics.some((diagnostic) => diagnostic.code === "unsafe_target_entry"));
    } finally {
      setMarkdownCognitionTargetTestHook(undefined);
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("same-privilege swap-back mutation is outside the detectable-race boundary", async () => {
  const root = temporaryRoot();
  const parent = join(root, "parent");
  const target = join(parent, "target");
  const outside = join(root, "outside");
  try {
    mkdirSync(parent);
    mkdirSync(target);
    mkdirSync(outside);
    writeInitializedFiles(target);
    writeInitializedFiles(outside);
    let swappedBack = false;
    setMarkdownCognitionTargetTestHook((event, relativePath) => {
      if (
        event !== "verify:before-managed-open" ||
        relativePath !== MARKDOWN_COGNITION_MARKER_FILE ||
        swappedBack
      ) {
        return;
      }
      const original = join(parent, "target-original");
      renameSync(target, original);
      symlinkSync(outside, target);
      unlinkSync(target);
      renameSync(original, target);
      swappedBack = true;
    });

    const report = await verifyMarkdownCognitionTarget({ targetDirectory: target });

    assert.equal(swappedBack, true);
    assert.equal(report.status, "passed");
  } finally {
    setMarkdownCognitionTargetTestHook(undefined);
    rmSync(root, { recursive: true, force: true });
  }
});

test("initialization does not write through a substituted target", async () => {
  const root = temporaryRoot();
  const parent = join(root, "parent");
  const target = join(parent, "target");
  const outside = join(root, "outside");
  try {
    mkdirSync(parent);
    mkdirSync(target);
    mkdirSync(outside);
    let substituted = false;
    setMarkdownCognitionTargetTestHook((event) => {
      if (event !== "initialize:after-target-inspection" || substituted) {
        return;
      }
      substituted = true;
      renameSync(target, join(parent, "target-original"));
      symlinkSync(outside, target);
    });

    await assert.rejects(
      () => initializeMarkdownCognitionTarget({ targetDirectory: target }),
      (error: unknown) =>
        error instanceof MarkdownCognitionError &&
        error.code === "projection_io_failed",
    );
    assert.deepEqual(readdirSync(outside), []);
  } finally {
    setMarkdownCognitionTargetTestHook(undefined);
    rmSync(root, { recursive: true, force: true });
  }
});

test("initialization cleans staged artifacts when the second commit fails", async () => {
  const root = temporaryRoot();
  const target = join(root, "target");
  try {
    mkdirSync(target);
    setMarkdownCognitionTargetTestHook((event) => {
      if (event === "initialize:before-manifest-commit") {
        throw new Error("simulated second commit failure");
      }
    });

    await assert.rejects(
      () => initializeMarkdownCognitionTarget({ targetDirectory: target }),
      (error: unknown) =>
        error instanceof MarkdownCognitionError &&
        error.code === "projection_io_failed",
    );
    assert.deepEqual(readdirSync(target), []);
  } finally {
    setMarkdownCognitionTargetTestHook(undefined);
    rmSync(root, { recursive: true, force: true });
  }
});

test("verification rejects invalid UTF-8 metadata and managed bytes", async () => {
  const root = temporaryRoot();
  const target = join(root, "target");
  const targetId = "a".repeat(32);
  try {
    mkdirSync(target);
    writeInitializedFiles(target, targetId);
    const markerPrefix = Buffer.from(
      "{\"format\":\"collective-cognition-markdown-target/1\",\"initializedByPackageVersion\":\"",
      "utf8",
    );
    const markerSuffix = Buffer.from(
      `\",\"profileVersion\":\"portable-cognition-markdown/0.1.0\",\"targetId\":\"${targetId}\"}`,
      "utf8",
    );
    writeFileSync(
      join(target, MARKDOWN_COGNITION_MARKER_FILE),
      Buffer.concat([markerPrefix, Buffer.from([0x80]), markerSuffix]),
    );
    let report = await verifyMarkdownCognitionTarget({ targetDirectory: target });
    assert.equal(report.status, "failed");

    writeInitializedFiles(target, targetId);
    const managedPath = "Objects/item.md";
    const managedBytes = Buffer.from([0x80]);
    mkdirSync(join(target, "Objects"));
    writeFileSync(join(target, managedPath), managedBytes);
    const decodedDigest = createHash("sha256")
      .update(Buffer.from("\ufffd", "utf8"))
      .digest("hex");
    const manifestPrefix = Buffer.from(
      `{"entries":[{"digest":"${decodedDigest}","recordHash":"${"b".repeat(64)}","recordIdentity":"`,
      "utf8",
    );
    const manifestSuffix = Buffer.from(
      `","recordType":"cognitive-object","relativePath":"${managedPath}"}],"format":"collective-cognition-markdown-manifest/1","profileVersion":"portable-cognition-markdown/0.1.0","targetId":"${targetId}"}`,
      "utf8",
    );
    writeFileSync(
      join(target, MARKDOWN_COGNITION_MANIFEST_FILE),
      Buffer.concat([manifestPrefix, Buffer.from([0x80]), manifestSuffix]),
    );
    report = await verifyMarkdownCognitionTarget({ targetDirectory: target });
    assert.equal(report.status, "failed");

    writeFileSync(
      join(target, MARKDOWN_COGNITION_MANIFEST_FILE),
      manifest(targetId, {
        entries: [{
          digest: decodedDigest,
          recordType: "index",
          relativePath: managedPath,
        }],
      }),
    );
    report = await verifyMarkdownCognitionTarget({ targetDirectory: target });
    assert.equal(report.status, "failed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("verification enforces the aggregate raw metadata byte limit before parsing", async () => {
  const root = temporaryRoot();
  const target = join(root, "target");
  const targetId = "a".repeat(32);
  const aggregateLimit = 128 * 1024 * 1024;
  try {
    mkdirSync(target);
    const manifestBytes = Buffer.from(manifest(targetId), "utf8");
    writeFileSync(join(target, MARKDOWN_COGNITION_MANIFEST_FILE), manifestBytes);
    const markerPrefix = Buffer.from(
      "{\"format\":\"collective-cognition-markdown-target/1\",\"initializedByPackageVersion\":\"",
      "utf8",
    );
    const markerSuffix = Buffer.from(
      `\",\"profileVersion\":\"portable-cognition-markdown/0.1.0\",\"targetId\":\"${targetId}\"}`,
      "utf8",
    );
    const packageVersionBytes =
      aggregateLimit + 1 - manifestBytes.length - markerPrefix.length - markerSuffix.length;
    const markerDescriptor = openSync(
      join(target, MARKDOWN_COGNITION_MARKER_FILE),
      "w",
    );
    try {
      writeSync(markerDescriptor, markerPrefix);
      const chunk = Buffer.alloc(1024 * 1024, 0x61);
      let remaining = packageVersionBytes;
      while (remaining > 0) {
        const bytes = Math.min(remaining, chunk.length);
        writeSync(markerDescriptor, chunk, 0, bytes);
        remaining -= bytes;
      }
      writeSync(markerDescriptor, markerSuffix);
    } finally {
      closeSync(markerDescriptor);
    }

    const report = await verifyMarkdownCognitionTarget({ targetDirectory: target });

    assert.equal(report.status, "failed");
    assert.ok(report.diagnostics.some((diagnostic) => diagnostic.code === "incompatible_target"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("verification stops before opening later files after a cumulative limit violation", async () => {
  const root = temporaryRoot();
  const target = join(root, "target");
  const targetId = "a".repeat(32);
  const firstPath = "A.md";
  const laterPath = "B.md";
  const openedManagedPaths: string[] = [];
  try {
    mkdirSync(target);
    writeInitializedFiles(target, targetId);
    writeFileSync(join(target, firstPath), "");
    truncateSync(join(target, firstPath), 128 * 1024 * 1024);
    writeFileSync(join(target, laterPath), "# later\n");
    writeFileSync(
      join(target, MARKDOWN_COGNITION_MANIFEST_FILE),
      manifest(targetId, {
        entries: [
          {
            digest: "a".repeat(64),
            recordType: "index",
            relativePath: firstPath,
          },
          {
            digest: "b".repeat(64),
            recordType: "index",
            relativePath: laterPath,
          },
        ],
      }),
    );
    setMarkdownCognitionTargetTestHook((event, relativePath) => {
      if (
        event === "verify:before-managed-open" &&
        relativePath !== undefined &&
        relativePath !== MARKDOWN_COGNITION_MARKER_FILE &&
        relativePath !== MARKDOWN_COGNITION_MANIFEST_FILE
      ) {
        openedManagedPaths.push(relativePath);
      }
    });

    const report = await verifyMarkdownCognitionTarget({ targetDirectory: target });

    assert.equal(report.status, "failed");
    assert.deepEqual(openedManagedPaths, [firstPath]);
  } finally {
    setMarkdownCognitionTargetTestHook(undefined);
    rmSync(root, { recursive: true, force: true });
  }
});

test("verification rejects Windows path aliases and reserved device names", async () => {
  const root = temporaryRoot();
  const target = join(root, "target");
  const targetId = "a".repeat(32);
  const openedManagedPaths: string[] = [];
  const unsafePaths = [
    "Index.md.",
    "Objects/trailing-space /item.md",
    "CON.md",
    "Objects/AUX/item.md",
    "Events/com1/event.md",
    "Objects/LPT9.txt/item.md",
    "COM¹.md",
    "Objects/LPT¹.txt/item.md",
  ];
  try {
    mkdirSync(target);
    writeInitializedFiles(target, targetId);
    writeFileSync(
      join(target, MARKDOWN_COGNITION_MANIFEST_FILE),
      manifest(targetId, {
        entries: unsafePaths.map((relativePath) => ({
          digest: "a".repeat(64),
          recordType: "index",
          relativePath,
        })),
      }),
    );
    setMarkdownCognitionTargetTestHook((event, relativePath) => {
      if (
        event === "verify:before-managed-open" &&
        relativePath !== undefined &&
        relativePath !== MARKDOWN_COGNITION_MARKER_FILE &&
        relativePath !== MARKDOWN_COGNITION_MANIFEST_FILE
      ) {
        openedManagedPaths.push(relativePath);
      }
    });

    const report = await verifyMarkdownCognitionTarget({ targetDirectory: target });

    assert.equal(report.status, "failed");
    assert.ok(report.diagnostics.some((diagnostic) => diagnostic.code === "unsafe_target_entry"));
    assert.deepEqual(openedManagedPaths, []);
  } finally {
    setMarkdownCognitionTargetTestHook(undefined);
    rmSync(root, { recursive: true, force: true });
  }
});
