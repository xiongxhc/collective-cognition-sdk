import assert from "node:assert/strict";
import { after, test } from "node:test";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";

import {
  SqliteCognitionStore,
} from "../src/stores/sqlite.ts";
import type {
  SqliteCognitionStoreOptions,
} from "../src/stores/sqlite.ts";
import {
  SqliteCognitionWorkflowStore,
} from "../src/stores/sqlite-workflow.ts";

const cognitionSchema = `
  CREATE TABLE cognition_schema (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    adapter_id TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    created_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE cognition_objects (
    object_id TEXT NOT NULL,
    object_version INTEGER NOT NULL CHECK (object_version > 0),
    object_type TEXT NOT NULL,
    record_json TEXT NOT NULL,
    PRIMARY KEY (object_id, object_version)
  ) STRICT;

  CREATE TABLE cognition_events (
    event_id TEXT PRIMARY KEY,
    object_id TEXT NOT NULL,
    object_version INTEGER NOT NULL CHECK (object_version > 1),
    record_json TEXT NOT NULL,
    UNIQUE (object_id, object_version),
    FOREIGN KEY (object_id, object_version)
      REFERENCES cognition_objects (object_id, object_version)
  ) STRICT;
`;

const workflowSchema = `
  CREATE TABLE cognition_workflows (
    workflow_id TEXT PRIMARY KEY,
    request_digest TEXT NOT NULL CHECK (length(request_digest) = 64),
    initial_hypothesis_id TEXT NOT NULL,
    evidence_id TEXT NOT NULL,
    reviewed_hypothesis_version INTEGER NOT NULL CHECK (reviewed_hypothesis_version = 2),
    event_id TEXT NOT NULL UNIQUE
  ) STRICT;
`;

const teamMemorySchema = `
  CREATE TABLE events (
    id INTEGER PRIMARY KEY,
    person TEXT NOT NULL,
    source TEXT NOT NULL,
    hash TEXT NOT NULL
  ) STRICT;
`;

interface FileSnapshot {
  readonly bytes: Buffer;
  readonly directoryEntries: readonly string[];
  readonly modifiedAtNanoseconds: bigint;
}

interface SqliteRuntimeCapabilityProbe {
  readonly nodeVersion: string;
  readonly enableDefensive: unknown;
  readonly defensiveModeIsEnforced: () => boolean;
}

function supportsSqliteStoreRuntime(
  probe: SqliteRuntimeCapabilityProbe,
): boolean {
  return (
    typeof probe.enableDefensive === "function" &&
    probe.defensiveModeIsEnforced()
  );
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
    database.enableDefensive(true);
    database.exec("PRAGMA writable_schema = ON");
    const result = database
      .prepare("PRAGMA writable_schema")
      .get() as { readonly writable_schema?: unknown };
    return result.writable_schema === 0;
  } catch {
    return false;
  } finally {
    if (database?.isOpen) {
      database.close();
    }
  }
}

const supportsDefensiveMode = supportsSqliteStoreRuntime({
  nodeVersion: process.versions.node,
  enableDefensive: DatabaseSync.prototype.enableDefensive,
  defensiveModeIsEnforced,
});
const temporaryDirectories = new Set<string>();

