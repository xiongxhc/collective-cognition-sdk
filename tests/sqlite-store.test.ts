import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
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
import test, { after } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import {
  createObject,
  createPortableCognitionRecord,
  deserializeObject,
  DomainError,
  DomainErrorCode,
  transitionObject,
} from "../src/index.ts";
import { runCognitionHostConformance } from "../src/host-conformance.ts";
import { InMemoryCognitionEventPublisher } from "../src/reference-host.ts";
import { SqliteCognitionStore } from "../src/stores/sqlite.ts";
import type {
  PortableCognitionEventRecord,
  PortableCognitiveObjectRecord,
  TransitionCognitionCommit,
} from "../src/host-integration.ts";
import type { JsonValue } from "../src/types.ts";

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
const sqliteTest = supportsDefensiveMode ? test : test.skip;
const sqliteStoreUrl = new URL("../src/stores/sqlite.ts", import.meta.url);
const temporaryDirectories = new Set<string>();

after(() => {
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function temporaryDatabasePath(_t: test.TestContext): string {
  const directory = mkdtempSync(
    join(tmpdir(), "collective-cognition-sqlite-"),
  );
  temporaryDirectories.add(directory);
  return join(directory, "cognition.db");
}

function createTemporarySqliteStore(
  t: test.TestContext,
): SqliteCognitionStore {
  return new SqliteCognitionStore({
    databasePath: temporaryDatabasePath(t),
    createIfMissing: true,
  });
}

function probeStore(
  runtimePath: string,
  databasePath: string,
): {
  readonly status: "opened" | "rejected";
  readonly message?: string;
} {
  const script = `
    import { SqliteCognitionStore } from ${JSON.stringify(sqliteStoreUrl.href)};
    let store;
    let result;
    try {
      store = new SqliteCognitionStore({
        databasePath: ${JSON.stringify(databasePath)},
        createIfMissing: true,
      });
      result = { status: "opened" };
    } catch (error) {
      result = {
        status: "rejected",
        message: error instanceof Error ? error.message : String(error),
      };
    } finally {
      store?.close();
    }
    process.stdout.write(JSON.stringify(result));
  `;
  const result = spawnSync(
    runtimePath,
    [
      "--disable-warning=ExperimentalWarning",
      "--input-type=module",
      "--eval",
      script,
    ],
    {
      encoding: "utf8",
      timeout: 10_000,
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.signal, null);
  return JSON.parse(result.stdout) as {
    readonly status: "opened" | "rejected";
    readonly message?: string;
  };
}

async function waitForFiles(paths: readonly string[]): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    if (paths.every((path) => existsSync(path))) {
      return;
    }
    await delay(10);
  }
  assert.fail(`Timed out waiting for ${paths.join(", ")}`);
}

function startRacingCreator(
  databasePath: string,
  readyPath: string,
  startPath: string,
  checkedPath: string,
  peerCheckedPath: string,
): {
  readonly child: ReturnType<typeof spawn>;
  readonly result: Promise<{
    readonly status: "opened" | "rejected";
    readonly message?: string;
  }>;
} {
  const script = `
    import fs from "node:fs";
    import { syncBuiltinESMExports } from "node:module";
    fs.writeFileSync(${JSON.stringify(readyPath)}, "");
    const wait = new Int32Array(new SharedArrayBuffer(4));
    while (!fs.existsSync(${JSON.stringify(startPath)})) {
      Atomics.wait(wait, 0, 0, 10);
    }
    const originalExistsSync = fs.existsSync;
    let crossedTargetCheck = false;
    fs.existsSync = function (path) {
      if (
        !crossedTargetCheck &&
        String(path) === ${JSON.stringify(databasePath)}
      ) {
        fs.writeFileSync(${JSON.stringify(checkedPath)}, "");
        while (!originalExistsSync(${JSON.stringify(peerCheckedPath)})) {
          Atomics.wait(wait, 0, 0, 10);
        }
        crossedTargetCheck = true;
        return false;
      }
      return originalExistsSync(path);
    };
    syncBuiltinESMExports();
    const { SqliteCognitionStore } = await import(
      ${JSON.stringify(sqliteStoreUrl.href)}
    );
    let store;
    let result;
    try {
      store = new SqliteCognitionStore({
        databasePath: ${JSON.stringify(databasePath)},
        createIfMissing: true,
        busyTimeoutMs: 60_000,
      });
      result = { status: "opened" };
    } catch (error) {
      result = {
        status: "rejected",
        message: error instanceof Error ? error.message : String(error),
      };
    } finally {
      store?.close();
    }
    process.stdout.write(JSON.stringify(result));
  `;
  const child = spawn(
    process.execPath,
    [
      "--disable-warning=ExperimentalWarning",
      "--input-type=module",
      "--eval",
      script,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const result = new Promise<{
    readonly status: "opened" | "rejected";
    readonly message?: string;
  }>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code !== 0 || signal !== null) {
        reject(
          new Error(
            `SQLite race child failed: ${stderr || stdout || `${code}/${signal}`}`,
          ),
        );
        return;
      }
      resolve(
        JSON.parse(stdout) as {
          readonly status: "opened" | "rejected";
          readonly message?: string;
        },
      );
    });
  });
  return { child, result };
}

