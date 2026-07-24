import { DomainError, DomainErrorCode } from "./errors.ts";
import {
  canonicalizeJson,
  normalizeSourceRecord,
  sourceRevisionKey,
} from "./source-records.ts";
import type { SourceRecord } from "./source-records.ts";

export type IngestionMode = "collect-all" | "fail-fast";

export interface IngestionOptions {
  readonly mode?: IngestionMode;
  readonly existingRecords?: readonly SourceRecord[];
  readonly maxRecords?: number;
  readonly maxRecordBytes?: number;
}

export interface IngestionTextOptions extends IngestionOptions {
  readonly format: "json" | "jsonl";
  readonly maxInputBytes?: number;
}

interface IngestionItemPosition {
  readonly index: number;
  readonly line?: number;
}

export interface AcceptedIngestionItemResult extends IngestionItemPosition {
  readonly status: "accepted";
  readonly record: SourceRecord;
}

export interface DuplicateIngestionItemResult extends IngestionItemPosition {
  readonly status: "duplicate";
  readonly record: SourceRecord;
  readonly retainedRecordId: string;
}

export interface RejectedIngestionItemResult extends IngestionItemPosition {
  readonly status: "rejected";
  readonly error: DomainError;
}

export type IngestionItemResult =
  | AcceptedIngestionItemResult
  | DuplicateIngestionItemResult
  | RejectedIngestionItemResult;

export interface IngestionBatchResult {
  readonly items: readonly IngestionItemResult[];
  readonly acceptedRecords: readonly SourceRecord[];
}

interface RetainedRecord {
  readonly record: SourceRecord;
  readonly contentKey: string;
}

interface IngestionCollector {
  readonly items: IngestionItemResult[];
  readonly acceptedRecords: SourceRecord[];
  ingest(value: unknown, index: number, line?: number, rawBytes?: number): void;
  reject(error: DomainError, index: number, line?: number): void;
}

function contentKey(record: SourceRecord): string {
  return canonicalizeJson({
    mediaType: record.mediaType,
    content: record.content,
  });
}

function serializationError(message: string, cause: unknown): DomainError {
  return new DomainError(DomainErrorCode.SERIALIZATION_ERROR, message, {
    cause: cause instanceof Error ? cause.message : String(cause),
  });
}

function sourceRevisionCollision(
  key: string,
  retainedRecord: SourceRecord,
  incomingRecord: SourceRecord,
): DomainError {
  return new DomainError(
    DomainErrorCode.SOURCE_REVISION_COLLISION,
    "Source revision content conflicts with the retained record.",
    {
      sourceRevisionKey: key,
      retainedRecordId: retainedRecord.id,
      incomingRecordId: incomingRecord.id,
    },
  );
}

function validateLimit(value: number | undefined, field: string): void {
  if (
    value !== undefined &&
    (!Number.isSafeInteger(value) || value <= 0)
  ) {
    throw new DomainError(
      DomainErrorCode.INVALID_OBJECT,
      `Ingestion ${field} must be a positive safe integer.`,
      { field },
    );
  }
}

function limitExceeded(
  limit: "maxInputBytes" | "maxRecords" | "maxRecordBytes",
  maximum: number,
  actual: number,
): never {
  throw new DomainError(
    DomainErrorCode.INGESTION_LIMIT_EXCEEDED,
    `Ingestion ${limit} exceeded.`,
    { limit, maximum, actual },
  );
}

function enforceRecordCount(
  count: number,
  maxRecords: number | undefined,
): void {
  if (maxRecords !== undefined && count > maxRecords) {
    limitExceeded("maxRecords", maxRecords, count);
  }
}

function serializedBytes(record: SourceRecord): number {
  return Buffer.byteLength(JSON.stringify(record));
}