after(() => {
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const sqliteTest = supportsDefensiveMode ? test : test.skip;

function temporaryDatabasePath(): string {
  const directory = mkdtempSync(
    join(tmpdir(), "collective-cognition-workflow-schema-"),
  );
  temporaryDirectories.add(directory);
  return join(directory, "cognition.db");
}

function createDatabase(
  databasePath: string,
  schemaVersion: number,
  schema: string,
): void {
  const database = new DatabaseSync(databasePath);
  try {
    database.exec(`
      ${schema}
      INSERT INTO cognition_schema (
        singleton,
        adapter_id,
        schema_version,
        created_at
      ) VALUES (
        1,
        'collective-cognition-sdk:sqlite-store',
        ${schemaVersion},
        '2026-08-13T00:00:00.000Z'
      );
    `);
  } finally {
    database.close();
  }
}

function createVersionOneTarget(): string {
  const databasePath = temporaryDatabasePath();
  createDatabase(databasePath, 1, cognitionSchema);
  return databasePath;
}

function createVersionTwoTarget(schema = `${cognitionSchema}\n${workflowSchema}`): string {
  const databasePath = temporaryDatabasePath();
  createDatabase(databasePath, 2, schema);
  return databasePath;
}

function readSchemaVersion(databasePath: string): unknown {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return (database
      .prepare(
        "SELECT schema_version FROM cognition_schema WHERE singleton = 1",
      )
      .get() as { readonly schema_version: unknown }).schema_version;
  } finally {
    database.close();
  }
}

function snapshotFile(databasePath: string): FileSnapshot {
  return {
    bytes: readFileSync(databasePath),
    directoryEntries: readdirSync(join(databasePath, "..")).sort(),
    modifiedAtNanoseconds: statSync(databasePath, { bigint: true }).mtimeNs,
  };
}

function assertRejectedWithoutMutation(
  databasePath: string,
  open: () => void,
): void {
  const before = snapshotFile(databasePath);
  assert.throws(open, /incompatible/i);
  assert.deepEqual(snapshotFile(databasePath), before);
}

test("the workflow store remains outside the existing SQLite module export", async () => {
  const sqlite = await import("../src/stores/sqlite.ts");
  const workflow = await import("../src/stores/sqlite-workflow.ts");

  assert.deepEqual(Object.keys(sqlite), ["SqliteCognitionStore"]);
  assert.equal("SqliteCognitionWorkflowStore" in sqlite, false);
  assert.equal(
    workflow.SqliteCognitionWorkflowStore,
    SqliteCognitionWorkflowStore,
  );
  assert.equal("commitWorkflow" in SqliteCognitionWorkflowStore.prototype, false);
});

test("the package keeps SQLite internals unexported", () => {
  const packageJson = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { readonly exports?: Record<string, unknown> };

  assert.equal(
    Object.hasOwn(packageJson.exports ?? {}, "./stores/sqlite-internal"),
    false,
  );
});

const sqliteStoreOptions: SqliteCognitionStoreOptions = {
  databasePath: "/tmp/cognition.db",
};

if (false) {
  // @ts-expect-error SQLite schema selection is not a public constructor argument.
  new SqliteCognitionStore(sqliteStoreOptions, 2);
}

sqliteTest("the existing SQLite store opens reviewed schema versions one and two", () => {
  const versionOne = createVersionOneTarget();
  const versionTwo = createVersionTwoTarget();

  assert.doesNotThrow(() => new SqliteCognitionStore({ databasePath: versionOne }).close());
  assert.doesNotThrow(() => new SqliteCognitionStore({ databasePath: versionTwo }).close());
});

sqliteTest("the workflow store requires an explicit version-two target", () => {
  const versionOne = createVersionOneTarget();

  assertRejectedWithoutMutation(
    versionOne,
    () => new SqliteCognitionWorkflowStore({ databasePath: versionOne }),
  );
  assert.equal(readSchemaVersion(versionOne), 1);
});

sqliteTest("the workflow store leaves missing paths absent unless creation is explicit", () => {
  const databasePath = temporaryDatabasePath();

  assert.throws(
    () => new SqliteCognitionWorkflowStore({ databasePath }),
    /incompatible/i,
  );
  assert.equal(existsSync(databasePath), false);

  const store = new SqliteCognitionWorkflowStore({
    databasePath,
    createIfMissing: true,
  });
  store.close();

  assert.equal(readSchemaVersion(databasePath), 2);
});

sqliteTest("workflow creation writes version two without touching a nearby version-one target", () => {
  const versionOne = createVersionOneTarget();
  const before = snapshotFile(versionOne);
  const workflowPath = join(versionOne, "..", "workflow.db");

  const store = new SqliteCognitionWorkflowStore({
    databasePath: workflowPath,
    createIfMissing: true,
  });
  store.close();

  assert.equal(readSchemaVersion(workflowPath), 2);
  const after = snapshotFile(versionOne);
  assert.deepEqual(after.bytes, before.bytes);
  assert.equal(after.modifiedAtNanoseconds, before.modifiedAtNanoseconds);
});

sqliteTest("the workflow store rejects malformed and hybrid version-two targets without mutation", () => {
  const malformedSchemas = [
    cognitionSchema,
    `${cognitionSchema}\n${workflowSchema}\nCREATE TABLE extra_table (id INTEGER PRIMARY KEY) STRICT;`,
    `${cognitionSchema}\n${workflowSchema}\nCREATE VIEW extra_view AS SELECT workflow_id FROM cognition_workflows;`,
    `${cognitionSchema}\n${workflowSchema}\nCREATE TRIGGER extra_trigger AFTER INSERT ON cognition_workflows BEGIN SELECT 1; END;`,
    `${cognitionSchema}\n${workflowSchema.replace(") STRICT;", ");")}`,
    `${cognitionSchema}\n${workflowSchema.replace("request_digest TEXT", "request_digest INTEGER")}`,
    `${cognitionSchema}\n${workflowSchema}\n${teamMemorySchema}`,
  ];

  for (const schema of malformedSchemas) {
    const databasePath = createVersionTwoTarget(schema);
    assertRejectedWithoutMutation(
      databasePath,
      () => new SqliteCognitionStore({ databasePath }),
    );
    assertRejectedWithoutMutation(
      databasePath,
      () => new SqliteCognitionWorkflowStore({ databasePath }),
    );
  }

  const unknownVersion = createVersionTwoTarget();
  const database = new DatabaseSync(unknownVersion);
  try {
    database.exec("UPDATE cognition_schema SET schema_version = 3");
  } finally {
    database.close();
  }
  assertRejectedWithoutMutation(
    unknownVersion,
    () => new SqliteCognitionStore({ databasePath: unknownVersion }),
  );
  assertRejectedWithoutMutation(
    unknownVersion,
    () => new SqliteCognitionWorkflowStore({ databasePath: unknownVersion }),
  );

  const hybridMarker = createVersionTwoTarget();
  const hybridDatabase = new DatabaseSync(hybridMarker);
  try {
    hybridDatabase.exec(
      "UPDATE cognition_schema SET adapter_id = 'collective-cognition-sdk:sqlite-workflow-store'",
    );
  } finally {
    hybridDatabase.close();
  }
  assertRejectedWithoutMutation(
    hybridMarker,
    () => new SqliteCognitionStore({ databasePath: hybridMarker }),
  );
  assertRejectedWithoutMutation(
    hybridMarker,
    () => new SqliteCognitionWorkflowStore({ databasePath: hybridMarker }),
  );
});
