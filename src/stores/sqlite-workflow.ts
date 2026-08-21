import {
  existsSync,
  linkSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { isDeepStrictEqual, types as utilTypes } from "node:util";

import {
  prepareInitialCognitionCommit,
  prepareTransitionCognitionCommit,
} from "../host-integration.ts";
import {
  deserializePortableCognitionRecord,
  serializePortableCognitionRecord,
} from "../portable-cognition.ts";
import { canonicalizeJson } from "../source-records.ts";
import type {
  CognitionStore,
  CognitionStoreCommitResult,
  InitialCognitionCommit,
  PortableCognitionEventRecord,
  PortableCognitiveObjectRecord,
  TransitionCognitionCommit,
} from "../host-integration.ts";
import { isUnicodeScalarString } from "../types.ts";
import type { JsonValue } from "../types.ts";
import type {
  CognitionWorkflowStore,
  DurableCognitionCommitResult,
  PreparedDurableCognitionCommit,
} from "../workflows/durable.ts";

export interface SqliteCognitionWorkflowStoreOptions {
  readonly databasePath: string;
  readonly createIfMissing?: boolean;
  readonly busyTimeoutMs?: number;
}

interface SqliteCognitionWorkflowStoreOptionsSnapshot {
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

interface StoredObjectRow {
  readonly object_id: unknown;
  readonly object_version: unknown;
  readonly object_type: unknown;
  readonly record_json: unknown;
}

const adapterId = "collective-cognition-sdk:sqlite-store";
const defaultBusyTimeoutMs = 5_000;
const maximumBusyTimeoutMs = 60_000;
const maximumPreparedWorkflowDepth = 256;
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

const cognitionWorkflowsTableSql = `
  CREATE TABLE cognition_workflows (
    workflow_id TEXT PRIMARY KEY,
    request_digest TEXT NOT NULL CHECK (length(request_digest) = 64),
    initial_hypothesis_id TEXT NOT NULL,
    evidence_id TEXT NOT NULL,
    reviewed_hypothesis_version INTEGER NOT NULL CHECK (reviewed_hypothesis_version = 2),
    event_id TEXT NOT NULL UNIQUE
  ) STRICT;
`;

const schemaVersionOneSql = [
  cognitionSchemaTableSql,
  cognitionObjectsTableSql,
  cognitionEventsTableSql,
].join("\n");

const schemaVersionTwoSql = [
  cognitionSchemaTableSql,
  cognitionObjectsTableSql,
  cognitionEventsTableSql,
  cognitionWorkflowsTableSql,
].join("\n");

const expectedVersionOneColumns = {
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

const expectedVersionOneIndexes = {
  cognition_events: [
    ["pk", 1, 0, ["event_id"]],
    ["u", 1, 0, ["object_id", "object_version"]],
  ],
  cognition_objects: [
    ["pk", 1, 0, ["object_id", "object_version"]],
  ],
  cognition_schema: [],
} as const;

const expectedVersionOneForeignKeys = {
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

const expectedVersionTwoColumns = {
  ...expectedVersionOneColumns,
  cognition_workflows: [
    [0, "workflow_id", "TEXT", 1, null, 1, 0],
    [1, "request_digest", "TEXT", 1, null, 0, 0],
    [2, "initial_hypothesis_id", "TEXT", 1, null, 0, 0],
    [3, "evidence_id", "TEXT", 1, null, 0, 0],
    [4, "reviewed_hypothesis_version", "INTEGER", 1, null, 0, 0],
    [5, "event_id", "TEXT", 1, null, 0, 0],
  ],
} as const;

const expectedVersionTwoIndexes = {
  ...expectedVersionOneIndexes,
  cognition_workflows: [
    ["pk", 1, 0, ["workflow_id"]],
    ["u", 1, 0, ["event_id"]],
  ],
} as const;

const expectedVersionTwoForeignKeys = {
  ...expectedVersionOneForeignKeys,
  cognition_workflows: [],
} as const;

interface SchemaProfile {
  readonly version: 1 | 2;
  readonly sql: string;
  readonly schemaObjects: readonly (readonly unknown[])[];
  readonly expectedColumns: Record<string, readonly (readonly unknown[])[]>;
  readonly expectedIndexes: Record<string, readonly (readonly unknown[])[]>;
  readonly expectedForeignKeys: Record<string, readonly (readonly unknown[])[]>;
}

interface SqliteCognitionSchemaTarget {
  readonly allowedVersions: readonly (1 | 2)[];
  readonly creationSchemaProfile: SchemaProfile;
}

function invalidOptions(): never {
  throw new TypeError("SQLite cognition store options are invalid.");
}

function invalidTarget(): never {
  throw new Error("SQLite cognition target is incompatible.");
}

function closedStore(): never {
  throw new Error("SQLite cognition store is closed.");
}

function unsupportedRuntime(): never {
  throw new Error(
    "SQLite cognition store requires node:sqlite with enforced defensive mode.",
  );
}

function invalidStoredObject(): never {
  throw new TypeError("Stored cognitive object is invalid.");
}

function invalidStoredEvent(): never {
  throw new TypeError("Stored cognition event is invalid.");
}

function invalidStoredHistory(): never {
  throw new TypeError("Stored cognition history is inconsistent.");
}

function isProxy(value: unknown): boolean {
  return (
    (typeof value === "object" && value !== null) ||
    typeof value === "function"
  ) && utilTypes.isProxy(value);
}

function deserializeStoredObject(
  row: StoredObjectRow,
): PortableCognitiveObjectRecord {
  if (
    typeof row.object_id !== "string" ||
    typeof row.object_version !== "number" ||
    !Number.isSafeInteger(row.object_version) ||
    typeof row.object_type !== "string" ||
    typeof row.record_json !== "string"
  ) {
    return invalidStoredObject();
  }
  const record = deserializePortableCognitionRecord(row.record_json);
  if (
    record.recordType !== "cognitive-object" ||
    record.payload.id !== row.object_id ||
    record.payload.version !== row.object_version ||
    record.payload.type !== row.object_type
  ) {
    return invalidStoredObject();
  }
  return record;
}

function deserializeStoredEvent(
  recordJson: unknown,
  eventId: string,
  objectId: string,
  objectVersion: number,
): PortableCognitionEventRecord {
  if (typeof recordJson !== "string") {
    return invalidStoredEvent();
  }
  const record = deserializePortableCognitionRecord(recordJson);
  if (
    record.recordType !== "cognition-event" ||
    record.payload.id !== eventId ||
    record.payload.objectId !== objectId ||
    record.payload.objectVersion !== objectVersion
  ) {
    return invalidStoredEvent();
  }
  return record;
}

function runImmediateTransaction<Result>(
  database: DatabaseSync,
  operation: () => Result,
): Result {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    if (database.isTransaction) {
      database.exec("ROLLBACK");
    }
    throw error;
  }
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
  value: SqliteCognitionWorkflowStoreOptions,
): SqliteCognitionWorkflowStoreOptionsSnapshot {
  const fields: Record<string, unknown> = Object.create(null);

  try {
    if (
      typeof value !== "object" ||
      value === null ||
      isProxy(value)
    ) {
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
    busyTimeoutMs: fields.busyTimeoutMs ?? defaultBusyTimeoutMs,
  } as SqliteCognitionWorkflowStoreOptionsSnapshot;
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

function createExpectedSchemaObjects(
  tableSql: readonly (readonly [string, string, string])[],
): readonly (readonly unknown[])[] {
  return tableSql.map(([type, name, sql]) => [
    type,
    name,
    name,
    normalizeSchemaSql(sql),
  ]);
}

const schemaVersionOne: SchemaProfile = Object.freeze({
  version: 1,
  sql: schemaVersionOneSql,
  schemaObjects: createExpectedSchemaObjects([
    ["table", "cognition_events", cognitionEventsTableSql],
    ["table", "cognition_objects", cognitionObjectsTableSql],
    ["table", "cognition_schema", cognitionSchemaTableSql],
  ]),
  expectedColumns: expectedVersionOneColumns,
  expectedIndexes: expectedVersionOneIndexes,
  expectedForeignKeys: expectedVersionOneForeignKeys,
});

const schemaVersionTwo: SchemaProfile = Object.freeze({
  version: 2,
  sql: schemaVersionTwoSql,
  schemaObjects: createExpectedSchemaObjects([
    ["table", "cognition_events", cognitionEventsTableSql],
    ["table", "cognition_objects", cognitionObjectsTableSql],
    ["table", "cognition_schema", cognitionSchemaTableSql],
    ["table", "cognition_workflows", cognitionWorkflowsTableSql],
  ]),
  expectedColumns: expectedVersionTwoColumns,
  expectedIndexes: expectedVersionTwoIndexes,
  expectedForeignKeys: expectedVersionTwoForeignKeys,
});

const schemaProfiles = new Map<number, SchemaProfile>([
  [schemaVersionOne.version, schemaVersionOne],
  [schemaVersionTwo.version, schemaVersionTwo],
]);

const sqliteCognitionWorkflowSchemaTarget: SqliteCognitionSchemaTarget =
  Object.freeze({
    allowedVersions: Object.freeze([2] as const),
    creationSchemaProfile: schemaVersionTwo,
  });

function readColumns(
  database: DatabaseSync,
  table: string,
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
  table: string,
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
  table: string,
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

function assertSchemaIdentity(
  database: DatabaseSync,
  allowedVersions: ReadonlySet<number>,
): void {
  try {
    const markers = database
      .prepare(
        `
          SELECT singleton, adapter_id, schema_version
          FROM cognition_schema
        `,
      )
      .all() as unknown as SchemaMarker[];
    const marker = markers[0];
    const profile = marker === undefined
      ? undefined
      : schemaProfiles.get(marker.schema_version);
    if (
      markers.length !== 1 ||
      marker?.singleton !== 1 ||
      marker.adapter_id !== adapterId ||
      profile === undefined ||
      !allowedVersions.has(profile.version)
    ) {
      return invalidTarget();
    }

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
    if (!isDeepStrictEqual(schemaObjects, profile.schemaObjects)) {
      return invalidTarget();
    }

    for (const table of Object.keys(profile.expectedColumns)) {
      if (
        !isDeepStrictEqual(
          readColumns(database, table),
          profile.expectedColumns[table],
        ) ||
        !isDeepStrictEqual(
          readIndexes(database, table),
          profile.expectedIndexes[table],
        ) ||
        !isDeepStrictEqual(
          readForeignKeys(database, table),
          profile.expectedForeignKeys[table],
        )
      ) {
        return invalidTarget();
      }
    }
  } catch {
    return invalidTarget();
  }
}

function inspectExistingTarget(
  databasePath: string,
  busyTimeoutMs: number,
  allowedVersions: ReadonlySet<number>,
): void {
  let database: DatabaseSync | undefined;
  try {
    database = openDatabase(databasePath, busyTimeoutMs, true);
    assertSchemaIdentity(database, allowedVersions);
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
  schemaProfile: SchemaProfile,
  allowedVersions: ReadonlySet<number>,
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
    database.exec(schemaProfile.sql);
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
      .run(1, adapterId, schemaProfile.version, new Date().toISOString());
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
    assertSchemaIdentity(published, allowedVersions);
    return published;
  } catch (error) {
    published.close();
    throw error;
  }
}

function openCompatibleCognitionTarget(
  snapshot: SqliteCognitionWorkflowStoreOptionsSnapshot,
  allowedVersions: ReadonlySet<number>,
  schemaProfile: SchemaProfile,
): DatabaseSync {
  if (!allowedVersions.has(schemaProfile.version)) {
    return invalidTarget();
  }

  const targetExists = existsSync(snapshot.databasePath);
  if (!targetExists) {
    if (!snapshot.createIfMissing) {
      return invalidTarget();
    }
    return createTarget(
      snapshot.databasePath,
      snapshot.busyTimeoutMs,
      schemaProfile,
      allowedVersions,
    );
  }

  inspectExistingTarget(
    snapshot.databasePath,
    snapshot.busyTimeoutMs,
    allowedVersions,
  );
  const database = openDatabase(
    snapshot.databasePath,
    snapshot.busyTimeoutMs,
    false,
  );
  try {
    assertSchemaIdentity(database, allowedVersions);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

function assertConsistentObjectHistory(
  database: DatabaseSync,
  objectId: string,
): void {
  try {
    const objects = database
      .prepare(
        `
          SELECT
            object_id,
            object_version,
            object_type,
            record_json
          FROM cognition_objects
          WHERE object_id = ?
          ORDER BY object_version
        `,
      )
      .all(objectId) as unknown as StoredObjectRow[];
    const events = database
      .prepare(
        `
          SELECT event_id, object_id, object_version, record_json
          FROM cognition_events
          WHERE object_id = ?
          ORDER BY object_version, event_id
        `,
      )
      .all(objectId) as Array<Record<string, unknown>>;

    if (objects.length === 0 && events.length === 0) {
      return;
    }
    if (objects.length === 0 || events.length !== objects.length - 1) {
      return invalidStoredHistory();
    }

    for (const [index, row] of objects.entries()) {
      const object = deserializeStoredObject(row);
      const expectedVersion = index + 1;
      if (object.payload.version !== expectedVersion) {
        return invalidStoredHistory();
      }
      if (expectedVersion === 1) {
        continue;
      }

      const event = events[index - 1];
      if (
        event === undefined ||
        typeof event.event_id !== "string" ||
        event.object_id !== objectId ||
        event.object_version !== expectedVersion
      ) {
        return invalidStoredHistory();
      }
      const storedEvent = deserializeStoredEvent(
        event.record_json,
        event.event_id,
        objectId,
        expectedVersion,
      );
      if (
        storedEvent.payload.objectType !== object.payload.type ||
        storedEvent.payload.nextState !== object.payload.state ||
        storedEvent.payload.occurredAt !== object.payload.updatedAt
      ) {
        return invalidStoredHistory();
      }
    }
  } catch {
    return invalidStoredHistory();
  }
}

class SqliteCognitionWorkflowStoreBase implements CognitionStore {
  readonly #database: DatabaseSync;

  constructor(
    options: SqliteCognitionWorkflowStoreOptions,
    schemaTarget: SqliteCognitionSchemaTarget,
  ) {
    assertDefensiveRuntime();
    const snapshot = snapshotOptions(options);
    this.#database = openCompatibleCognitionTarget(
      snapshot,
      new Set(schemaTarget.allowedVersions),
      schemaTarget.creationSchemaProfile,
    );
    sqliteStoreDatabases.set(this, this.#database);
  }

  close(): void {
    if (this.#database.isOpen) {
      this.#database.close();
    }
  }

  async commitInitial(
    request: InitialCognitionCommit,
  ): Promise<CognitionStoreCommitResult> {
    this.#assertOpen();
    const prepared = prepareInitialCognitionCommit(request);
    const canonical = canonicalizeJson(
      prepared.object as unknown as JsonValue,
    );
    const objectId = prepared.object.payload.id;
    const objectVersion = prepared.object.payload.version;
    const objectType = prepared.object.payload.type;

    return runImmediateTransaction<CognitionStoreCommitResult>(
      this.#database,
      () => {
        assertConsistentObjectHistory(this.#database, objectId);
        const existing = this.#database
          .prepare(
            `
              SELECT
                object_id,
                object_version,
                object_type,
                record_json
              FROM cognition_objects
              WHERE object_id = ? AND object_version = ?
            `,
          )
          .get(objectId, objectVersion) as StoredObjectRow | undefined;
        if (existing !== undefined) {
          const stored = deserializeStoredObject(existing);
          if (
            canonicalizeJson(stored as unknown as JsonValue) === canonical
          ) {
            return { status: "already_committed" };
          }
          return {
            status: "conflict",
            conflict: {
              code: "object_revision_collision",
              objectId,
            },
          };
        }

        this.#database
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
          .run(objectId, objectVersion, objectType, canonical);
        return { status: "committed" };
      },
    );
  }

  async commitTransition(
    request: TransitionCognitionCommit,
  ): Promise<CognitionStoreCommitResult> {
    this.#assertOpen();
    const prepared = prepareTransitionCognitionCommit(request);
    const objectCanonical = canonicalizeJson(
      prepared.object as unknown as JsonValue,
    );
    const eventCanonical = canonicalizeJson(
      prepared.event as unknown as JsonValue,
    );
    const objectId = prepared.object.payload.id;
    const objectVersion = prepared.object.payload.version;
    const objectType = prepared.object.payload.type;
    const eventId = prepared.event.payload.id;

    return runImmediateTransaction<CognitionStoreCommitResult>(
      this.#database,
      () => {
        const existingObject = this.#database
          .prepare(
            `
              SELECT
                object_id,
                object_version,
                object_type,
                record_json
              FROM cognition_objects
              WHERE object_id = ? AND object_version = ?
            `,
          )
          .get(objectId, objectVersion) as StoredObjectRow | undefined;
        const existingEvent = this.#database
          .prepare(
            `
              SELECT object_id, object_version, record_json
              FROM cognition_events
              WHERE event_id = ?
            `,
          )
          .get(eventId) as
            | {
              readonly object_id: unknown;
              readonly object_version: unknown;
              readonly record_json: unknown;
            }
            | undefined;
        const occupiedEventSlot = this.#database
          .prepare(
            `
              SELECT event_id, object_id, object_version, record_json
              FROM cognition_events
              WHERE object_id = ? AND object_version = ?
            `,
          )
          .get(objectId, objectVersion) as
            | {
              readonly event_id: unknown;
              readonly object_id: unknown;
              readonly object_version: unknown;
              readonly record_json: unknown;
            }
            | undefined;

        let objectMatches = false;
        if (existingObject !== undefined) {
          const storedObject = deserializeStoredObject(existingObject);
          objectMatches = canonicalizeJson(
            storedObject as unknown as JsonValue,
          ) === objectCanonical;
        }

        let eventMatches = false;
        if (existingEvent !== undefined) {
          if (
            typeof existingEvent.object_id !== "string" ||
            typeof existingEvent.object_version !== "number" ||
            !Number.isSafeInteger(existingEvent.object_version)
          ) {
            return invalidStoredEvent();
          }
          const storedEvent = deserializeStoredEvent(
            existingEvent.record_json,
            eventId,
            existingEvent.object_id,
            existingEvent.object_version,
          );
          eventMatches = canonicalizeJson(
            storedEvent as unknown as JsonValue,
          ) === eventCanonical;
        }

        if (objectMatches && eventMatches) {
          return { status: "already_committed" };
        }
        if (existingObject !== undefined && !objectMatches) {
          return {
            status: "conflict",
            conflict: {
              code: "object_revision_collision",
              objectId,
            },
          };
        }
        if (existingEvent !== undefined && !eventMatches) {
          return {
            status: "conflict",
            conflict: {
              code: "event_id_collision",
              objectId,
              eventId,
            },
          };
        }
        if (occupiedEventSlot !== undefined) {
          if (
            typeof occupiedEventSlot.event_id !== "string" ||
            typeof occupiedEventSlot.object_id !== "string" ||
            typeof occupiedEventSlot.object_version !== "number" ||
            !Number.isSafeInteger(occupiedEventSlot.object_version)
          ) {
            return invalidStoredEvent();
          }
          deserializeStoredEvent(
            occupiedEventSlot.record_json,
            occupiedEventSlot.event_id,
            occupiedEventSlot.object_id,
            occupiedEventSlot.object_version,
          );
        }
        if (
          existingObject !== undefined ||
          existingEvent !== undefined ||
          occupiedEventSlot !== undefined
        ) {
          throw new TypeError(
            "Transition identities are only partially committed.",
          );
        }

        const latest = this.#database
          .prepare(
            `
              SELECT
                object_id,
                object_version,
                object_type,
                record_json
              FROM cognition_objects
              WHERE object_id = ?
              ORDER BY object_version DESC
              LIMIT 1
            `,
          )
          .get(objectId) as StoredObjectRow | undefined;
        if (latest === undefined) {
          throw new TypeError("Transition target object does not exist.");
        }
        const latestObject = deserializeStoredObject(latest);
        const actualVersion = latestObject.payload.version;
        if (actualVersion !== prepared.expectedVersion) {
          return {
            status: "conflict",
            conflict: {
              code: "version_conflict",
              objectId,
              expectedVersion: prepared.expectedVersion,
              actualVersion,
            },
          };
        }

        this.#database
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
            objectId,
            objectVersion,
            objectType,
            objectCanonical,
          );
        this.#database
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
            eventId,
            objectId,
            objectVersion,
            eventCanonical,
          );
        return { status: "committed" };
      },
    );
  }

  async getLatestObject(
    objectId: string,
  ): Promise<PortableCognitiveObjectRecord | undefined> {
    this.#assertOpen();
    const row = this.#database
      .prepare(
        `
          SELECT
            object_id,
            object_version,
            object_type,
            record_json
          FROM cognition_objects
          WHERE object_id = ?
          ORDER BY object_version DESC
          LIMIT 1
        `,
      )
      .get(objectId) as StoredObjectRow | undefined;
    return row === undefined
      ? undefined
      : deserializeStoredObject(row);
  }

  async getObjectVersion(
    objectId: string,
    version: number,
  ): Promise<PortableCognitiveObjectRecord | undefined> {
    this.#assertOpen();
    const row = this.#database
      .prepare(
        `
          SELECT
            object_id,
            object_version,
            object_type,
            record_json
          FROM cognition_objects
          WHERE object_id = ? AND object_version = ?
        `,
      )
      .get(objectId, version) as StoredObjectRow | undefined;
    return row === undefined
      ? undefined
      : deserializeStoredObject(row);
  }

  async listObjectEvents(
    objectId: string,
  ): Promise<readonly PortableCognitionEventRecord[]> {
    this.#assertOpen();
    const events = this.#database
      .prepare(
        `
          SELECT event_id, object_id, object_version, record_json
          FROM cognition_events
          WHERE object_id = ?
          ORDER BY object_version, event_id
        `,
      )
      .all(objectId)
      .map((row) => {
        const stored = row as Record<string, unknown>;
        if (
          typeof stored.event_id !== "string" ||
          stored.object_id !== objectId ||
          typeof stored.object_version !== "number" ||
          !Number.isSafeInteger(stored.object_version)
        ) {
          return invalidStoredEvent();
        }
        return deserializeStoredEvent(
          stored.record_json,
          stored.event_id,
          objectId,
          stored.object_version,
        );
      });
    return Object.freeze(events);
  }

  #assertOpen(): void {
    if (!this.#database.isOpen) {
      closedStore();
    }
  }
}

const sqliteStoreDatabases = new WeakMap<object, DatabaseSync>();

function runSqliteCognitionStoreImmediateTransaction<Result>(
  store: SqliteCognitionWorkflowStoreBase,
  operation: (database: DatabaseSync) => Result,
): Result {
  const database = sqliteStoreDatabases.get(store);
  if (database === undefined || !database.isOpen) {
    return closedStore();
  }
  return runImmediateTransaction(database, () => operation(database));
}

interface PreparedSqliteWorkflowCommit {
  readonly workflowId: string;
  readonly requestDigest: string;
  readonly initialHypothesis: PortableCognitiveObjectRecord;
  readonly evidence: PortableCognitiveObjectRecord;
  readonly expectedHypothesisVersion: 1;
  readonly reviewedHypothesis: PortableCognitiveObjectRecord;
  readonly event: PortableCognitionEventRecord;
  readonly initialCanonical: string;
  readonly evidenceCanonical: string;
  readonly reviewedCanonical: string;
  readonly eventCanonical: string;
  readonly initialSerialized: string;
  readonly evidenceSerialized: string;
  readonly reviewedSerialized: string;
  readonly eventSerialized: string;
}

interface StoredEventRow {
  readonly event_id: unknown;
  readonly object_id: unknown;
  readonly object_version: unknown;
  readonly record_json: unknown;
}

interface StoredWorkflowRow {
  readonly workflow_id: unknown;
  readonly request_digest: unknown;
  readonly initial_hypothesis_id: unknown;
  readonly evidence_id: unknown;
  readonly reviewed_hypothesis_version: unknown;
  readonly event_id: unknown;
}

interface ValidatedStoredObject {
  readonly record: PortableCognitiveObjectRecord;
  readonly canonical: string;
}

interface ValidatedStoredEvent {
  readonly record: PortableCognitionEventRecord;
  readonly canonical: string;
}

const preparedWorkflowFields = new Set([
  "workflowId",
  "requestDigest",
  "initialHypothesis",
  "evidence",
  "expectedHypothesisVersion",
  "reviewedHypothesis",
  "event",
]);

function invalidWorkflowCommit(): never {
  throw new TypeError("Durable workflow commit is invalid.");
}

function invalidStoredWorkflow(): never {
  throw new TypeError("Stored durable workflow is invalid.");
}

function preflightPreparedWorkflowJson(
  value: unknown,
  ancestors = new Set<object>(),
  depth = 0,
): void {
  if (isProxy(value)) {
    return invalidWorkflowCommit();
  }
  if (
    value === null ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    (typeof value === "string" && isUnicodeScalarString(value))
  ) {
    return;
  }
  if (
    typeof value !== "object" ||
    depth > maximumPreparedWorkflowDepth ||
    ancestors.has(value)
  ) {
    return invalidWorkflowCommit();
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        return invalidWorkflowCommit();
      }
      const keys = Reflect.ownKeys(value);
      const lengthDescriptor = Reflect.getOwnPropertyDescriptor(value, "length");
      if (
        lengthDescriptor === undefined ||
        lengthDescriptor.enumerable ||
        !("value" in lengthDescriptor) ||
        !Number.isSafeInteger(lengthDescriptor.value) ||
        lengthDescriptor.value < 0 ||
        keys.length !== lengthDescriptor.value + 1 ||
        !keys.includes("length")
      ) {
        return invalidWorkflowCommit();
      }
      for (let index = 0; index < lengthDescriptor.value; index += 1) {
        const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
        if (
          descriptor === undefined ||
          !descriptor.enumerable ||
          !("value" in descriptor)
        ) {
          return invalidWorkflowCommit();
        }
        preflightPreparedWorkflowJson(
          descriptor.value,
          ancestors,
          depth + 1,
        );
      }
      return;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return invalidWorkflowCommit();
    }
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string" || !isUnicodeScalarString(key)) {
        return invalidWorkflowCommit();
      }
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) {
        return invalidWorkflowCommit();
      }
      preflightPreparedWorkflowJson(
        descriptor.value,
        ancestors,
        depth + 1,
      );
    }
  } finally {
    ancestors.delete(value);
  }
}

function objectStorageKey(record: PortableCognitiveObjectRecord): string {
  return `${record.payload.id}\u0000${record.payload.version}`;
}

function validateWorkflowRecords(
  initialHypothesis: PortableCognitiveObjectRecord,
  evidence: PortableCognitiveObjectRecord,
  reviewedHypothesis: PortableCognitiveObjectRecord,
  event: PortableCognitionEventRecord,
  invalid: () => never,
): void {
  if (
    new Set([
      objectStorageKey(initialHypothesis),
      objectStorageKey(evidence),
      objectStorageKey(reviewedHypothesis),
    ]).size !== 3 ||
    initialHypothesis.payload.type !== "hypothesis" ||
    initialHypothesis.payload.state !== "proposed" ||
    evidence.payload.type !== "evidence" ||
    reviewedHypothesis.payload.type !== "hypothesis" ||
    reviewedHypothesis.payload.state !== "under_review" ||
    reviewedHypothesis.payload.id !== initialHypothesis.payload.id ||
    event.payload.objectId !== reviewedHypothesis.payload.id ||
    event.payload.objectVersion !== reviewedHypothesis.payload.version ||
    event.payload.objectType !== reviewedHypothesis.payload.type
  ) {
    invalid();
  }
  const {
    version: initialVersion,
    state: initialState,
    updatedAt: initialUpdatedAt,
    attribution: initialAttribution,
    ...initialStableFields
  } = initialHypothesis.payload;
  const {
    version: reviewedVersion,
    state: reviewedState,
    updatedAt: reviewedUpdatedAt,
    attribution: reviewedAttribution,
    ...reviewedStableFields
  } = reviewedHypothesis.payload;
  if (
    initialVersion !== 1 ||
    initialState !== "proposed" ||
    reviewedVersion !== 2 ||
    reviewedState !== "under_review" ||
    canonicalizeJson(initialStableFields as unknown as JsonValue) !==
      canonicalizeJson(reviewedStableFields as unknown as JsonValue) ||
    evidence.payload.contextId !== initialHypothesis.payload.contextId ||
    !evidence.payload.relationships.some((relationship) =>
      relationship.type === "relates-to-hypothesis" &&
      relationship.targetId === initialHypothesis.payload.id
    ) ||
    event.payload.previousState !== initialHypothesis.payload.state ||
    event.payload.contextId !== initialHypothesis.payload.contextId ||
    reviewedAttribution.initiatorId !== event.payload.initiator.id ||
    reviewedAttribution.executorId !== event.payload.executor.id ||
    reviewedAttribution.accountableId !== event.payload.accountableParty.id ||
    evidence.payload.attribution.initiatorId !== event.payload.initiator.id ||
    evidence.payload.attribution.executorId !== event.payload.executor.id ||
    evidence.payload.attribution.accountableId !== event.payload.accountableParty.id
  ) {
    invalid();
  }
}

function snapshotPreparedWorkflow(
  request: PreparedDurableCognitionCommit,
): PreparedSqliteWorkflowCommit {
  const fields: Record<string, unknown> = Object.create(null);
  try {
    if (
      typeof request !== "object" ||
      request === null ||
      isProxy(request)
    ) {
      return invalidWorkflowCommit();
    }
    preflightPreparedWorkflowJson(request);
    const prototype = Object.getPrototypeOf(request);
    if (prototype !== Object.prototype && prototype !== null) {
      return invalidWorkflowCommit();
    }
    const keys = Reflect.ownKeys(request);
    if (
      keys.length !== preparedWorkflowFields.size ||
      keys.some((key) => typeof key !== "string" || !preparedWorkflowFields.has(key))
    ) {
      return invalidWorkflowCommit();
    }
    for (const key of preparedWorkflowFields) {
      const descriptor = Reflect.getOwnPropertyDescriptor(request, key);
      if (
        descriptor === undefined ||
        descriptor.enumerable !== true ||
        !("value" in descriptor)
      ) {
        return invalidWorkflowCommit();
      }
      fields[key] = descriptor.value;
    }
  } catch {
    return invalidWorkflowCommit();
  }

  if (
    typeof fields.workflowId !== "string" ||
    fields.workflowId.trim().length === 0 ||
    typeof fields.requestDigest !== "string" ||
    !/^[0-9a-f]{64}$/.test(fields.requestDigest) ||
    fields.expectedHypothesisVersion !== 1
  ) {
    return invalidWorkflowCommit();
  }

  let initialHypothesis: PortableCognitiveObjectRecord;
  let evidence: PortableCognitiveObjectRecord;
  let reviewedHypothesis: PortableCognitiveObjectRecord;
  let event: PortableCognitionEventRecord;
  try {
    initialHypothesis = prepareInitialCognitionCommit({
      object: fields.initialHypothesis as PortableCognitiveObjectRecord,
    }).object;
    evidence = prepareInitialCognitionCommit({
      object: fields.evidence as PortableCognitiveObjectRecord,
    }).object;
    const transition = prepareTransitionCognitionCommit({
      expectedVersion: 1,
      object: fields.reviewedHypothesis as PortableCognitiveObjectRecord,
      event: fields.event as PortableCognitionEventRecord,
    });
    reviewedHypothesis = transition.object;
    event = transition.event;
  } catch {
    return invalidWorkflowCommit();
  }

  validateWorkflowRecords(
    initialHypothesis,
    evidence,
    reviewedHypothesis,
    event,
    invalidWorkflowCommit,
  );

  return Object.freeze({
    workflowId: fields.workflowId,
    requestDigest: fields.requestDigest,
    initialHypothesis,
    evidence,
    expectedHypothesisVersion: 1,
    reviewedHypothesis,
    event,
    initialCanonical: canonicalizeJson(initialHypothesis as unknown as JsonValue),
    evidenceCanonical: canonicalizeJson(evidence as unknown as JsonValue),
    reviewedCanonical: canonicalizeJson(reviewedHypothesis as unknown as JsonValue),
    eventCanonical: canonicalizeJson(event as unknown as JsonValue),
    initialSerialized: serializePortableCognitionRecord(initialHypothesis),
    evidenceSerialized: serializePortableCognitionRecord(evidence),
    reviewedSerialized: serializePortableCognitionRecord(reviewedHypothesis),
    eventSerialized: serializePortableCognitionRecord(event),
  });
}

function readStoredObject(row: StoredObjectRow): ValidatedStoredObject {
  if (
    typeof row.object_id !== "string" ||
    typeof row.object_version !== "number" ||
    !Number.isSafeInteger(row.object_version) ||
    typeof row.object_type !== "string" ||
    typeof row.record_json !== "string"
  ) {
    return invalidStoredWorkflow();
  }
  const record = deserializePortableCognitionRecord(row.record_json);
  if (
    record.recordType !== "cognitive-object" ||
    record.payload.id !== row.object_id ||
    record.payload.version !== row.object_version ||
    record.payload.type !== row.object_type
  ) {
    return invalidStoredWorkflow();
  }
  return Object.freeze({
    record,
    canonical: canonicalizeJson(record as unknown as JsonValue),
  });
}

function readStoredEvent(row: StoredEventRow): ValidatedStoredEvent {
  if (
    typeof row.event_id !== "string" ||
    typeof row.object_id !== "string" ||
    typeof row.object_version !== "number" ||
    !Number.isSafeInteger(row.object_version) ||
    typeof row.record_json !== "string"
  ) {
    return invalidStoredWorkflow();
  }
  const record = deserializePortableCognitionRecord(row.record_json);
  if (
    record.recordType !== "cognition-event" ||
    record.payload.id !== row.event_id ||
    record.payload.objectId !== row.object_id ||
    record.payload.objectVersion !== row.object_version
  ) {
    return invalidStoredWorkflow();
  }
  return Object.freeze({
    record,
    canonical: canonicalizeJson(record as unknown as JsonValue),
  });
}

function readStoredReceipt(
  row: StoredWorkflowRow,
  workflowId: string,
): void {
  if (
    row.workflow_id !== workflowId ||
    typeof row.request_digest !== "string" ||
    !/^[0-9a-f]{64}$/.test(row.request_digest) ||
    typeof row.initial_hypothesis_id !== "string" ||
    row.initial_hypothesis_id.length === 0 ||
    typeof row.evidence_id !== "string" ||
    row.evidence_id.length === 0 ||
    row.reviewed_hypothesis_version !== 2 ||
    typeof row.event_id !== "string" ||
    row.event_id.length === 0
  ) {
    invalidStoredWorkflow();
  }
}

function readRequiredStoredObject(
  database: DatabaseSync,
  objectId: string,
  objectVersion: number,
): ValidatedStoredObject {
  const row = database.prepare(`
    SELECT object_id, object_version, object_type, record_json
    FROM cognition_objects
    WHERE object_id = ? AND object_version = ?
  `).get(objectId, objectVersion) as StoredObjectRow | undefined;
  return row === undefined ? invalidStoredWorkflow() : readStoredObject(row);
}

function readRequiredStoredEvent(
  database: DatabaseSync,
  eventId: string,
): ValidatedStoredEvent {
  const row = database.prepare(`
    SELECT event_id, object_id, object_version, record_json
    FROM cognition_events
    WHERE event_id = ?
  `).get(eventId) as StoredEventRow | undefined;
  return row === undefined ? invalidStoredWorkflow() : readStoredEvent(row);
}

function readReceiptWorkflow(
  database: DatabaseSync,
  receipt: StoredWorkflowRow,
  workflowId: string,
): {
  readonly initialCanonical: string;
  readonly evidenceCanonical: string;
  readonly reviewedCanonical: string;
  readonly eventCanonical: string;
} {
  readStoredReceipt(receipt, workflowId);
  const initial = readRequiredStoredObject(
    database,
    receipt.initial_hypothesis_id as string,
    1,
  );
  const evidence = readRequiredStoredObject(
    database,
    receipt.evidence_id as string,
    1,
  );
  const reviewed = readRequiredStoredObject(
    database,
    receipt.initial_hypothesis_id as string,
    receipt.reviewed_hypothesis_version as number,
  );
  const event = readRequiredStoredEvent(
    database,
    receipt.event_id as string,
  );
  validateWorkflowRecords(
    initial.record,
    evidence.record,
    reviewed.record,
    event.record,
    invalidStoredWorkflow,
  );
  return Object.freeze({
    initialCanonical: initial.canonical,
    evidenceCanonical: evidence.canonical,
    reviewedCanonical: reviewed.canonical,
    eventCanonical: event.canonical,
  });
}

function readWorkflowRecords(
  database: DatabaseSync,
  request: PreparedSqliteWorkflowCommit,
): {
  readonly objects: readonly (string | undefined)[];
  readonly event: string | undefined;
  readonly occupiedEvent: string | undefined;
  readonly latestHypothesisVersion: number | undefined;
} {
  const objects = [
    request.initialHypothesis,
    request.evidence,
    request.reviewedHypothesis,
  ].map((record) => {
    const row = database.prepare(`
      SELECT object_id, object_version, object_type, record_json
      FROM cognition_objects
      WHERE object_id = ? AND object_version = ?
    `).get(record.payload.id, record.payload.version) as StoredObjectRow | undefined;
    return row === undefined ? undefined : readStoredObject(row).canonical;
  });
  const eventRow = database.prepare(`
    SELECT event_id, object_id, object_version, record_json
    FROM cognition_events
    WHERE event_id = ?
  `).get(request.event.payload.id) as StoredEventRow | undefined;
  const occupiedEventRow = database.prepare(`
    SELECT event_id, object_id, object_version, record_json
    FROM cognition_events
    WHERE object_id = ? AND object_version = ?
  `).get(
    request.reviewedHypothesis.payload.id,
    request.reviewedHypothesis.payload.version,
  ) as StoredEventRow | undefined;
  const latestHypothesisRow = database.prepare(`
    SELECT object_id, object_version, object_type, record_json
    FROM cognition_objects
    WHERE object_id = ?
    ORDER BY object_version DESC
    LIMIT 1
  `).get(
    request.initialHypothesis.payload.id,
  ) as StoredObjectRow | undefined;
  let latestHypothesisVersion: number | undefined;
  if (latestHypothesisRow !== undefined) {
    readStoredObject(latestHypothesisRow);
    latestHypothesisVersion = latestHypothesisRow.object_version as number;
  }
  return {
    objects,
    event: eventRow === undefined
      ? undefined
      : readStoredEvent(eventRow).canonical,
    occupiedEvent: occupiedEventRow === undefined
      ? undefined
      : readStoredEvent(occupiedEventRow).canonical,
    latestHypothesisVersion,
  };
}

function conflict(
  request: PreparedSqliteWorkflowCommit,
  code:
    | "workflow_id_collision"
    | "object_revision_collision"
    | "event_id_collision"
    | "version_conflict"
    | "incomplete_workflow",
): DurableCognitionCommitResult {
  return Object.freeze({
    status: "conflict",
    conflict: Object.freeze({
      code,
      workflowId: request.workflowId,
    }),
  });
}

export class SqliteCognitionWorkflowStore
  extends SqliteCognitionWorkflowStoreBase
  implements CognitionWorkflowStore {
  constructor(options: SqliteCognitionWorkflowStoreOptions) {
    super(options, sqliteCognitionWorkflowSchemaTarget);
  }

  async commitWorkflow(
    request: PreparedDurableCognitionCommit,
  ): Promise<DurableCognitionCommitResult> {
    const prepared = snapshotPreparedWorkflow(request);
    return runSqliteCognitionStoreImmediateTransaction(this, (database) => {
      const receipt = database.prepare(`
        SELECT
          workflow_id,
          request_digest,
          initial_hypothesis_id,
          evidence_id,
          reviewed_hypothesis_version,
          event_id
        FROM cognition_workflows
        WHERE workflow_id = ?
      `).get(prepared.workflowId) as StoredWorkflowRow | undefined;
      if (receipt !== undefined) {
        const stored = readReceiptWorkflow(
          database,
          receipt,
          prepared.workflowId,
        );
        if (receipt.request_digest !== prepared.requestDigest) {
          return conflict(prepared, "workflow_id_collision");
        }
        if (
          receipt.initial_hypothesis_id !== prepared.initialHypothesis.payload.id ||
          receipt.evidence_id !== prepared.evidence.payload.id ||
          receipt.event_id !== prepared.event.payload.id ||
          stored.initialCanonical !== prepared.initialCanonical ||
          stored.evidenceCanonical !== prepared.evidenceCanonical ||
          stored.reviewedCanonical !== prepared.reviewedCanonical ||
          stored.eventCanonical !== prepared.eventCanonical
        ) {
          invalidStoredWorkflow();
        }
        return Object.freeze({ status: "already_committed" });
      }

      const records = readWorkflowRecords(database, prepared);

      if (
        records.objects[0] === prepared.initialCanonical &&
        records.objects[1] === prepared.evidenceCanonical &&
        records.objects[2] === prepared.reviewedCanonical &&
        records.event === prepared.eventCanonical &&
        records.occupiedEvent === prepared.eventCanonical
      ) {
        return conflict(prepared, "incomplete_workflow");
      }

      if (
        (records.objects[0] !== undefined &&
          records.objects[0] !== prepared.initialCanonical) ||
        (records.objects[1] !== undefined &&
          records.objects[1] !== prepared.evidenceCanonical) ||
        records.objects[2] !== undefined
      ) {
        return conflict(prepared, "object_revision_collision");
      }

      if (
        (records.event !== undefined &&
          records.event !== prepared.eventCanonical) ||
        (records.occupiedEvent !== undefined &&
          records.occupiedEvent !== prepared.eventCanonical)
      ) {
        return conflict(prepared, "event_id_collision");
      }

      if (
        records.latestHypothesisVersion !== undefined &&
        records.latestHypothesisVersion !== prepared.expectedHypothesisVersion
      ) {
        return conflict(prepared, "version_conflict");
      }

      const objectInsert = database.prepare(`
        INSERT INTO cognition_objects (
          object_id,
          object_version,
          object_type,
          record_json
        ) VALUES (?, ?, ?, ?)
      `);
      objectInsert.run(
        prepared.initialHypothesis.payload.id,
        prepared.initialHypothesis.payload.version,
        prepared.initialHypothesis.payload.type,
        prepared.initialSerialized,
      );
      objectInsert.run(
        prepared.evidence.payload.id,
        prepared.evidence.payload.version,
        prepared.evidence.payload.type,
        prepared.evidenceSerialized,
      );
      objectInsert.run(
        prepared.reviewedHypothesis.payload.id,
        prepared.reviewedHypothesis.payload.version,
        prepared.reviewedHypothesis.payload.type,
        prepared.reviewedSerialized,
      );
      database.prepare(`
        INSERT INTO cognition_events (
          event_id,
          object_id,
          object_version,
          record_json
        ) VALUES (?, ?, ?, ?)
      `).run(
        prepared.event.payload.id,
        prepared.event.payload.objectId,
        prepared.event.payload.objectVersion,
        prepared.eventSerialized,
      );
      database.prepare(`
        INSERT INTO cognition_workflows (
          workflow_id,
          request_digest,
          initial_hypothesis_id,
          evidence_id,
          reviewed_hypothesis_version,
          event_id
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        prepared.workflowId,
        prepared.requestDigest,
        prepared.initialHypothesis.payload.id,
        prepared.evidence.payload.id,
        prepared.reviewedHypothesis.payload.version,
        prepared.event.payload.id,
      );
      return { status: "committed" };
    });
  }
}
