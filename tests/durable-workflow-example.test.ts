import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const examplePath = new URL(
  "../examples/durable-cognition-workflow.ts",
  import.meta.url,
);
const expectedSummary = '{"workflowId":"workflow:durable-workflow-example:1","schemaVersion":2,"firstPersistence":"committed","replayPersistence":"already_committed","publication":"not_requested","firstProjection":"projected","replayProjection":"unchanged","objects":3,"events":1,"receipts":1,"markdownVerification":"passed"}\n';

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

sqliteTest("workflow example prints one summary and removes its temporary root", () => {
  const temporaryParent = mkdtempSync(join(tmpdir(), "ccsdk-workflow-example-test-"));
  try {
    const result = spawnSync(
      process.execPath,
      ["--disable-warning=ExperimentalWarning", examplePath.pathname],
      {
        cwd: temporaryParent,
        encoding: "utf8",
        env: {
          ...process.env,
          TMPDIR: temporaryParent,
          TMP: temporaryParent,
          TEMP: temporaryParent,
        },
      },
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout, expectedSummary);
    assert.deepEqual(readdirSync(temporaryParent), []);
  } finally {
    rmSync(temporaryParent, { recursive: true, force: true });
  }
});

test("workflow example removes its temporary root when setup fails", () => {
  const temporaryParent = mkdtempSync(join(tmpdir(), "ccsdk-workflow-failure-test-"));
  try {
    const sentinelPath = join(temporaryParent, "hook-called.txt");
    const script = `
      import { writeFileSync } from "node:fs";
      import { runDurableCognitionWorkflowExample } from ${JSON.stringify(examplePath.href)};
      await runDurableCognitionWorkflowExample({
        temporaryParent: ${JSON.stringify(temporaryParent)},
        afterTemporaryRootCreated(root) {
          writeFileSync(${JSON.stringify(sentinelPath)}, root);
          throw new Error("forced failure after temporary root creation");
        },
      });
    `;
    const result = spawnSync(
      process.execPath,
      ["--disable-warning=ExperimentalWarning", "--input-type=module", "--eval", script],
      { encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(existsSync(sentinelPath), true, result.stderr);
    const generatedRoot = readFileSync(sentinelPath, "utf8");
    assert.equal(existsSync(generatedRoot), false);
    unlinkSync(sentinelPath);
    assert.deepEqual(readdirSync(temporaryParent), []);
  } finally {
    rmSync(temporaryParent, { recursive: true, force: true });
  }
});
