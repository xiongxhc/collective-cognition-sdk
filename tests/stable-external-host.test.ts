import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const examplePath = fileURLToPath(
  new URL("../examples/stable-external-host.ts", import.meta.url),
);

const expectedSummary = {
  sourceRecords: 2,
  ingestedSourceRecords: 2,
  identities: 1,
  goals: 1,
  hypotheses: 1,
  evidence: 2,
  decisions: 1,
  persistedObjects: 6,
  reloadedObjects: 6,
  persistedEvents: 3,
  reloadedEvents: 3,
  portableRecords: 9,
};

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

const fictionalSourceRecords = [
  {
    schemaVersion: "0.1.0",
    id: "source-record:fictional-external-host:1",
    source: { system: "fictional-issue-tracker", instance: "meridian" },
    sourceId: "observation:1001",
    revisionId: "1",
    capturedAt: "2026-08-25T09:00:00.000Z",
    mediaType: "application/json",
    content: { summary: "The fictional pilot completed its first review." },
  },
  {
    schemaVersion: "0.1.0",
    id: "source-record:fictional-external-host:2",
    source: { system: "fictional-issue-tracker", instance: "meridian" },
    sourceId: "observation:1002",
    revisionId: "1",
    capturedAt: "2026-08-25T09:01:00.000Z",
    mediaType: "application/json",
    content: { summary: "The fictional pilot recorded an independent review." },
  },
];

test("imports the external-host example without executing its CLI", () => {
  const temporaryRoot = mkdtempSync(
    join(tmpdir(), "collective-cognition-external-host-import-"),
  );
  try {
    const importerPath = join(temporaryRoot, "import-example.mjs");
    writeFileSync(
      importerPath,
      `await import(${JSON.stringify(pathToFileURL(examplePath).href)});\nprocess.stdout.write("imported\\n");\n`,
    );

    const result = spawnSync(
      process.execPath,
      ["--disable-warning=ExperimentalWarning", importerPath],
      {
        cwd: temporaryRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          NODE_DISABLE_COMPILE_CACHE: "1",
        },
      },
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.signal, null);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout, "imported\n");
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

sqliteTest("runs a fictional external host through an explicit source fixture and SQLite target", () => {
  const temporaryRoot = mkdtempSync(
    join(tmpdir(), "collective-cognition-external-host-"),
  );
  try {
    const sourceRecordsPath = join(temporaryRoot, "fictional-source-records.jsonl");
    const cognitionDatabasePath = join(temporaryRoot, "fictional-cognition.db");
    writeFileSync(
      sourceRecordsPath,
      `${fictionalSourceRecords.map((record) => JSON.stringify(record)).join("\n")}\n`,
    );

    assert.notEqual(sourceRecordsPath, cognitionDatabasePath);
    assert.deepEqual(
      fictionalSourceRecords.map((record) => record.source.system),
      ["fictional-issue-tracker", "fictional-issue-tracker"],
    );

    const result = spawnSync(
      process.execPath,
      [
        "--disable-warning=ExperimentalWarning",
        examplePath,
        "--source-records",
        sourceRecordsPath,
        "--cognition-db",
        cognitionDatabasePath,
      ],
      {
        cwd: temporaryRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          HOME: join(temporaryRoot, "fictional-home"),
          NODE_DISABLE_COMPILE_CACHE: "1",
        },
      },
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.signal, null);
    assert.equal(result.stderr, "");
    assert.deepEqual(JSON.parse(result.stdout), expectedSummary);
    assert.equal(statSync(cognitionDatabasePath).isFile(), true);
    const database = new DatabaseSync(cognitionDatabasePath, { readOnly: true });
    try {
      const decision = database.prepare(`
        SELECT record_json
        FROM cognition_objects
        WHERE object_id = 'decision:fictional-external-host'
        ORDER BY object_version DESC
        LIMIT 1
      `).get() as { readonly record_json: string };
      const record = JSON.parse(decision.record_json) as {
        readonly payload: {
          readonly relationships: readonly {
            readonly type: string;
            readonly targetId: string;
          }[];
        };
      };
      assert.deepEqual(
        record.payload.relationships.find((relationship) =>
          relationship.type === "accountable-identity"
        ),
        { type: "accountable-identity", targetId: "identity:fictional-owner" },
      );
    } finally {
      database.close();
    }
    assert.doesNotMatch(
      `${result.stdout}${result.stderr}`,
      /team[ -]?memory|team[ -]?vault|\/Users\/cx|Chris/i,
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
