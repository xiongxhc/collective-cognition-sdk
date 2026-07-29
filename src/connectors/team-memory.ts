import { DatabaseSync } from "node:sqlite";
import { isAbsolute } from "node:path";

import { createSourceRecord } from "../source-records.ts";
import { isJsonObject, isUnicodeScalarString } from "../types.ts";
import type { SourceRecord } from "../source-records.ts";
import type { JsonObject } from "../types.ts";

export const TEAM_MEMORY_LEDGER_FORMAT = "teammem-event-ledger/1";

export interface TeamMemorySourceRecordOptions {
  readonly databasePath: string;
  readonly sourceInstance: string;
  readonly from?: string;
  readonly to?: string;
  readonly person?: string;
  readonly project?: string;
  readonly limit?: number;
  readonly includeRaw?: boolean;
}

export type TeamMemoryConnectorErrorCode =
  | "invalid_options"
  | "target_unavailable"
  | "incompatible_ledger"
  | "invalid_row"
  | "read_failed";

type TeamMemoryConnectorStage =
  | "options"
  | "open"
  | "schema"
  | "query"
  | "mapping";

export class TeamMemoryConnectorError extends Error {
  readonly code: TeamMemoryConnectorErrorCode;
  readonly stage: TeamMemoryConnectorStage;
  readonly details: Readonly<Record<string, string | number | boolean>>;

  constructor(
    code: TeamMemoryConnectorErrorCode,
    stage: TeamMemoryConnectorStage,
    message: string,
    details: Readonly<Record<string, string | number | boolean>> = {},
  ) {
    super(message);
    this.name = "TeamMemoryConnectorError";
    this.code = code;
    this.stage = stage;
    this.details = Object.freeze({ ...details });
    Object.freeze(this);
  }
}

interface ValidatedOptions {
  readonly databasePath: string;
  readonly sourceInstance: string;
  readonly from?: string;
  readonly to?: string;
  readonly person?: string;
  readonly project?: string;
  readonly limit?: number;
  readonly includeRaw: boolean;
}

interface TeamMemoryRow {
  readonly id: number;
  readonly person: string;
  readonly project: string | null;
  readonly ts: string;
  readonly source: string;
  readonly kind: string;
  readonly summary: string;
  readonly refs: JsonObject;
  readonly raw: string | null;
  readonly hash: string;
}

interface SchemaColumn {
  readonly name: string;
  readonly type: string;
  readonly not_null: number;
  readonly pk: number;
}

const allowedOptionFields = new Set([
  "databasePath",
  "sourceInstance",
  "from",
  "to",
  "person",
  "project",
  "limit",
  "includeRaw",
]);
const isoTimestampPattern =
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const controlCharacterPattern = /[\u0000-\u001f\u007f-\u009f]/u;
const requiredColumns = Object.freeze({
  id: "INTEGER",
  person: "TEXT",
  project: "TEXT",
  ts: "TEXT",
  source: "TEXT",
  kind: "TEXT",
  summary: "TEXT",
  refs: "TEXT",
  raw: "TEXT",
  hash: "TEXT",
});
const requiredNotNullColumns = new Set([
  "person",
  "ts",
  "source",
  "kind",
  "summary",
  "hash",
]);

function connectorError(
  code: TeamMemoryConnectorErrorCode,
  stage: TeamMemoryConnectorStage,
  field?: string,
): TeamMemoryConnectorError {
  const messages: Record<TeamMemoryConnectorErrorCode, string> = {
    invalid_options: "Team-memory connector options are invalid.",
    target_unavailable: "Team-memory ledger is unavailable.",
    incompatible_ledger: "Team-memory ledger schema is incompatible.",
    invalid_row: "Team-memory ledger contains an invalid row.",
    read_failed: "Team-memory ledger could not be read.",
  };
  return new TeamMemoryConnectorError(
    code,
    stage,
    messages[code],
    field === undefined ? {} : { field },
  );
}

function snapshotOptions(value: unknown): Record<string, unknown> {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw connectorError("invalid_options", "options");
    }
    const keys = Reflect.ownKeys(value);
    if (
      keys.some((key) =>
        typeof key !== "string" || !allowedOptionFields.has(key)
      )
    ) {
      throw connectorError("invalid_options", "options");
    }
    const snapshot: Record<string, unknown> = {};
    for (const key of keys) {
      if (typeof key !== "string") {
        throw connectorError("invalid_options", "options");
      }
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) {
        throw connectorError("invalid_options", "options");
      }
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch (error) {
    if (error instanceof TeamMemoryConnectorError) {
      throw error;
    }
    throw connectorError("invalid_options", "options");
  }
}