function startContendingWriter(
  databasePath: string,
  readyPath: string,
  transition: TransitionCognitionCommit,
): {
  readonly child: ReturnType<typeof spawn>;
  readonly result: Promise<{
    readonly elapsedMilliseconds: number;
    readonly outcome?: unknown;
    readonly message?: string;
  }>;
} {
  const script = `
    import fs from "node:fs";
    import { DatabaseSync } from "node:sqlite";
    import { SqliteCognitionStore } from ${JSON.stringify(sqliteStoreUrl.href)};
    const store = new SqliteCognitionStore({
      databasePath: ${JSON.stringify(databasePath)},
    });
    const originalExec = DatabaseSync.prototype.exec;
    DatabaseSync.prototype.exec = function (sql) {
      if (sql.trim() === "BEGIN IMMEDIATE") {
        fs.writeFileSync(${JSON.stringify(readyPath)}, "");
      }
      return originalExec.call(this, sql);
    };
    const startedAt = performance.now();
    let result;
    try {
      const outcome = await store.commitTransition(
        ${JSON.stringify(transition)}
      );
      result = {
        elapsedMilliseconds: performance.now() - startedAt,
        outcome,
      };
    } catch (error) {
      result = {
        elapsedMilliseconds: performance.now() - startedAt,
        message: error instanceof Error ? error.message : String(error),
      };
    } finally {
      DatabaseSync.prototype.exec = originalExec;
      store.close();
    }
    process.stdout.write(JSON.stringify(result));
  `;
  const child = spawn(
    process.execPath,
    [
      "--disable-warning=ExperimentalWarning",
      "--input-type=module",
      "--eval",
      script,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const result = new Promise<{
    readonly elapsedMilliseconds: number;
    readonly outcome?: unknown;
    readonly message?: string;
  }>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code !== 0 || signal !== null) {
        reject(
          new Error(
            `SQLite contention child failed: ${
              stderr || stdout || `${code}/${signal}`
            }`,
          ),
        );
        return;
      }
      resolve(
        JSON.parse(stdout) as {
          readonly elapsedMilliseconds: number;
          readonly outcome?: unknown;
          readonly message?: string;
        },
      );
    });
  });
  return { child, result };
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
  schema: string = cognitionSchema,
): void {
  createDatabase(
    databasePath,
    `
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
        '2026-07-29T00:00:00.000Z'
      );
    `,
  );
}

function objectRecord({
  id = "goal:sqlite-store",
  version = 1,
  title = "SQLite cognition store",
}: {
  readonly id?: string;
  readonly version?: number;
  readonly title?: string;
} = {}): PortableCognitiveObjectRecord {
  const object = createObject({
    id,
    type: "goal",
    version: 1,
    state: "draft",
    title,
    data: { objective: "Verify durable SQLite cognition." },
    createdAt: "2026-07-29T08:00:00.000Z",
    updatedAt: "2026-07-29T08:00:00.000Z",
    attribution: {
      initiatorId: "human:creator",
      executorId: "human:creator",
      accountableId: "human:owner",
    },
    provenance: [
      {
        source: "test",
        sourceId: id,
        capturedAt: "2026-07-29T08:00:00.000Z",
      },
    ],
    contextId: "organization:test",
    relationships: [],
  });
  return createPortableCognitionRecord({
    schemaVersion: "0.1.0",
    recordType: "cognitive-object",
    payload: version === 1
      ? object
      : deserializeObject(JSON.stringify({ ...object, version })),
  }) as PortableCognitiveObjectRecord;
}

function transitionCommit({
  id = "goal:sqlite-store",
  expectedVersion = 1,
  eventId = `event:${id}:${expectedVersion + 1}`,
}: {
  readonly id?: string;
  readonly expectedVersion?: number;
  readonly eventId?: string;
} = {}): TransitionCognitionCommit {
  const previous = deserializeObject(
    JSON.stringify(objectRecord({ id, version: expectedVersion }).payload),
  );
  const transition = transitionObject(previous, "active", {
    eventId,
    occurredAt: `2026-07-29T08:0${expectedVersion}:00.000Z`,
    initiator: { id: "human:creator", kind: "human" },
    executor: { id: "human:creator", kind: "human" },
    accountableParty: { id: "human:owner", kind: "human" },
    automationMode: "manual",
    consequenceLevel: "routine",
    rationale: "Activate durable SQLite cognition.",
  });
  return {
    expectedVersion,
    object: createPortableCognitionRecord({
      schemaVersion: "0.1.0",
      recordType: "cognitive-object",
      payload: transition.object,
    }) as PortableCognitiveObjectRecord,
    event: createPortableCognitionRecord({
      schemaVersion: "0.1.0",
      recordType: "cognition-event",
      payload: transition.event,
    }) as PortableCognitionEventRecord,
  };
}

function mutateTitle(
  record: PortableCognitiveObjectRecord,
  title: string,
): PortableCognitiveObjectRecord {
  const value = structuredClone(record) as unknown as {
    payload: Record<string, unknown>;
  };
  value.payload.title = title;
  return value as unknown as PortableCognitiveObjectRecord;
}

function reorderRecord<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(reorderRecord) as T;
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  const reordered: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort().reverse()) {
    reordered[key] = reorderRecord(
      (value as Record<string, unknown>)[key],
    );
  }
  return reordered as T;
}

