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
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

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

const [nodeMajor = 0, nodeMinor = 0] = process.versions.node
  .split(".")
  .map(Number);
const supportsDefensiveMode =
  nodeMajor > 24 || (nodeMajor === 24 && nodeMinor >= 12);
const sqliteTest = supportsDefensiveMode ? test : test.skip;
const unsupportedRuntimeTest = supportsDefensiveMode ? test.skip : test;
const sqliteStoreUrl = new URL("../src/stores/sqlite.ts", import.meta.url);

function temporaryDatabasePath(t: test.TestContext): string {
  const directory = mkdtempSync(
    join(tmpdir(), "collective-cognition-sqlite-"),
  );
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return join(directory, "cognition.db");
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

test("SQLite adapter declares the defensive-mode Node floor", () => {
  const packageJson = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { readonly engines?: { readonly node?: unknown } };

  assert.equal(packageJson.engines?.node, ">=24.12.0");
});

unsupportedRuntimeTest(
  "SQLite runtime fails before creating a target without defensive support",
  (t) => {
    const databasePath = temporaryDatabasePath(t);
    const result = probeStore(process.execPath, databasePath);

    assert.equal(result.status, "rejected");
    assert.match(result.message ?? "", /Node\.js 24\.12\.0 or newer/);
    assert.equal(existsSync(databasePath), false);
  },
);

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
  createMarkedCognitionDatabase(databasePath, 2);

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