function validIsoTimestamp(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !isoTimestampPattern.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    return false;
  }
  const datePart = value.slice(0, 10);
  const calendarDate = new Date(`${datePart}T00:00:00.000Z`);
  return !Number.isNaN(calendarDate.getTime()) &&
    calendarDate.toISOString().slice(0, 10) === datePart;
}

function validSourceInstance(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value === value.trim() &&
    isUnicodeScalarString(value) &&
    [...value].length <= 128 &&
    !controlCharacterPattern.test(value);
}

function optionalNonEmptyString(
  value: unknown,
  field: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    throw connectorError("invalid_options", "options", field);
  }
  return value;
}

function validateOptions(value: unknown): ValidatedOptions {
  const options = snapshotOptions(value);
  const databasePath = options.databasePath;
  if (
    typeof databasePath !== "string" ||
    databasePath.length === 0 ||
    databasePath.includes("\u0000") ||
    databasePath.startsWith("~") ||
    databasePath === ":memory:" ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(databasePath) ||
    !isAbsolute(databasePath)
  ) {
    throw connectorError("invalid_options", "options", "databasePath");
  }
  if (!validSourceInstance(options.sourceInstance)) {
    throw connectorError("invalid_options", "options", "sourceInstance");
  }
  for (const field of ["from", "to"] as const) {
    if (options[field] !== undefined && !validIsoTimestamp(options[field])) {
      throw connectorError("invalid_options", "options", field);
    }
  }
  const person = optionalNonEmptyString(options.person, "person");
  const project = optionalNonEmptyString(options.project, "project");
  const limit = options.limit;
  if (
    limit !== undefined &&
    (!Number.isSafeInteger(limit) || (limit as number) <= 0)
  ) {
    throw connectorError("invalid_options", "options", "limit");
  }
  if (
    options.includeRaw !== undefined &&
    typeof options.includeRaw !== "boolean"
  ) {
    throw connectorError("invalid_options", "options", "includeRaw");
  }

  return {
    databasePath,
    sourceInstance: options.sourceInstance,
    ...(options.from === undefined ? {} : { from: options.from as string }),
    ...(options.to === undefined ? {} : { to: options.to as string }),
    ...(person === undefined ? {} : { person }),
    ...(project === undefined ? {} : { project }),
    ...(limit === undefined ? {} : { limit: limit as number }),
    includeRaw: options.includeRaw === true,
  };
}

function schemaIsCompatible(database: DatabaseSync): boolean {
  const columns = database.prepare(
    `SELECT name, type, "notnull" AS not_null, pk
       FROM pragma_table_info('events')`,
  ).all() as unknown as SchemaColumn[];
  const byName = new Map(columns.map((column) => [column.name, column]));
  if (columns.filter(({ pk }) => pk > 0).length !== 1) {
    return false;
  }
  for (const [name, type] of Object.entries(requiredColumns)) {
    const column = byName.get(name);
    if (
      column === undefined ||
      column.type.trim().toUpperCase() !== type ||
      (name === "id" && column.pk !== 1) ||
      (requiredNotNullColumns.has(name) && column.not_null !== 1)
    ) {
      return false;
    }
  }

  const indexes = database.prepare(
    `SELECT name, "unique" AS is_unique, origin, partial
       FROM pragma_index_list('events')`,
  ).all() as unknown as Array<{
    readonly name: string;
    readonly is_unique: number;
    readonly origin: string;
    readonly partial: number;
  }>;
  if (indexes.some(({ origin }) => origin === "pk")) {
    return false;
  }
  return indexes.some(({ name, is_unique, partial }) => {
    if (is_unique !== 1 || partial !== 0) {
      return false;
    }
    const columns = database.prepare(
      "SELECT name FROM pragma_index_info(?) ORDER BY seqno ASC",
    ).all(name) as unknown as Array<{ readonly name: string }>;
    return columns.length === 3 &&
      columns[0]?.name === "person" &&
      columns[1]?.name === "source" &&
      columns[2]?.name === "hash";
  });
}

function parseReferences(value: unknown): JsonObject {
  if (value === null) {
    return {};
  }
  if (typeof value !== "string") {
    throw connectorError("invalid_row", "mapping", "refs");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw connectorError("invalid_row", "mapping", "refs");
  }
  if (!isJsonObject(parsed)) {
    throw connectorError("invalid_row", "mapping", "refs");
  }
  return parsed;
}