function canonicalizeForTest(value: JsonValue): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeForTest).join(",")}]`;
  }
  const record = value as Record<string, JsonValue>;
  return `{${Object.keys(record)
    .sort()
    .map((key) =>
      `${JSON.stringify(key)}:${canonicalizeForTest(record[key]!)}`
    )
    .join(",")}}`;
}

function assertDeeplyFrozen(value: unknown): void {
  if (typeof value !== "object" || value === null) {
    return;
  }
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) {
    assertDeeplyFrozen(child);
  }
}

interface StoredCognitionRows {
  readonly objects: readonly (readonly unknown[])[];
  readonly events: readonly (readonly unknown[])[];
}

function snapshotCognitionRows(
  databasePath: string,
): StoredCognitionRows {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const objects = database
      .prepare(
        `
          SELECT object_id, object_version, object_type, record_json
          FROM cognition_objects
          ORDER BY object_id, object_version
        `,
      )
      .all()
      .map((row) => {
        const value = row as Record<string, unknown>;
        return [
          value.object_id,
          value.object_version,
          value.object_type,
          value.record_json,
        ];
      });
    const events = database
      .prepare(
        `
          SELECT event_id, object_id, object_version, record_json
          FROM cognition_events
          ORDER BY object_id, object_version, event_id
        `,
      )
      .all()
      .map((row) => {
        const value = row as Record<string, unknown>;
        return [
          value.event_id,
          value.object_id,
          value.object_version,
          value.record_json,
        ];
      });
    return { objects, events };
  } finally {
    database.close();
  }
}

function insertObjectRow(
  database: DatabaseSync,
  object: PortableCognitiveObjectRecord,
): void {
  database
    .prepare(
      `
        INSERT INTO cognition_objects (
          object_id,
          object_version,
          object_type,
          record_json
        ) VALUES (?, ?, ?, ?)
      `,
    )
    .run(
      object.payload.id,
      object.payload.version,
      object.payload.type,
      canonicalizeForTest(object as unknown as JsonValue),
    );
}

function insertEventRow(
  database: DatabaseSync,
  event: PortableCognitionEventRecord,
): void {
  database
    .prepare(
      `
        INSERT INTO cognition_events (
          event_id,
          object_id,
          object_version,
          record_json
        ) VALUES (?, ?, ?, ?)
      `,
    )
    .run(
      event.payload.id,
      event.payload.objectId,
      event.payload.objectVersion,
      canonicalizeForTest(event as unknown as JsonValue),
    );
}

function isSerializationFailure(error: unknown): boolean {
  return error instanceof DomainError &&
    error.code === DomainErrorCode.SERIALIZATION_ERROR;
}

test("SQLite adapter preserves the package and root Node engine range", () => {
  const packageJson = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { readonly engines?: { readonly node?: unknown } };

  assert.equal(packageJson.engines?.node, ">=24");
});

test(
  "SQLite runtime gating does not treat Node 25 version data as capability",
  () => {
    assert.equal(
      supportsSqliteStoreRuntime({
        nodeVersion: "25.0.0",
        enableDefensive: undefined,
        defensiveModeIsEnforced() {
          assert.fail("enforcement probe must not run without the API");
        },
      }),
      false,
    );
  },
);

if (!supportsDefensiveMode) {
  test("SQLite runtime fails before creating a target without defensive support", (t) => {
    const databasePath = temporaryDatabasePath(t);
    const result = probeStore(process.execPath, databasePath);

    assert.equal(result.status, "rejected");
    assert.match(
      result.message ?? "",
      /node:sqlite with enforced defensive mode/,
    );
    assert.equal(existsSync(databasePath), false);
  });
}

sqliteTest(
  "SQLite runtime fails closed when defensive mode is not enforced",
  (t) => {
    const databasePath = temporaryDatabasePath(t);
    const prototype = DatabaseSync.prototype;
    const originalEnableDefensive = prototype.enableDefensive;
    let openedStore: SqliteCognitionStore | undefined;
    prototype.enableDefensive = function (_active: boolean): void {
      originalEnableDefensive.call(this, false);
    };

    try {
      assert.throws(
        () => {
          openedStore = new SqliteCognitionStore({
            databasePath,
            createIfMissing: true,
          });
        },
        /defensive mode/,
      );
    } finally {
      openedStore?.close();
      prototype.enableDefensive = originalEnableDefensive;
    }
    assert.equal(existsSync(databasePath), false);
  },
);

sqliteTest(
  "SQLite target publishes exactly one of two racing creators",
  async (t) => {
    const databasePath = temporaryDatabasePath(t);
    const directory = join(databasePath, "..");
    const readyPaths = [
      join(directory, "creator-one.ready"),
      join(directory, "creator-two.ready"),
    ];
    const checkedPaths = [
      join(directory, "creator-one.checked"),
      join(directory, "creator-two.checked"),
    ];
    const startPath = join(directory, "creators.start");
    const creators = readyPaths.map((readyPath, index) =>
      startRacingCreator(
        databasePath,
        readyPath,
        startPath,
        checkedPaths[index]!,
        checkedPaths[1 - index]!,
      ),
    );
    t.after(() => {
      for (const { child } of creators) {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill();
        }
      }
    });

    await waitForFiles(readyPaths);
    writeFileSync(startPath, "");
    const results = await Promise.all(
      creators.map(({ result }) => result),
    );

    assert.deepEqual(
      results.map(({ status }) => status).sort(),
      ["opened", "rejected"],
    );
    const store = new SqliteCognitionStore({ databasePath });
    store.close();
    const database = new DatabaseSync(databasePath, { readOnly: true });
    try {
      const marker = database
        .prepare(
          `
            SELECT adapter_id, schema_version
            FROM cognition_schema
            WHERE singleton = 1
          `,
        )
        .get() as { readonly adapter_id: unknown; readonly schema_version: unknown };
      assert.deepEqual(
        {
          adapter_id: marker.adapter_id,
          schema_version: marker.schema_version,
        },
        {
          adapter_id: "collective-cognition-sdk:sqlite-store",
          schema_version: 1,
        },
      );
    } finally {
      database.close();
    }
  },
);

sqliteTest("SQLite target rejects implicit and non-absolute paths", () => {
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

sqliteTest("SQLite target leaves a missing path absent by default", (t) => {
  const databasePath = temporaryDatabasePath(t);

  assert.throws(() => new SqliteCognitionStore({ databasePath }));
  assert.equal(existsSync(databasePath), false);
});

sqliteTest("SQLite schema creation writes the exact version-one identity", (t) => {
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

sqliteTest("SQLite schema accepts its own version-one database", (t) => {
  const databasePath = temporaryDatabasePath(t);
  createMarkedCognitionDatabase(databasePath, 1);
  const before = snapshotFile(databasePath);

  const store = new SqliteCognitionStore({ databasePath });
  store.close();

  assert.deepEqual(snapshotFile(databasePath), before);
});

sqliteTest("SQLite target rejects an existing empty file without mutation", (t) => {
  const databasePath = temporaryDatabasePath(t);
  writeFileSync(databasePath, "");

  assertRejectedWithoutMutation(databasePath, snapshotFile(databasePath));
});

sqliteTest("SQLite target rejects a team-memory events database without mutation", (t) => {
  const databasePath = temporaryDatabasePath(t);
  createDatabase(databasePath, teamMemorySchema);

  assertRejectedWithoutMutation(databasePath, snapshotFile(databasePath));
});

sqliteTest("SQLite target rejects an unrelated database without mutation", (t) => {
  const databasePath = temporaryDatabasePath(t);
  createDatabase(
    databasePath,
    "CREATE TABLE unrelated (id INTEGER PRIMARY KEY, value TEXT);",
  );

  assertRejectedWithoutMutation(databasePath, snapshotFile(databasePath));
});

sqliteTest("SQLite schema rejects an unknown cognition version without mutation", (t) => {
  const databasePath = temporaryDatabasePath(t);
  createMarkedCognitionDatabase(databasePath, 3);

  assertRejectedWithoutMutation(databasePath, snapshotFile(databasePath));
});

sqliteTest(
  "SQLite schema rejects a hybrid cognition and team-memory database without mutation",
  (t) => {
    const databasePath = temporaryDatabasePath(t);
    createMarkedCognitionDatabase(
      databasePath,
      1,
      `${cognitionSchema}\n${teamMemorySchema}`,
    );

    assertRejectedWithoutMutation(
      databasePath,
      snapshotFile(databasePath),
    );
  },
);

sqliteTest(
  "SQLite schema rejects extra tables views and triggers without mutation",
  (t) => {
    for (const [name, extraSql] of [
      [
        "table",
        "CREATE TABLE extra_table (id INTEGER PRIMARY KEY) STRICT;",
      ],
      [
        "view",
        "CREATE VIEW extra_view AS SELECT object_id FROM cognition_objects;",
      ],
      [
        "trigger",
        `
          CREATE TRIGGER extra_trigger
          AFTER INSERT ON cognition_objects
          BEGIN
            SELECT 1;
          END;
        `,
      ],
    ] as const) {
      const databasePath = join(
        temporaryDatabasePath(t),
        `../extra-${name}.db`,
      );
      createMarkedCognitionDatabase(
        databasePath,
        1,
        `${cognitionSchema}\n${extraSql}`,
      );

      assertRejectedWithoutMutation(
        databasePath,
        snapshotFile(databasePath),
      );
    }
  },
);

sqliteTest(
  "SQLite schema rejects malformed marked version-one structures without mutation",
  (t) => {
    const malformedSchemas = [
      cognitionSchema.replace(
        "object_type TEXT NOT NULL",
        "object_type INTEGER NOT NULL",
      ),
      cognitionSchema.replace(
        "PRIMARY KEY (object_id, object_version)",
        "UNIQUE (object_id, object_version)",
      ),
      cognitionSchema.replace(
        "object_version INTEGER NOT NULL CHECK (object_version > 0)",
        "object_version INTEGER NOT NULL",
      ),
      cognitionSchema.replace(
        "REFERENCES cognition_objects (object_id, object_version)",
        `
          REFERENCES cognition_objects (object_id, object_version)
          ON DELETE CASCADE
        `,
      ),
    ];

    for (const [index, schema] of malformedSchemas.entries()) {
      const databasePath = join(
        temporaryDatabasePath(t),
        `../malformed-${index}.db`,
      );
      createMarkedCognitionDatabase(databasePath, 1, schema);

      assertRejectedWithoutMutation(
        databasePath,
        snapshotFile(databasePath),
      );
    }
  },
);

sqliteTest("SQLite target accepts only bounded safe-integer busy timeouts", (t) => {
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

sqliteTest("SQLite target snapshots exact own enumerable option data", (t) => {
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

sqliteTest("SQLite target rejects hostile reflection without ordinary reads", (t) => {
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

sqliteTest("closed SQLite stores reject every operation and close idempotently", async (t) => {
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

sqliteTest(
  "SQLite initial commit survives restart with canonical latest and version-one reads",
  async (t) => {
    const databasePath = temporaryDatabasePath(t);
    const object = objectRecord();
    const store = new SqliteCognitionStore({
      databasePath,
      createIfMissing: true,
    });

    assert.deepEqual(await store.commitInitial({ object }), {
      status: "committed",
    });
    store.close();

    const database = new DatabaseSync(databasePath, { readOnly: true });
    try {
      const row = database
        .prepare(
          `
            SELECT object_id, object_version, object_type, record_json
            FROM cognition_objects
          `,
        )
        .get() as Record<string, unknown>;
      assert.deepEqual(
        [
          row.object_id,
          row.object_version,
          row.object_type,
          row.record_json,
        ],
        [
          object.payload.id,
          1,
          object.payload.type,
          canonicalizeForTest(object as unknown as JsonValue),
        ],
      );
    } finally {
      database.close();
    }

    const reopened = new SqliteCognitionStore({ databasePath });
    t.after(() => reopened.close());
    assert.deepEqual(
      await reopened.getLatestObject(object.payload.id),
      object,
    );
    assert.deepEqual(
      await reopened.getObjectVersion(object.payload.id, 1),
      object,
    );
    assert.equal(
      await reopened.getObjectVersion(object.payload.id, 2),
      undefined,
    );
  },
);

sqliteTest(
  "SQLite initial replay is canonical and changed content collides without mutation",
  async (t) => {
    const databasePath = temporaryDatabasePath(t);
    const object = objectRecord();
    const reordered = reorderRecord(object);
    const store = new SqliteCognitionStore({
      databasePath,
      createIfMissing: true,
    });
    t.after(() => store.close());

    await store.commitInitial({ object });
    assert.notEqual(JSON.stringify(reordered), JSON.stringify(object));
    assert.deepEqual(await store.commitInitial({ object: reordered }), {
      status: "already_committed",
    });
    assert.deepEqual(
      await store.commitInitial({
        object: objectRecord({ title: "Changed SQLite title" }),
      }),
      {
        status: "conflict",
        conflict: {
          code: "object_revision_collision",
          objectId: object.payload.id,
        },
      },
    );
    assert.deepEqual(await store.getLatestObject(object.payload.id), object);
    assert.deepEqual(
      await store.getObjectVersion(object.payload.id, 1),
      object,
    );
  },
);

sqliteTest(
  "SQLite initial commit rejects higher gapped partial and orphaned history without mutation",
  async (t) => {
    const cases = [
      {
        name: "higher-only object",
        foreignKeys: true,
        seed(database: DatabaseSync, objectId: string) {
          insertObjectRow(database, objectRecord({ id: objectId, version: 2 }));
        },
      },
      {
        name: "gapped object and event history",
        foreignKeys: true,
        seed(database: DatabaseSync, objectId: string) {
          insertObjectRow(database, objectRecord({ id: objectId }));
          const third = transitionCommit({
            id: objectId,
            expectedVersion: 2,
          });
          insertObjectRow(database, third.object);
          insertEventRow(database, third.event);
        },
      },
      {
        name: "partial object history",
        foreignKeys: true,
        seed(database: DatabaseSync, objectId: string) {
          insertObjectRow(database, objectRecord({ id: objectId }));
          insertObjectRow(database, transitionCommit({ id: objectId }).object);
        },
      },
      {
        name: "orphaned event history",
        foreignKeys: false,
        seed(database: DatabaseSync, objectId: string) {
          insertObjectRow(database, objectRecord({ id: objectId }));
          insertEventRow(database, transitionCommit({ id: objectId }).event);
        },
      },
    ] as const;

    for (const [index, entry] of cases.entries()) {
      const databasePath = join(
        temporaryDatabasePath(t),
        `../invalid-initial-history-${index}.db`,
      );
      const objectId = `goal:sqlite-initial-history:${index}`;
      const initial = objectRecord({ id: objectId });
      const created = new SqliteCognitionStore({
        databasePath,
        createIfMissing: true,
      });
      created.close();
      const database = new DatabaseSync(databasePath, {
        enableForeignKeyConstraints: entry.foreignKeys,
      });
      try {
        entry.seed(database, objectId);
      } finally {
        database.close();
      }
      const before = snapshotCognitionRows(databasePath);
      const store = new SqliteCognitionStore({ databasePath });

      try {
        await assert.rejects(
          () => store.commitInitial({ object: initial }),
          /Stored cognition history is inconsistent/,
          entry.name,
        );
        assert.deepEqual(
          snapshotCognitionRows(databasePath),
          before,
          entry.name,
        );
      } finally {
        store.close();
      }
    }
  },
);

sqliteTest(
  "SQLite initial commit rejects mutually inconsistent object and event records without mutation",
  async (t) => {
    const cases = [
      {
        name: "contradictory next state",
        changes: {
          type: "GoalAtRisk",
          previousState: "active",
          nextState: "at_risk",
        },
      },
      {
        name: "contradictory occurred at",
        changes: {
          occurredAt: "2026-07-29T08:02:00.000Z",
        },
      },
      {
        name: "contradictory object type",
        changes: {
          type: "ExperimentActive",
          objectType: "experiment",
          previousState: "planned",
        },
      },
    ] as const;

    for (const [index, entry] of cases.entries()) {
      const databasePath = join(
        temporaryDatabasePath(t),
        `../inconsistent-object-event-${index}.db`,
      );
      const objectId = `goal:sqlite-object-event:${index}`;
      const initial = objectRecord({ id: objectId });
      const transition = transitionCommit({ id: objectId });
      const store = new SqliteCognitionStore({
        databasePath,
        createIfMissing: true,
      });
      try {
        await store.commitInitial({ object: initial });
        await store.commitTransition(transition);
      } finally {
        store.close();
      }

      const event = createPortableCognitionRecord({
        schemaVersion: "0.1.0",
        recordType: "cognition-event",
        payload: {
          ...transition.event.payload,
          ...entry.changes,
        },
      }) as PortableCognitionEventRecord;
      const database = new DatabaseSync(databasePath);
      try {
        database
          .prepare(
            `
              UPDATE cognition_events
              SET record_json = ?
              WHERE event_id = ?
            `,
          )
          .run(
            canonicalizeForTest(event as unknown as JsonValue),
            event.payload.id,
          );
      } finally {
        database.close();
      }

      const before = snapshotCognitionRows(databasePath);
      const reopened = new SqliteCognitionStore({ databasePath });
      try {
        await assert.rejects(
          () => reopened.commitInitial({ object: initial }),
          /Stored cognition history is inconsistent/,
          entry.name,
        );
        assert.deepEqual(
          snapshotCognitionRows(databasePath),
          before,
          entry.name,
        );
      } finally {
        reopened.close();
      }
    }
  },
);

sqliteTest("SQLite malformed stored object JSON fails closed", async (t) => {
  const databasePath = temporaryDatabasePath(t);
  const store = new SqliteCognitionStore({
    databasePath,
    createIfMissing: true,
  });
  store.close();
  const database = new DatabaseSync(databasePath);
  try {
    database
      .prepare(
        `
          INSERT INTO cognition_objects (
            object_id,
            object_version,
            object_type,
            record_json
          ) VALUES (?, ?, ?, ?)
        `,
      )
      .run("goal:malformed", 1, "goal", "{");
  } finally {
    database.close();
  }

  const reopened = new SqliteCognitionStore({ databasePath });
  t.after(() => reopened.close());
  await assert.rejects(
    () => reopened.getLatestObject("goal:malformed"),
    isSerializationFailure,
  );
  await assert.rejects(
    () => reopened.getObjectVersion("goal:malformed", 1),
    isSerializationFailure,
  );
});

sqliteTest(
  "SQLite initial reads are detached and deeply frozen",
  async (t) => {
    const databasePath = temporaryDatabasePath(t);
    const object = objectRecord();
    const store = new SqliteCognitionStore({
      databasePath,
      createIfMissing: true,
    });
    t.after(() => store.close());
    await store.commitInitial({ object });

    const latest = await store.getLatestObject(object.payload.id);
    const version = await store.getObjectVersion(object.payload.id, 1);
    assert.ok(latest);
    assert.ok(version);
    assert.notStrictEqual(latest, object);
    assert.notStrictEqual(version, object);
    assert.notStrictEqual(latest, version);
    assert.notStrictEqual(latest.payload, version.payload);
    assertDeeplyFrozen(latest);
    assertDeeplyFrozen(version);
  },
);

sqliteTest(
  "SQLite object row identity rejects mismatched metadata on latest and version reads",
  async (t) => {
    const cases = [
      {
        name: "object ID",
        updateSql: "UPDATE cognition_objects SET object_id = ?",
        value: "goal:sqlite-row-identity:stored-id",
        lookupId: "goal:sqlite-row-identity:stored-id",
        lookupVersion: 1,
      },
      {
        name: "object version",
        updateSql: "UPDATE cognition_objects SET object_version = ?",
        value: 2,
        lookupId: "goal:sqlite-row-identity:object-version",
        lookupVersion: 2,
      },
      {
        name: "object type",
        updateSql: "UPDATE cognition_objects SET object_type = ?",
        value: "hypothesis",
        lookupId: "goal:sqlite-row-identity:object-type",
        lookupVersion: 1,
      },
    ] as const;

    for (const entry of cases) {
      const databasePath = temporaryDatabasePath(t);
      const objectId = entry.name === "object ID"
        ? "goal:sqlite-row-identity:payload-id"
        : entry.lookupId;
      const store = new SqliteCognitionStore({
        databasePath,
        createIfMissing: true,
      });
      await store.commitInitial({ object: objectRecord({ id: objectId }) });
      store.close();

      const database = new DatabaseSync(databasePath);
      try {
        database.prepare(entry.updateSql).run(entry.value);
      } finally {
        database.close();
      }
      const before = snapshotCognitionRows(databasePath);
      const reopened = new SqliteCognitionStore({ databasePath });
      t.after(() => reopened.close());

      await assert.rejects(
        () => reopened.getLatestObject(entry.lookupId),
        /Stored cognitive object is invalid/,
        `${entry.name} latest`,
      );
      await assert.rejects(
        () =>
          reopened.getObjectVersion(
            entry.lookupId,
            entry.lookupVersion,
          ),
        /Stored cognitive object is invalid/,
        `${entry.name} version`,
      );
      assert.deepEqual(snapshotCognitionRows(databasePath), before);
    }
  },
);

sqliteTest(
  "SQLite transition persists object and event together across restart",
  async (t) => {
    const databasePath = temporaryDatabasePath(t);
    const initial = objectRecord();
    const transition = transitionCommit();
    const store = new SqliteCognitionStore({
      databasePath,
      createIfMissing: true,
    });
    t.after(() => store.close());
    await store.commitInitial({ object: initial });

    assert.deepEqual(await store.commitTransition(transition), {
      status: "committed",
    });
    store.close();

    const stored = snapshotCognitionRows(databasePath);
    assert.equal(stored.objects.length, 2);
    assert.deepEqual(stored.events, [
      [
        transition.event.payload.id,
        transition.object.payload.id,
        2,
        canonicalizeForTest(
          transition.event as unknown as JsonValue,
        ),
      ],
    ]);

    const reopened = new SqliteCognitionStore({ databasePath });
    t.after(() => reopened.close());
    assert.deepEqual(
      await reopened.getObjectVersion(initial.payload.id, 1),
      initial,
    );
    assert.deepEqual(
      await reopened.getObjectVersion(initial.payload.id, 2),
      transition.object,
    );
    assert.deepEqual(
      await reopened.getLatestObject(initial.payload.id),
      transition.object,
    );
    const events = await reopened.listObjectEvents(initial.payload.id);
    assert.deepEqual(events, [transition.event]);
    assert.equal(Object.isFrozen(events), true);
    assert.notStrictEqual(events[0], transition.event);
    assertDeeplyFrozen(events[0]);
  },
);

sqliteTest(
  "SQLite transition reordered replay is already committed after restart",
  async (t) => {
    const databasePath = temporaryDatabasePath(t);
    const initial = objectRecord();
    const transition = transitionCommit();
    const store = new SqliteCognitionStore({
      databasePath,
      createIfMissing: true,
    });
    await store.commitInitial({ object: initial });
    await store.commitTransition(transition);
    store.close();

    const reopened = new SqliteCognitionStore({ databasePath });
    t.after(() => reopened.close());
    const reordered = {
      expectedVersion: transition.expectedVersion,
      object: reorderRecord(transition.object),
      event: reorderRecord(transition.event),
    };
    assert.notEqual(
      JSON.stringify(reordered.object),
      JSON.stringify(transition.object),
    );
    assert.notEqual(
      JSON.stringify(reordered.event),
      JSON.stringify(transition.event),
    );
    assert.deepEqual(await reopened.commitTransition(reordered), {
      status: "already_committed",
    });
    assert.deepEqual(
      await reopened.getLatestObject(initial.payload.id),
      transition.object,
    );
    assert.deepEqual(
      await reopened.listObjectEvents(initial.payload.id),
      [transition.event],
    );
  },
);

sqliteTest(
  "SQLite conflict precedence leaves every stored row unchanged",
  async (t) => {
    const replayPath = temporaryDatabasePath(t);
    const replayInitial = objectRecord({
      id: "goal:sqlite-precedence:replay",
    });
    const replaySecond = transitionCommit({
      id: replayInitial.payload.id,
      eventId: "event:sqlite-precedence:replay:2",
    });
    const replayThird = transitionCommit({
      id: replayInitial.payload.id,
      expectedVersion: 2,
      eventId: "event:sqlite-precedence:replay:3",
    });
    const replayStore = new SqliteCognitionStore({
      databasePath: replayPath,
      createIfMissing: true,
    });
    t.after(() => replayStore.close());
    await replayStore.commitInitial({ object: replayInitial });
    await replayStore.commitTransition(replaySecond);
    await replayStore.commitTransition(replayThird);
    const replayRows = snapshotCognitionRows(replayPath);

    assert.deepEqual(await replayStore.commitTransition(replaySecond), {
      status: "already_committed",
    });
    assert.deepEqual(snapshotCognitionRows(replayPath), replayRows);

    const objectCollision = transitionCommit({
      id: replayInitial.payload.id,
      expectedVersion: 2,
      eventId: replaySecond.event.payload.id,
    });
    assert.deepEqual(
      await replayStore.commitTransition({
        ...objectCollision,
        object: mutateTitle(
          objectCollision.object,
          "Changed target revision",
        ),
      }),
      {
        status: "conflict",
        conflict: {
          code: "object_revision_collision",
          objectId: replayInitial.payload.id,
        },
      },
    );
    assert.deepEqual(snapshotCognitionRows(replayPath), replayRows);

    const eventPath = temporaryDatabasePath(t);
    const eventOwner = objectRecord({
      id: "goal:sqlite-precedence:event-owner",
    });
    const sharedEventId = "event:sqlite-precedence:shared";
    const ownerTransition = transitionCommit({
      id: eventOwner.payload.id,
      eventId: sharedEventId,
    });
    const staleTarget = objectRecord({
      id: "goal:sqlite-precedence:stale-target",
    });
    const eventStore = new SqliteCognitionStore({
      databasePath: eventPath,
      createIfMissing: true,
    });
    t.after(() => eventStore.close());
    await eventStore.commitInitial({ object: eventOwner });
    await eventStore.commitTransition(ownerTransition);
    await eventStore.commitInitial({ object: staleTarget });
    const eventRows = snapshotCognitionRows(eventPath);

    const eventCollision = transitionCommit({
      id: staleTarget.payload.id,
      expectedVersion: 2,
      eventId: sharedEventId,
    });
    assert.deepEqual(await eventStore.commitTransition(eventCollision), {
      status: "conflict",
      conflict: {
        code: "event_id_collision",
        objectId: staleTarget.payload.id,
        eventId: sharedEventId,
      },
    });
    assert.deepEqual(snapshotCognitionRows(eventPath), eventRows);

    const staleOnly = transitionCommit({
      id: staleTarget.payload.id,
      expectedVersion: 2,
      eventId: "event:sqlite-precedence:stale-only",
    });
    assert.deepEqual(await eventStore.commitTransition(staleOnly), {
      status: "conflict",
      conflict: {
        code: "version_conflict",
        objectId: staleTarget.payload.id,
        expectedVersion: 2,
        actualVersion: 1,
      },
    });
    assert.deepEqual(snapshotCognitionRows(eventPath), eventRows);
  },
);

sqliteTest(
  "SQLite rollback removes the object revision when event insertion fails",
  async (t) => {
    const databasePath = temporaryDatabasePath(t);
    const initial = objectRecord();
    const transition = transitionCommit();
    const store = new SqliteCognitionStore({
      databasePath,
      createIfMissing: true,
    });
    t.after(() => store.close());
    await store.commitInitial({ object: initial });
    const before = snapshotCognitionRows(databasePath);

    const injector = new DatabaseSync(databasePath);
    try {
      injector.exec(`
        CREATE TRIGGER fail_cognition_event_insert
        BEFORE INSERT ON cognition_events
        BEGIN
          SELECT RAISE(FAIL, 'injected event insert failure');
        END;
      `);
    } finally {
      injector.close();
    }

    await assert.rejects(
      () => store.commitTransition(transition),
      /injected event insert failure/,
    );
    assert.deepEqual(snapshotCognitionRows(databasePath), before);
    assert.deepEqual(
      await store.getLatestObject(initial.payload.id),
      initial,
    );
    assert.equal(
      await store.getObjectVersion(initial.payload.id, 2),
      undefined,
    );
    assert.deepEqual(await store.listObjectEvents(initial.payload.id), []);
  },
);

sqliteTest(
  "SQLite transition partial pre-existing object or event state fails closed",
  async (t) => {
    const objectPath = temporaryDatabasePath(t);
    const objectInitial = objectRecord({
      id: "goal:sqlite-partial:object",
    });
    const objectTransition = transitionCommit({
      id: objectInitial.payload.id,
    });
    const objectStore = new SqliteCognitionStore({
      databasePath: objectPath,
      createIfMissing: true,
    });
    await objectStore.commitInitial({ object: objectInitial });
    objectStore.close();
    const objectDatabase = new DatabaseSync(objectPath);
    try {
      insertObjectRow(objectDatabase, objectTransition.object);
    } finally {
      objectDatabase.close();
    }
    const partialObjectRows = snapshotCognitionRows(objectPath);
    const reopenedObjectStore = new SqliteCognitionStore({
      databasePath: objectPath,
    });
    t.after(() => reopenedObjectStore.close());
    await assert.rejects(
      () => reopenedObjectStore.commitTransition(objectTransition),
      /only partially committed/,
    );
    assert.deepEqual(
      snapshotCognitionRows(objectPath),
      partialObjectRows,
    );

    const eventPath = temporaryDatabasePath(t);
    const eventInitial = objectRecord({
      id: "goal:sqlite-partial:event",
    });
    const eventTransition = transitionCommit({
      id: eventInitial.payload.id,
    });
    const eventStore = new SqliteCognitionStore({
      databasePath: eventPath,
      createIfMissing: true,
    });
    await eventStore.commitInitial({ object: eventInitial });
    eventStore.close();
    const eventDatabase = new DatabaseSync(eventPath, {
      enableForeignKeyConstraints: false,
    });
    try {
      insertEventRow(eventDatabase, eventTransition.event);
    } finally {
      eventDatabase.close();
    }
    const partialEventRows = snapshotCognitionRows(eventPath);
    const reopenedEventStore = new SqliteCognitionStore({
      databasePath: eventPath,
    });
    t.after(() => reopenedEventStore.close());
    await assert.rejects(
      () => reopenedEventStore.commitTransition(eventTransition),
      /only partially committed/,
    );
    assert.deepEqual(
      snapshotCognitionRows(eventPath),
      partialEventRows,
    );
  },
);

sqliteTest(
  "SQLite transition detects a different event occupying the target version slot before stale",
  async (t) => {
    const databasePath = temporaryDatabasePath(t);
    const objectId = "goal:sqlite-occupied-event-slot";
    const initial = objectRecord({ id: objectId });
    const occupant = transitionCommit({
      id: objectId,
      expectedVersion: 2,
      eventId: "event:sqlite-occupied-event-slot:occupant",
    });
    const proposed = transitionCommit({
      id: objectId,
      expectedVersion: 2,
      eventId: "event:sqlite-occupied-event-slot:proposed",
    });
    const store = new SqliteCognitionStore({
      databasePath,
      createIfMissing: true,
    });
    await store.commitInitial({ object: initial });
    store.close();

    const database = new DatabaseSync(databasePath, {
      enableForeignKeyConstraints: false,
    });
    try {
      insertEventRow(database, occupant.event);
    } finally {
      database.close();
    }
    const before = snapshotCognitionRows(databasePath);
    const reopened = new SqliteCognitionStore({ databasePath });
    t.after(() => reopened.close());

    await assert.rejects(
      () => reopened.commitTransition(proposed),
      /only partially committed/,
    );
    assert.deepEqual(snapshotCognitionRows(databasePath), before);
    assert.deepEqual(
      await reopened.getLatestObject(objectId),
      initial,
    );
    assert.equal(
      await reopened.getObjectVersion(objectId, 3),
      undefined,
    );
  },
);

sqliteTest("SQLite host conformance", async (t) => {
  const stores: SqliteCognitionStore[] = [];

  try {
    const result = await runCognitionHostConformance({
      createStore() {
        const store = createTemporarySqliteStore(t);
        stores.push(store);
        return store;
      },
      createPublisher() {
        return new InMemoryCognitionEventPublisher();
      },
    });

    assert.deepEqual(
      result.cases.filter((item) => item.status !== "passed"),
      [],
    );
  } finally {
    for (const store of stores) {
      store.close();
    }
  }
});

sqliteTest(
  "SQLite concurrent writers preserve the winning target revision",
  async (t) => {
    const databasePath = temporaryDatabasePath(t);
    const objectId = "goal:sqlite-concurrent-target";
    const initial = objectRecord({ id: objectId });
    const winning = transitionCommit({
      id: objectId,
      eventId: "event:sqlite-concurrent-target:winner",
    });
    const losingBase = transitionCommit({
      id: objectId,
      eventId: "event:sqlite-concurrent-target:loser",
    });
    const losing = {
      ...losingBase,
      object: mutateTitle(
        losingBase.object,
        "Different concurrent target revision",
      ),
    };
    const first = new SqliteCognitionStore({
      databasePath,
      createIfMissing: true,
    });
    const second = new SqliteCognitionStore({ databasePath });
    t.after(() => {
      second.close();
      first.close();
    });

    await first.commitInitial({ object: initial });
    assert.deepEqual(await first.getLatestObject(objectId), initial);
    assert.deepEqual(await second.getLatestObject(objectId), initial);

    assert.deepEqual(await first.commitTransition(winning), {
      status: "committed",
    });
    assert.deepEqual(await second.commitTransition(losing), {
      status: "conflict",
      conflict: {
        code: "object_revision_collision",
        objectId,
      },
    });

    for (const store of [first, second]) {
      assert.deepEqual(
        await store.getLatestObject(objectId),
        winning.object,
      );
      assert.deepEqual(
        await store.getObjectVersion(objectId, 2),
        winning.object,
      );
      assert.deepEqual(
        await store.listObjectEvents(objectId),
        [winning.event],
      );
    }
    assert.deepEqual(snapshotCognitionRows(databasePath), {
      objects: [
        [
          objectId,
          1,
          initial.payload.type,
          canonicalizeForTest(initial as unknown as JsonValue),
        ],
        [
          objectId,
          2,
          winning.object.payload.type,
          canonicalizeForTest(
            winning.object as unknown as JsonValue,
          ),
        ],
      ],
      events: [
        [
          winning.event.payload.id,
          objectId,
          2,
          canonicalizeForTest(
            winning.event as unknown as JsonValue,
          ),
        ],
      ],
    });
  },
);

sqliteTest(
  "SQLite default timeout waits for an overlapping writer then returns the committed conflict without mutation",
  async (t) => {
    const databasePath = temporaryDatabasePath(t);
    const readyPath = join(databasePath, "../contending-writer.ready");
    const objectId = "goal:sqlite-overlapping-writers";
    const initial = objectRecord({ id: objectId });
    const winning = transitionCommit({
      id: objectId,
      eventId: "event:sqlite-overlapping-writers:winner",
    });
    const losingBase = transitionCommit({
      id: objectId,
      eventId: "event:sqlite-overlapping-writers:loser",
    });
    const losing = {
      ...losingBase,
      object: mutateTitle(
        losingBase.object,
        "Different overlapping target revision",
      ),
    };
    const store = new SqliteCognitionStore({
      databasePath,
      createIfMissing: true,
    });
    await store.commitInitial({ object: initial });
    store.close();

    const winner = new DatabaseSync(databasePath, {
      timeout: 5_000,
    });
    winner.exec("BEGIN IMMEDIATE");
    insertObjectRow(winner, winning.object);
    insertEventRow(winner, winning.event);
    const contender = startContendingWriter(
      databasePath,
      readyPath,
      losing,
    );
    t.after(() => {
      if (
        contender.child.exitCode === null &&
        contender.child.signalCode === null
      ) {
        contender.child.kill();
      }
      if (winner.isOpen) {
        if (winner.isTransaction) {
          winner.exec("ROLLBACK");
        }
        winner.close();
      }
    });

    await waitForFiles([readyPath]);
    const earlyResult = await Promise.race([
      contender.result.then(() => "settled" as const),
      delay(200).then(() => "waiting" as const),
    ]);
    assert.equal(earlyResult, "waiting");
    winner.exec("COMMIT");
    winner.close();

    const result = await contender.result;
    assert.equal(result.message, undefined);
    assert.ok(
      result.elapsedMilliseconds >= 150,
      JSON.stringify(result),
    );
    assert.deepEqual(result.outcome, {
      status: "conflict",
      conflict: {
        code: "object_revision_collision",
        objectId,
      },
    });
    assert.deepEqual(snapshotCognitionRows(databasePath), {
      objects: [
        [
          objectId,
          1,
          initial.payload.type,
          canonicalizeForTest(initial as unknown as JsonValue),
        ],
        [
          objectId,
          2,
          winning.object.payload.type,
          canonicalizeForTest(
            winning.object as unknown as JsonValue,
          ),
        ],
      ],
      events: [
        [
          winning.event.payload.id,
          objectId,
          2,
          canonicalizeForTest(
            winning.event as unknown as JsonValue,
          ),
        ],
      ],
    });
  },
);

sqliteTest(
  "SQLite concurrent writers report the latest version for an unused future target",
  async (t) => {
    const databasePath = temporaryDatabasePath(t);
    const objectId = "goal:sqlite-concurrent-version";
    const initial = objectRecord({ id: objectId });
    const winning = transitionCommit({
      id: objectId,
      eventId: "event:sqlite-concurrent-version:winner",
    });
    const unusedFutureTarget = transitionCommit({
      id: objectId,
      expectedVersion: 3,
      eventId: "event:sqlite-concurrent-version:future",
    });
    const first = new SqliteCognitionStore({
      databasePath,
      createIfMissing: true,
    });
    const second = new SqliteCognitionStore({ databasePath });
    t.after(() => {
      second.close();
      first.close();
    });

    await first.commitInitial({ object: initial });
    assert.deepEqual(await first.getLatestObject(objectId), initial);
    assert.deepEqual(await second.getLatestObject(objectId), initial);
    assert.deepEqual(await first.commitTransition(winning), {
      status: "committed",
    });

    assert.deepEqual(
      await second.commitTransition(unusedFutureTarget),
      {
        status: "conflict",
        conflict: {
          code: "version_conflict",
          objectId,
          expectedVersion: 3,
          actualVersion: 2,
        },
      },
    );
    assert.deepEqual(
      await second.getObjectVersion(objectId, 4),
      undefined,
    );
    assert.deepEqual(
      await second.getLatestObject(objectId),
      winning.object,
    );
    assert.deepEqual(
      await second.listObjectEvents(objectId),
      [winning.event],
    );
  },
);
