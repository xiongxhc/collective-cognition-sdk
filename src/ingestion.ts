import { DomainError, DomainErrorCode } from "./errors.ts";
import {
  canonicalizeJson,
  sourceRevisionKey,
  validateSourceRecord,
} from "./source-records.ts";
import type { SourceRecord } from "./source-records.ts";

export type IngestionMode = "collect-all" | "fail-fast";

export interface IngestionOptions {
  readonly mode?: IngestionMode;
  readonly existingRecords?: readonly SourceRecord[];
}

export interface IngestionTextOptions extends IngestionOptions {
  readonly format: "json" | "jsonl";
}

export interface IngestionItemResult {
  readonly index: number;
  readonly line?: number;
  readonly status: "accepted" | "duplicate" | "rejected";
  readonly record?: SourceRecord;
  readonly retainedRecordId?: string;
  readonly error?: DomainError;
}

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
  ingest(value: unknown, index: number, line?: number): void;
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

function createCollector(options: IngestionOptions): IngestionCollector {
  const mode = options.mode ?? "collect-all";
  const retainedRecords = new Map<string, RetainedRecord>();
  const items: IngestionItemResult[] = [];
  const acceptedRecords: SourceRecord[] = [];

  for (const record of options.existingRecords ?? []) {
    validateSourceRecord(record);
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

  function ingest(value: unknown, index: number, line?: number): void {
    try {
      validateSourceRecord(value);
      const record = value;
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
    } catch (error) {
      if (error instanceof DomainError) {
        reject(error, index, line);
        return;
      }
      throw error;
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
  values.forEach((value, index) => collector.ingest(value, index));
  return resultFrom(collector);
}

export function ingestSourceRecordText(
  text: string,
  options: IngestionTextOptions,
): IngestionBatchResult {
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
    values.forEach((item, index) => collector.ingest(item, index));
    return resultFrom(collector);
  }

  let index = 0;
  for (const [lineIndex, line] of text.split(/\r?\n/).entries()) {
    if (line.trim().length === 0) {
      continue;
    }
    try {
      collector.ingest(JSON.parse(line), index, lineIndex + 1);
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