function validateRow(value: unknown): TeamMemoryRow {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw connectorError("invalid_row", "mapping");
  }
  const row = value as Record<string, unknown>;
  if (!Number.isSafeInteger(row.id) || (row.id as number) <= 0) {
    throw connectorError("invalid_row", "mapping", "id");
  }
  for (const field of [
    "person",
    "ts",
    "source",
    "kind",
    "summary",
    "hash",
  ]) {
    if (typeof row[field] !== "string" || row[field].trim().length === 0) {
      throw connectorError("invalid_row", "mapping", field);
    }
  }
  if (!validIsoTimestamp(row.ts)) {
    throw connectorError("invalid_row", "mapping", "ts");
  }
  if (row.project !== null && typeof row.project !== "string") {
    throw connectorError("invalid_row", "mapping", "project");
  }
  if (row.raw !== null && typeof row.raw !== "string") {
    throw connectorError("invalid_row", "mapping", "raw");
  }

  return {
    id: row.id as number,
    person: row.person as string,
    project: row.project as string | null,
    ts: row.ts,
    source: row.source as string,
    kind: row.kind as string,
    summary: row.summary as string,
    refs: parseReferences(row.refs),
    raw: row.raw as string | null,
    hash: row.hash as string,
  };
}

function encoded(values: readonly string[]): string {
  return values.map((value) => encodeURIComponent(value)).join(":");
}

function mapRow(
  row: TeamMemoryRow,
  options: ValidatedOptions,
): SourceRecord {
  const sourceId = encoded([row.person, row.source]);
  return createSourceRecord({
    id: encoded([
      "source-record",
      "teammem-event-ledger",
      options.sourceInstance,
      row.person,
      row.source,
      row.hash,
    ]),
    source: {
      system: "teammem-event-ledger",
      instance: options.sourceInstance,
    },
    sourceId,
    revisionId: row.hash,
    capturedAt: row.ts,
    observedAt: row.ts,
    mediaType: "application/vnd.team-memory.event+json",
    content: {
      project: row.project,
      kind: row.kind,
      summary: row.summary,
      refs: row.refs,
      ...(options.includeRaw ? { raw: row.raw } : {}),
    },
    actorId: `person:${row.person}`,
  });
}

function readRows(
  database: DatabaseSync,
  options: ValidatedOptions,
): readonly TeamMemoryRow[] {
  const filters: string[] = [];
  const parameters: Array<string | number> = [];
  for (const [value, clause] of [
    [options.from, "ts >= ?"],
    [options.to, "ts < ?"],
    [options.person, "person = ?"],
    [options.project, "project = ?"],
  ] as const) {
    if (value !== undefined) {
      filters.push(clause);
      parameters.push(value);
    }
  }
  let sql =
    "SELECT id, person, project, ts, source, kind, summary, refs, raw, hash FROM events";
  if (filters.length > 0) {
    sql += ` WHERE ${filters.join(" AND ")}`;
  }
  sql += " ORDER BY ts ASC, id ASC";
  if (options.limit !== undefined) {
    sql += " LIMIT ?";
    parameters.push(options.limit);
  }

  let values: readonly unknown[];
  try {
    values = database.prepare(sql).all(...parameters);
  } catch {
    throw connectorError("read_failed", "query");
  }
  return values.map(validateRow);
}

export function readTeamMemorySourceRecords(
  input: TeamMemorySourceRecordOptions,
): readonly SourceRecord[] {
  const options = validateOptions(input);
  let database: DatabaseSync;
  try {
    database = new DatabaseSync(options.databasePath, {
      open: true,
      readOnly: true,
    });
  } catch {
    throw connectorError("target_unavailable", "open");
  }

  let records: readonly SourceRecord[] | undefined;
  let failure: TeamMemoryConnectorError | undefined;
  try {
    try {
      if (!schemaIsCompatible(database)) {
        throw connectorError("incompatible_ledger", "schema");
      }
    } catch (error) {
      if (error instanceof TeamMemoryConnectorError) {
        throw error;
      }
      throw connectorError("incompatible_ledger", "schema");
    }
    records = Object.freeze(
      readRows(database, options).map((row) => {
        try {
          return mapRow(row, options);
        } catch (error) {
          if (error instanceof TeamMemoryConnectorError) {
            throw error;
          }
          throw connectorError("invalid_row", "mapping");
        }
      }),
    );
  } catch (error) {
    failure = error instanceof TeamMemoryConnectorError
      ? error
      : connectorError("read_failed", "query");
  }

  try {
    database.close();
  } catch {
    failure ??= connectorError("read_failed", "query");
  }
  if (failure !== undefined) {
    throw failure;
  }
  return records ?? Object.freeze([]);
}
