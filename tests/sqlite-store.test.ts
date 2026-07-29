import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { SqliteCognitionStore } from "../src/stores/sqlite.ts";

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

const teamMemorySchema = `
  CREATE TABLE events (
    id      INTEGER PRIMARY KEY,
    person  TEXT NOT NULL,
    project TEXT,
    ts      TEXT NOT NULL,
    source  TEXT NOT NULL,
    kind    TEXT NOT NULL,
    summary TEXT NOT NULL,
    refs    TEXT,
    raw     TEXT,
    hash    TEXT NOT NULL,
    UNIQUE(person, source, hash)
  );
`;

interface FileSnapshot {
  readonly bytes: Buffer;
  readonly directoryEntries: readonly string[];
  readonly modifiedAtNanoseconds: bigint;
}

function temporaryDatabasePath(t: test.TestContext): string {
  const directory = mkdtempSync(
    join(tmpdir(), "collective-cognition-sqlite-"),
  );
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return join(directory, "cognition.db");
}

function createDatabase(databasePath: string, sql: string): void {
  const database = new DatabaseSync(databasePath);
  try {
    database.exec(sql);
  } finally {
    database.close();
  }
}

function snapshotFile(databasePath: string): FileSnapshot {
  const metadata = statSync(databasePath, { bigint: true });
  return {
    bytes: readFileSync(databasePath),
    directoryEntries: readdirSync(join(databasePath, "..")).sort(),
    modifiedAtNanoseconds: metadata.mtimeNs,
  };
}

function assertRejectedWithoutMutation(
  databasePath: string,
  before: FileSnapshot,
): void {
  assert.throws(() => new SqliteCognitionStore({ databasePath }));
  assert.deepEqual(snapshotFile(databasePath), before);
}

function createMarkedCognitionDatabase(
  databasePath: string,
  schemaVersion: number,
): void {
  createDatabase(
    databasePath,
    `
      ${cognitionSchema}
      INSERT INTO cognition_schema (
        singleton,
        adapter_id,
        schema_version,
        created_at
      ) VALUES (
        1,
        'collective-cognition-sdk:sqlite-store',
        ${schemaVersion},
        '2026-07-29T00:00:00.000Z'
      );
    `,
  );
}

test("SQLite target rejects implicit and non-absolute paths", () => {
  for (const databasePath of [
    "",
    "relative.db",
    ":memory:",
    "file:///tmp/cognition.db",
    "~/cognition.db",
  ]) {
    assert.throws(
      () => new SqliteCognitionStore({ databasePath }),
      databasePath,
    );
  }
});

test("SQLite target leaves a missing path absent by default", (t) => {
  const databasePath = temporaryDatabasePath(t);

  assert.throws(() => new SqliteCognitionStore({ databasePath }));
  assert.equal(existsSync(databasePath), false);
});

test("SQLite schema creation writes the exact version-one identity", (t) => {
  const databasePath = temporaryDatabasePath(t);
  const store = new SqliteCognitionStore({
    databasePath,
    createIfMissing: true,
  });
  store.close();

  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const tables = database
      .prepare(
        `
          SELECT name, strict
          FROM pragma_table_list
          WHERE schema = 'main' AND name NOT LIKE 'sqlite_%'
          ORDER BY name
        `,
      )
      .all()
      .map((row) => ({
        name: (row as { readonly name: unknown }).name,
        strict: (row as { readonly strict: unknown }).strict,
      }));
    assert.deepEqual(
      tables,
      [
        {
          name: "cognition_events",
          strict: 1,
        },
        {
          name: "cognition_objects",
          strict: 1,
        },
        {
          name: "cognition_schema",
          strict: 1,
        },
      ],
    );
    const marker = database
      .prepare(
        `
          SELECT singleton, adapter_id, schema_version, created_at
          FROM cognition_schema
        `,
      )
      .get() as Record<string, unknown>;
    assert.equal(marker.singleton, 1);
    assert.equal(
      marker.adapter_id,
      "collective-cognition-sdk:sqlite-store",
    );
    assert.equal(marker.schema_version, 1);
    assert.equal(
      typeof marker.created_at === "string" &&
        Number.isFinite(Date.parse(marker.created_at)),
      true,
    );
  } finally {
    database.close();
  }
});

test("SQLite schema accepts its own version-one database", (t) => {
  const databasePath = temporaryDatabasePath(t);
  createMarkedCognitionDatabase(databasePath, 1);
  const before = snapshotFile(databasePath);

  const store = new SqliteCognitionStore({ databasePath });
  store.close();

  assert.deepEqual(snapshotFile(databasePath), before);
});