function createCollector(options: IngestionOptions): IngestionCollector {
  const mode = options.mode ?? "collect-all";
  validateLimit(options.maxRecords, "maxRecords");
  validateLimit(options.maxRecordBytes, "maxRecordBytes");
  const retainedRecords = new Map<string, RetainedRecord>();
  const items: IngestionItemResult[] = [];
  const acceptedRecords: SourceRecord[] = [];

  for (const value of options.existingRecords ?? []) {
    const record = normalizeSourceRecord(value);
    const key = sourceRevisionKey(record);
    const existing = retainedRecords.get(key);
    const retained = { record, contentKey: contentKey(record) };
    if (existing !== undefined && existing.contentKey !== retained.contentKey) {
      throw sourceRevisionCollision(key, existing.record, record);
    }
    if (existing === undefined) {
      retainedRecords.set(key, retained);
    }
  }

  function reject(error: DomainError, index: number, line?: number): void {
    if (mode === "fail-fast") {
      throw error;
    }
    items.push({ index, ...(line === undefined ? {} : { line }), status: "rejected", error });
  }

  function ingest(
    value: unknown,
    index: number,
    line?: number,
    rawBytes?: number,
  ): void {
    let record: SourceRecord;
    try {
      record = normalizeSourceRecord(value);
    } catch (error) {
      if (error instanceof DomainError) {
        reject(error, index, line);
        return;
      }
      throw error;
    }

    const recordBytes = rawBytes ?? serializedBytes(record);
    if (
      options.maxRecordBytes !== undefined &&
      recordBytes > options.maxRecordBytes
    ) {
      limitExceeded(
        "maxRecordBytes",
        options.maxRecordBytes,
        recordBytes,
      );
    }

    const key = sourceRevisionKey(record);
    const recordContentKey = contentKey(record);
    const retained = retainedRecords.get(key);

    if (retained === undefined) {
      retainedRecords.set(key, { record, contentKey: recordContentKey });
      acceptedRecords.push(record);
      items.push({
        index,
        ...(line === undefined ? {} : { line }),
        status: "accepted",
        record,
      });
    } else if (retained.contentKey === recordContentKey) {
      items.push({
        index,
        ...(line === undefined ? {} : { line }),
        status: "duplicate",
        record,
        retainedRecordId: retained.record.id,
      });
    } else {
      reject(sourceRevisionCollision(key, retained.record, record), index, line);
    }
  }

  return { items, acceptedRecords, ingest, reject };
}

function resultFrom(collector: IngestionCollector): IngestionBatchResult {
  return {
    items: collector.items,
    acceptedRecords: collector.acceptedRecords,
  };
}

export function ingestSourceRecords(
  values: readonly unknown[],
  options: IngestionOptions = {},
): IngestionBatchResult {
  const collector = createCollector(options);
  enforceRecordCount(values.length, options.maxRecords);
  values.forEach((value, index) => collector.ingest(value, index));
  return resultFrom(collector);
}

export function ingestSourceRecordText(
  text: string,
  options: IngestionTextOptions,
): IngestionBatchResult {
  validateLimit(options.maxInputBytes, "maxInputBytes");
  const inputBytes = Buffer.byteLength(text);
  if (
    options.maxInputBytes !== undefined &&
    inputBytes > options.maxInputBytes
  ) {
    limitExceeded("maxInputBytes", options.maxInputBytes, inputBytes);
  }
  const collector = createCollector(options);

  if (options.format === "json") {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch (error) {
      collector.reject(
        serializationError("Source record text is not valid JSON.", error),
        0,
      );
      return resultFrom(collector);
    }

    const values = Array.isArray(value) ? value : [value];
    enforceRecordCount(values.length, options.maxRecords);
    values.forEach((item, index) => collector.ingest(item, index));
    return resultFrom(collector);
  }

  const lines = text.split(/\r?\n/);
  enforceRecordCount(
    lines.filter((line) => line.trim().length > 0).length,
    options.maxRecords,
  );
  let index = 0;
  for (const [lineIndex, line] of lines.entries()) {
    if (line.trim().length === 0) {
      continue;
    }
    const lineBytes = Buffer.byteLength(line);
    try {
      collector.ingest(
        JSON.parse(line),
        index,
        lineIndex + 1,
        lineBytes,
      );
    } catch (error) {
      if (error instanceof SyntaxError) {
        collector.reject(
          serializationError("Source record JSONL line is not valid JSON.", error),
          index,
          lineIndex + 1,
        );
      } else {
        throw error;
      }
    }
    index += 1;
  }

  return resultFrom(collector);
}
