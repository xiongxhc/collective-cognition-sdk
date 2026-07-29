import {
  existsSync,
  linkSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { isDeepStrictEqual } from "node:util";

import type {
  CognitionStore,
  CognitionStoreCommitResult,
  InitialCognitionCommit,
  PortableCognitionEventRecord,
  PortableCognitiveObjectRecord,
  TransitionCognitionCommit,
} from "../host-integration.ts";

export interface SqliteCognitionStoreOptions {
  readonly databasePath: string;
  readonly createIfMissing?: boolean;
  readonly busyTimeoutMs?: number;
}

interface SqliteCognitionStoreOptionsSnapshot {
  readonly databasePath: string;
  readonly createIfMissing: boolean;
  readonly busyTimeoutMs: number;
}

interface SchemaMarker {
  readonly singleton: number;
  readonly adapter_id: string;
  readonly schema_version: number;
}

interface SchemaObject {
  readonly type: unknown;
  readonly name: unknown;
  readonly tbl_name: unknown;
  readonly sql: unknown;
}

const adapterId = "collective-cognition-sdk:sqlite-store";
const schemaVersion = 1;
const maximumBusyTimeoutMs = 60_000;
const cognitionSchemaTableSql = `
  CREATE TABLE cognition_schema (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    adapter_id TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    created_at TEXT NOT NULL
  ) STRICT;
`;

const cognitionObjectsTableSql = `
  CREATE TABLE cognition_objects (
    object_id TEXT NOT NULL,
    object_version INTEGER NOT NULL CHECK (object_version > 0),
    object_type TEXT NOT NULL,
    record_json TEXT NOT NULL,
    PRIMARY KEY (object_id, object_version)
  ) STRICT;
`;

const cognitionEventsTableSql = `
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

const schemaSql = [
  cognitionSchemaTableSql,
  cognitionObjectsTableSql,
  cognitionEventsTableSql,
].join("\n");

const expectedColumns = {
  cognition_events: [
    [0, "event_id", "TEXT", 1, null, 1, 0],
    [1, "object_id", "TEXT", 1, null, 0, 0],
    [2, "object_version", "INTEGER", 1, null, 0, 0],
    [3, "record_json", "TEXT", 1, null, 0, 0],
  ],
  cognition_objects: [
    [0, "object_id", "TEXT", 1, null, 1, 0],
    [1, "object_version", "INTEGER", 1, null, 2, 0],
    [2, "object_type", "TEXT", 1, null, 0, 0],
    [3, "record_json", "TEXT", 1, null, 0, 0],
  ],
  cognition_schema: [
    [0, "singleton", "INTEGER", 0, null, 1, 0],
    [1, "adapter_id", "TEXT", 1, null, 0, 0],
    [2, "schema_version", "INTEGER", 1, null, 0, 0],
    [3, "created_at", "TEXT", 1, null, 0, 0],
  ],
} as const;

const expectedIndexes = {
  cognition_events: [
    ["pk", 1, 0, ["event_id"]],
    ["u", 1, 0, ["object_id", "object_version"]],
  ],
  cognition_objects: [
    ["pk", 1, 0, ["object_id", "object_version"]],
  ],
  cognition_schema: [],
} as const;

const expectedForeignKeys = {
  cognition_events: [
    [
      0,
      0,
      "cognition_objects",
      "object_id",
      "object_id",
      "NO ACTION",
      "NO ACTION",
      "NONE",
    ],
    [
      0,
      1,
      "cognition_objects",
      "object_version",
      "object_version",
      "NO ACTION",
      "NO ACTION",
      "NONE",
    ],
  ],
  cognition_objects: [],
  cognition_schema: [],
} as const;

type CognitionTableName = keyof typeof expectedColumns;

function invalidOptions(): never {
  throw new TypeError("SQLite cognition store options are invalid.");
}

function invalidTarget(): never {
  throw new Error("SQLite cognition target is incompatible.");
}

function closedStore(): never {
  throw new Error("SQLite cognition store is closed.");
}

function unsupportedOperation(): never {
  throw new Error("SQLite cognition persistence is not implemented.");
}

function unsupportedRuntime(): never {
  throw new Error(
    "SQLite cognition store requires node:sqlite with enforced defensive mode.",
  );
}

function assertDefensiveRuntime(): void {
  if (typeof DatabaseSync.prototype.enableDefensive !== "function") {
    unsupportedRuntime();
  }

  const database = new DatabaseSync(":memory:", {
    allowExtension: false,
    defensive: true,
    enableDoubleQuotedStringLiterals: false,
    enableForeignKeyConstraints: true,
  });
  try {
    database.enableDefensive(true);
    database.exec("PRAGMA writable_schema = ON");
    const result = database
      .prepare("PRAGMA writable_schema")
      .get() as { readonly writable_schema?: unknown };
    if (result.writable_schema !== 0) {
      unsupportedRuntime();
    }
  } finally {
    database.close();
  }
}

function snapshotOptions(
  value: SqliteCognitionStoreOptions,
): SqliteCognitionStoreOptionsSnapshot {
  const fields: Record<string, unknown> = Object.create(null);

  try {
    if (typeof value !== "object" || value === null) {
      return invalidOptions();
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return invalidOptions();
    }

    const allowed = new Set([
      "databasePath",
      "createIfMissing",
      "busyTimeoutMs",
    ]);
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string" || !allowed.has(key)) {
        return invalidOptions();
      }
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined ||
        descriptor.enumerable !== true ||
        !("value" in descriptor)
      ) {
        return invalidOptions();
      }
      fields[key] = descriptor.value;
    }
  } catch {
    return invalidOptions();
  }

  if (
    typeof fields.databasePath !== "string" ||
    fields.databasePath.length === 0 ||
    !isAbsolute(fields.databasePath)
  ) {
    return invalidOptions();
  }
  if (
    "createIfMissing" in fields &&
    typeof fields.createIfMissing !== "boolean"
  ) {
    return invalidOptions();
  }
  if (
    "busyTimeoutMs" in fields &&
    (typeof fields.busyTimeoutMs !== "number" ||
      !Number.isSafeInteger(fields.busyTimeoutMs) ||
      fields.busyTimeoutMs < 0 ||
      fields.busyTimeoutMs > maximumBusyTimeoutMs)
  ) {
    return invalidOptions();
  }

  return {
    databasePath: fields.databasePath,
    createIfMissing: fields.createIfMissing ?? false,
    busyTimeoutMs: fields.busyTimeoutMs ?? 0,
  } as SqliteCognitionStoreOptionsSnapshot;
}

function openDatabase(
  databasePath: string,
  busyTimeoutMs: number,
  readOnly: boolean,
): DatabaseSync {
  const database = new DatabaseSync(databasePath, {
    allowExtension: false,
    defensive: true,
    enableDoubleQuotedStringLiterals: false,
    enableForeignKeyConstraints: true,
    readOnly,
    timeout: busyTimeoutMs,
  });
  database.enableDefensive(true);
  return database;
}

function normalizeSchemaSql(sql: string): string {
  return sql
    .replace(/\s+/g, " ")
    .replace(/\s*([(),=<>])\s*/g, "$1")
    .trim()
    .replace(/;$/, "")
    .toLowerCase();
}

const expectedSchemaObjects = [
  ["table", "cognition_events", cognitionEventsTableSql],
  ["table", "cognition_objects", cognitionObjectsTableSql],
  ["table", "cognition_schema", cognitionSchemaTableSql],
].map(([type, name, sql]) => [
  type,
  name,
  name,
  normalizeSchemaSql(sql!),
]);

function readColumns(
  database: DatabaseSync,
  table: CognitionTableName,
): unknown[][] {
  return database
    .prepare(
      `
        SELECT cid, name, type, "notnull", dflt_value, pk, hidden
        FROM pragma_table_xinfo(?)
        ORDER BY cid
      `,
    )
    .all(table)
    .map((row) => {
      const column = row as Record<string, unknown>;
      return [
        column.cid,
        column.name,
        column.type,
        column.notnull,
        column.dflt_value,
        column.pk,
        column.hidden,
      ];
    });
}

function readIndexes(
  database: DatabaseSync,
  table: CognitionTableName,
): unknown[][] {
  return database
    .prepare(
      `
        SELECT name, "unique", origin, partial
        FROM pragma_index_list(?)
      `,
    )
    .all(table)
    .map((row) => {
      const index = row as Record<string, unknown>;
      const columns = database
        .prepare(
          `
            SELECT name
            FROM pragma_index_info(?)
            ORDER BY seqno
          `,
        )
        .all(index.name as string)
        .map(
          (column) =>
            (column as { readonly name: unknown }).name,
        );
      return [
        index.origin,
        index.unique,
        index.partial,
        columns,
      ];
    })
    .sort((left, right) =>
      String(left[0]).localeCompare(String(right[0])),
    );
}

function readForeignKeys(
  database: DatabaseSync,
  table: CognitionTableName,
): unknown[][] {
  return database
    .prepare(
      `
        SELECT
          id,
          seq,
          "table",
          "from",
          "to",
          on_update,
          on_delete,
          "match"
        FROM pragma_foreign_key_list(?)
        ORDER BY id, seq
      `,
    )
    .all(table)
    .map((row) => {
      const foreignKey = row as Record<string, unknown>;
      return [
        foreignKey.id,
        foreignKey.seq,
        foreignKey.table,
        foreignKey.from,
        foreignKey.to,
        foreignKey.on_update,
        foreignKey.on_delete,
        foreignKey.match,
      ];
    });
}

function assertSchemaIdentity(database: DatabaseSync): void {
  try {
    const schemaObjects = database
      .prepare(
        `
          SELECT type, name, tbl_name, sql
          FROM sqlite_schema
          WHERE name NOT LIKE 'sqlite_%'
          ORDER BY type, name
        `,
      )
      .all()
      .map((row) => {
        const schemaObject = row as unknown as SchemaObject;
        return [
          schemaObject.type,
          schemaObject.name,
          schemaObject.tbl_name,
          typeof schemaObject.sql === "string"
            ? normalizeSchemaSql(schemaObject.sql)
            : schemaObject.sql,
        ];
      });
    if (!isDeepStrictEqual(schemaObjects, expectedSchemaObjects)) {
      return invalidTarget();
    }

    for (const table of Object.keys(
      expectedColumns,
    ) as CognitionTableName[]) {
      if (
        !isDeepStrictEqual(
          readColumns(database, table),
          expectedColumns[table],
        ) ||
        !isDeepStrictEqual(
          readIndexes(database, table),
          expectedIndexes[table],
        ) ||
        !isDeepStrictEqual(
          readForeignKeys(database, table),
          expectedForeignKeys[table],
        )
      ) {
        return invalidTarget();
      }
    }

    const markers = database
      .prepare(
        `
          SELECT singleton, adapter_id, schema_version
          FROM cognition_schema
        `,
      )
      .all() as unknown as SchemaMarker[];
    if (
      markers.length !== 1 ||
      markers[0]?.singleton !== 1 ||
      markers[0].adapter_id !== adapterId ||
      markers[0].schema_version !== schemaVersion
    ) {
      return invalidTarget();
    }
  } catch {
    return invalidTarget();
  }
}

function inspectExistingTarget(
  databasePath: string,
  busyTimeoutMs: number,
): void {
  let database: DatabaseSync | undefined;
  try {
    database = openDatabase(databasePath, busyTimeoutMs, true);
    assertSchemaIdentity(database);
  } catch {
    return invalidTarget();
  } finally {
    if (database?.isOpen) {
      database.close();
    }
  }
}

function createTarget(
  databasePath: string,
  busyTimeoutMs: number,
): DatabaseSync {
  const temporaryDirectory = mkdtempSync(
    join(dirname(databasePath), `.${basename(databasePath)}.create-`),
  );
  const temporaryDatabasePath = join(
    temporaryDirectory,
    "cognition.db",
  );
  let database: DatabaseSync | undefined;
  try {
    database = openDatabase(
      temporaryDatabasePath,
      busyTimeoutMs,
      false,
    );
    database.exec("BEGIN IMMEDIATE");
    database.exec(schemaSql);
    database
      .prepare(
        `
          INSERT INTO cognition_schema (
            singleton,
            adapter_id,
            schema_version,
            created_at
          ) VALUES (?, ?, ?, ?)
        `,
      )
      .run(1, adapterId, schemaVersion, new Date().toISOString());
    database.exec("COMMIT");
    database.close();
    database = undefined;
    try {
      linkSync(temporaryDatabasePath, databasePath);
    } catch {
      return invalidTarget();
    }
  } catch {
    if (database?.isTransaction) {
      database.exec("ROLLBACK");
    }
    if (database?.isOpen) {
      database.close();
    }
    return invalidTarget();
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }

  const published = openDatabase(databasePath, busyTimeoutMs, false);
  try {
    assertSchemaIdentity(published);
    return published;
  } catch (error) {
    published.close();
    throw error;
  }
}

export class SqliteCognitionStore implements CognitionStore {
  readonly #database: DatabaseSync;

  constructor(options: SqliteCognitionStoreOptions) {
    assertDefensiveRuntime();
    const snapshot = snapshotOptions(options);
    const targetExists = existsSync(snapshot.databasePath);
    if (!targetExists && !snapshot.createIfMissing) {
      invalidTarget();
    }

    if (!targetExists) {
      this.#database = createTarget(
        snapshot.databasePath,
        snapshot.busyTimeoutMs,
      );
      return;
    }

    inspectExistingTarget(snapshot.databasePath, snapshot.busyTimeoutMs);
    this.#database = openDatabase(
      snapshot.databasePath,
      snapshot.busyTimeoutMs,
      false,
    );
    try {
      assertSchemaIdentity(this.#database);
    } catch (error) {
      this.#database.close();
      throw error;
    }
  }

  close(): void {
    if (this.#database.isOpen) {
      this.#database.close();
    }
  }

  async commitInitial(
    _request: InitialCognitionCommit,
  ): Promise<CognitionStoreCommitResult> {
    this.#assertOpen();
    return unsupportedOperation();
  }

  async commitTransition(
    _request: TransitionCognitionCommit,
  ): Promise<CognitionStoreCommitResult> {
    this.#assertOpen();
    return unsupportedOperation();
  }

  async getLatestObject(
    _objectId: string,
  ): Promise<PortableCognitiveObjectRecord | undefined> {
    this.#assertOpen();
    return unsupportedOperation();
  }

  async getObjectVersion(
    _objectId: string,
    _version: number,
  ): Promise<PortableCognitiveObjectRecord | undefined> {
    this.#assertOpen();
    return unsupportedOperation();
  }

  async listObjectEvents(
    _objectId: string,
  ): Promise<readonly PortableCognitionEventRecord[]> {
    this.#assertOpen();
    return unsupportedOperation();
  }

  #assertOpen(): void {
    if (!this.#database.isOpen) {
      closedStore();
    }
  }
}
