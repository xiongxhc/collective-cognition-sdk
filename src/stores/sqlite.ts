import { existsSync, rmSync } from "node:fs";
import { isAbsolute } from "node:path";
import { DatabaseSync } from "node:sqlite";

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

const adapterId = "collective-cognition-sdk:sqlite-store";
const schemaVersion = 1;
const maximumBusyTimeoutMs = 60_000;
const expectedTables = [
  "cognition_events",
  "cognition_objects",
  "cognition_schema",
] as const;

const schemaSql = `
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
  return new DatabaseSync(databasePath, {
    allowExtension: false,
    defensive: true,
    enableDoubleQuotedStringLiterals: false,
    enableForeignKeyConstraints: true,
    readOnly,
    timeout: busyTimeoutMs,
  });
}

function assertSchemaIdentity(database: DatabaseSync): void {
  try {
    const tables = database
      .prepare(
        `
          SELECT name
          FROM pragma_table_list
          WHERE schema = 'main'
            AND name NOT LIKE 'sqlite_%'
            AND strict = 1
          ORDER BY name
        `,
      )
      .all()
      .map((row) => (row as { readonly name: unknown }).name);
    if (
      tables.length !== expectedTables.length ||
      tables.some((table, index) => table !== expectedTables[index])
    ) {
      return invalidTarget();
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
  let database: DatabaseSync | undefined;
  try {
    database = openDatabase(databasePath, busyTimeoutMs, false);
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
    return database;
  } catch {
    if (database?.isTransaction) {
      database.exec("ROLLBACK");
    }
    if (database?.isOpen) {
      database.close();
    }
    rmSync(databasePath, { force: true });
    return invalidTarget();
  }
}

export class SqliteCognitionStore implements CognitionStore {
  readonly #database: DatabaseSync;

  constructor(options: SqliteCognitionStoreOptions) {
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
