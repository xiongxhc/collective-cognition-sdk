import {
  existsSync,
  linkSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { isDeepStrictEqual } from "node:util";

import {
  prepareInitialCognitionCommit,
  prepareTransitionCognitionCommit,
} from "../host-integration.ts";
import {
  deserializePortableCognitionRecord,
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
import type { JsonValue } from "../types.ts";

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

interface StoredObjectRow {
  readonly object_id: unknown;
  readonly object_version: unknown;
  readonly object_type: unknown;
  readonly record_json: unknown;
}

const adapterId = "collective-cognition-sdk:sqlite-store";
const defaultBusyTimeoutMs = 5_000;
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
    busyTimeoutMs: fields.busyTimeoutMs ?? defaultBusyTimeoutMs,
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
  snapshot: SqliteCognitionStoreOptionsSnapshot,
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

export class SqliteCognitionStore implements CognitionStore {
  readonly #database: DatabaseSync;

  constructor(options: SqliteCognitionStoreOptions) {
    assertDefensiveRuntime();
    const snapshot = snapshotOptions(options);
    this.#database = openCompatibleCognitionTarget(
      snapshot,
      new Set([1, 2]),
      schemaVersionOne,
    );
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
