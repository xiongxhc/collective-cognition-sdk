import { DatabaseSync } from "node:sqlite";

import { DomainError, DomainErrorCode } from "../errors.ts";
import { createSourceRecord } from "../source-records.ts";
import { isJsonObject } from "../types.ts";
import type { SourceRecord } from "../source-records.ts";
import type { JsonObject } from "../types.ts";

export interface TeamMemoryEventRow {
  readonly id: number;
  readonly person: string;
  readonly project: string | null;
  readonly ts: string;
  readonly source: string;
  readonly kind: string;
  readonly summary: string;
  readonly refs: string | null;
  readonly raw: string | null;
  readonly hash: string;
}

export interface TeamMemoryQuery {
  readonly dbPath: string;
  readonly from?: string;
  readonly to?: string;
  readonly person?: string;
  readonly project?: string;
  readonly limit?: number;
}

const isoTimestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

function isIsoTimestamp(value: unknown): value is string {
  if (
    typeof value === "string" &&
    isoTimestampPattern.test(value) &&
    !Number.isNaN(Date.parse(value))
  ) {
    const datePart = value.slice(0, 10);
    const calendarDate = new Date(`${datePart}T00:00:00.000Z`);
    return (
      !Number.isNaN(calendarDate.getTime()) &&
      calendarDate.toISOString().slice(0, 10) === datePart
    );
  }
  return false;
}

function validateLimit(limit: number | undefined): void {
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    throw new DomainError(
      DomainErrorCode.INVALID_OBJECT,
      "Team-memory limit must be a positive integer.",
      { field: "limit" },
    );
  }
}

function invalidRow(field: string, message: string): never {
  throw new DomainError(DomainErrorCode.INVALID_OBJECT, message, { field });
}

function parseRefs(refs: unknown): JsonObject {
  if (refs === null) {
    return {};
  }
  if (typeof refs !== "string") {
    invalidRow("refs", "Team-memory refs must be null or a JSON string.");
  }

  let value: unknown;
  try {
    value = JSON.parse(refs);
  } catch {
    throw new DomainError(
      DomainErrorCode.INVALID_OBJECT,
      "Team-memory refs must be valid JSON.",
    );
  }

  if (!isJsonObject(value)) {
    throw new DomainError(
      DomainErrorCode.INVALID_OBJECT,
      "Team-memory refs must be a JSON object.",
    );
  }
  return value;
}

function validateTeamMemoryEventRow(
  value: unknown,
): asserts value is TeamMemoryEventRow {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalidRow("row", "Team-memory row must be an object.");
  }

  const row = value as Record<string, unknown>;
  if (!Number.isInteger(row.id) || (row.id as number) <= 0) {
    invalidRow("id", "Team-memory row id must be a positive integer.");
  }
  for (const field of ["person", "ts", "source", "kind", "summary", "hash"]) {
    if (typeof row[field] !== "string" || row[field].trim().length === 0) {
      invalidRow(field, `Team-memory row ${field} must be a non-empty string.`);
    }
  }
  if (!isIsoTimestamp(row.ts)) {
    invalidRow("ts", "Team-memory row ts must be an ISO timestamp.");
  }
  if (row.project !== null && typeof row.project !== "string") {
    invalidRow("project", "Team-memory row project must be null or a string.");
  }
  if (row.raw !== null && typeof row.raw !== "string") {
    invalidRow("raw", "Team-memory row raw must be null or a string.");
  }

  const refs = parseRefs(row.refs);
  if (refs.url !== undefined && typeof refs.url !== "string") {
    invalidRow("refs.url", "Team-memory refs.url must be a string when present.");
  }
}

function sourceIdFor(row: TeamMemoryEventRow): string {
  return [row.person, row.source]
    .map((value) => encodeURIComponent(value))
    .join(":");
}

function recordIdFor(row: TeamMemoryEventRow): string {
  return [
    "source-record",
    "team-memory",
    sourceIdFor(row),
    encodeURIComponent(row.hash),
  ].join(":");
}

export function readTeamMemoryEvents(
  options: TeamMemoryQuery,
): TeamMemoryEventRow[] {
  validateLimit(options.limit);

  const filters: string[] = [];
  const parameters: (string | number)[] = [];
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

  let sql = "SELECT id, person, project, ts, source, kind, summary, refs, raw, hash FROM events";
  if (filters.length > 0) {
    sql += ` WHERE ${filters.join(" AND ")}`;
  }
  sql += " ORDER BY ts ASC, id ASC";
  if (options.limit !== undefined) {
    sql += " LIMIT ?";
    parameters.push(options.limit);
  }

  const database = new DatabaseSync(options.dbPath, { open: true, readOnly: true });
  try {
    const rows = database.prepare(sql).all(...parameters);
    for (const row of rows) {
      validateTeamMemoryEventRow(row);
    }
    return rows as unknown as TeamMemoryEventRow[];
  } finally {
    database.close();
  }
}

export function teamMemoryEventToSourceRecord(
  row: TeamMemoryEventRow,
): SourceRecord {
  validateTeamMemoryEventRow(row);
  const refs = parseRefs(row.refs);

  return createSourceRecord({
    id: recordIdFor(row),
    source: { system: "team-memory-agent" },
    sourceId: sourceIdFor(row),
    revisionId: row.hash,
    capturedAt: row.ts,
    observedAt: row.ts,
    mediaType: "application/vnd.team-memory.event+json",
    content: {
      project: row.project,
      kind: row.kind,
      summary: row.summary,
      refs,
      raw: row.raw,
    },
    actorId: `person:${row.person}`,
  });
}