test("SQLite target rejects an existing empty file without mutation", (t) => {
  const databasePath = temporaryDatabasePath(t);
  writeFileSync(databasePath, "");

  assertRejectedWithoutMutation(databasePath, snapshotFile(databasePath));
});

test("SQLite target rejects a team-memory events database without mutation", (t) => {
  const databasePath = temporaryDatabasePath(t);
  createDatabase(databasePath, teamMemorySchema);

  assertRejectedWithoutMutation(databasePath, snapshotFile(databasePath));
});

test("SQLite target rejects an unrelated database without mutation", (t) => {
  const databasePath = temporaryDatabasePath(t);
  createDatabase(
    databasePath,
    "CREATE TABLE unrelated (id INTEGER PRIMARY KEY, value TEXT);",
  );

  assertRejectedWithoutMutation(databasePath, snapshotFile(databasePath));
});

test("SQLite schema rejects an unknown cognition version without mutation", (t) => {
  const databasePath = temporaryDatabasePath(t);
  createMarkedCognitionDatabase(databasePath, 2);

  assertRejectedWithoutMutation(databasePath, snapshotFile(databasePath));
});

test("SQLite target accepts only bounded safe-integer busy timeouts", (t) => {
  for (const busyTimeoutMs of [0, 60_000]) {
    const databasePath = join(
      temporaryDatabasePath(t),
      `../accepted-${busyTimeoutMs}.db`,
    );
    const store = new SqliteCognitionStore({
      databasePath,
      createIfMissing: true,
      busyTimeoutMs,
    });
    store.close();
  }

  for (const busyTimeoutMs of [
    -1,
    60_001,
    0.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    const databasePath = join(
      temporaryDatabasePath(t),
      `../rejected-${String(busyTimeoutMs)}.db`,
    );
    assert.throws(
      () =>
        new SqliteCognitionStore({
          databasePath,
          createIfMissing: true,
          busyTimeoutMs,
        }),
      String(busyTimeoutMs),
    );
    assert.equal(existsSync(databasePath), false);
  }
});

test("SQLite target snapshots exact own enumerable option data", (t) => {
  const databasePath = temporaryDatabasePath(t);
  let accessorReads = 0;
  const accessorOptions = {
    createIfMissing: true,
  } as {
    databasePath: string;
    createIfMissing: boolean;
  };
  Object.defineProperty(accessorOptions, "databasePath", {
    enumerable: true,
    get() {
      accessorReads += 1;
      return databasePath;
    },
  });

  assert.throws(() => new SqliteCognitionStore(accessorOptions));
  assert.equal(accessorReads, 0);
  assert.equal(existsSync(databasePath), false);

  assert.throws(
    () =>
      new SqliteCognitionStore({
        databasePath,
        createIfMissing: true,
        unexpected: true,
      } as never),
  );
  assert.equal(existsSync(databasePath), false);

  const nonEnumerableOptions = { databasePath };
  Object.defineProperty(nonEnumerableOptions, "busyTimeoutMs", {
    enumerable: false,
    value: 1,
  });
  assert.throws(
    () =>
      new SqliteCognitionStore(
        nonEnumerableOptions as {
          databasePath: string;
          busyTimeoutMs: number;
        },
      ),
  );
  assert.equal(existsSync(databasePath), false);
});

test("SQLite target rejects hostile reflection without ordinary reads", (t) => {
  const databasePath = temporaryDatabasePath(t);
  let ordinaryReads = 0;
  const hostileOptions = new Proxy(
    { databasePath, createIfMissing: true },
    {
      get() {
        ordinaryReads += 1;
        throw new Error("ordinary property read");
      },
      ownKeys() {
        throw new Error("hostile reflection");
      },
    },
  );

  assert.throws(() => new SqliteCognitionStore(hostileOptions));
  assert.equal(ordinaryReads, 0);
  assert.equal(existsSync(databasePath), false);
});

test("closed SQLite stores reject every operation and close idempotently", async (t) => {
  const databasePath = temporaryDatabasePath(t);
  const store = new SqliteCognitionStore({
    databasePath,
    createIfMissing: true,
  });

  store.close();
  assert.doesNotThrow(() => store.close());
  await assert.rejects(() => store.commitInitial(undefined as never));
  await assert.rejects(() => store.commitTransition(undefined as never));
  await assert.rejects(() => store.getLatestObject("object:missing"));
  await assert.rejects(() =>
    store.getObjectVersion("object:missing", 1),
  );
  await assert.rejects(() => store.listObjectEvents("object:missing"));
});
