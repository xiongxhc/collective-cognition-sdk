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
  ingest(value: unknown, index: number, line?: number): void;
  reject(error: DomainError, index: number, line?: number): void;
}

type JsonMeasureFrame =
  | { readonly kind: "value"; readonly value: unknown }
  | { readonly kind: "leave"; readonly value: object };

class UnsafeJsonStructure extends Error {}

class JsonStructureLimitExceeded extends Error {
  readonly actual: number;

  constructor(actual: number) {
    super();
    this.actual = actual;
  }
}

function contentKey(record: SourceRecord): string {
  return canonicalizeJson({
    mediaType: record.mediaType,
    content: record.content,
  });
}

function serializationError(message: string): DomainError {
  return new DomainError(DomainErrorCode.SERIALIZATION_ERROR, message);
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

function jsonStringBytes(
  value: string,
  stopAfter?: number,
): number {
  let bytes = 2;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (
      codeUnit === 0x22 ||
      codeUnit === 0x5c ||
      codeUnit === 0x08 ||
      codeUnit === 0x09 ||
      codeUnit === 0x0a ||
      codeUnit === 0x0c ||
      codeUnit === 0x0d
    ) {
      bytes += 2;
    } else if (codeUnit <= 0x1f) {
      bytes += 6;
    } else if (codeUnit <= 0x7f) {
      bytes += 1;
    } else if (codeUnit <= 0x7ff) {
      bytes += 2;
    } else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 6;
      }
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      bytes += 6;
    } else {
      bytes += 3;
    }
    if (stopAfter !== undefined && bytes > stopAfter) {
      return bytes;
    }
  }
  return bytes;
}

function structuralJsonBytes(
  value: unknown,
  maximum?: number,
): number {
  let bytes = 0;
  const ancestors = new Set<object>();
  const frames: JsonMeasureFrame[] = [{ kind: "value", value }];

  function add(amount: number): void {
    bytes += amount;
    if (maximum !== undefined && bytes > maximum) {
      throw new JsonStructureLimitExceeded(bytes);
    }
  }

  try {
    while (frames.length > 0) {
      const frame = frames.pop();
      if (frame === undefined) {
        break;
      }
      if (frame.kind === "leave") {
        ancestors.delete(frame.value);
        continue;
      }

      const current = frame.value;
      if (current === null) {
        add(4);
      } else if (typeof current === "boolean") {
        add(current ? 4 : 5);
      } else if (typeof current === "number") {
        if (!Number.isFinite(current)) {
          throw new UnsafeJsonStructure();
        }
        add(Buffer.byteLength(String(current)));
      } else if (typeof current === "string") {
        add(jsonStringBytes(
          current,
          maximum === undefined ? undefined : maximum - bytes,
        ));
      } else if (typeof current === "object") {
        if (ancestors.has(current)) {
          throw new UnsafeJsonStructure();
        }
        const prototype = Object.getPrototypeOf(current);
        const symbols = Object.getOwnPropertySymbols(current);
        if (symbols.length > 0) {
          throw new UnsafeJsonStructure();
        }
        ancestors.add(current);
        frames.push({ kind: "leave", value: current });

        if (Array.isArray(current)) {
          if (prototype !== Array.prototype) {
            throw new UnsafeJsonStructure();
          }
          const lengthDescriptor = Object.getOwnPropertyDescriptor(
            current,
            "length",
          );
          if (
            lengthDescriptor === undefined ||
            !("value" in lengthDescriptor) ||
            typeof lengthDescriptor.value !== "number"
          ) {
            throw new UnsafeJsonStructure();
          }
          const length = lengthDescriptor.value;
          const names = Object.getOwnPropertyNames(current);
          if (
            names.length !== length + 1 ||
            !names.includes("length")
          ) {
            throw new UnsafeJsonStructure();
          }
          add(2 + Math.max(0, length - 1));
          for (let index = length - 1; index >= 0; index -= 1) {
            const descriptor = Object.getOwnPropertyDescriptor(
              current,
              String(index),
            );
            if (
              descriptor === undefined ||
              !descriptor.enumerable ||
              !("value" in descriptor)
            ) {
              throw new UnsafeJsonStructure();
            }
            frames.push({ kind: "value", value: descriptor.value });
          }
        } else {
          if (prototype !== Object.prototype && prototype !== null) {
            throw new UnsafeJsonStructure();
          }
          const names = Object.getOwnPropertyNames(current);
          add(2 + Math.max(0, names.length - 1));
          const values: unknown[] = [];
          for (const name of names) {
            const descriptor = Object.getOwnPropertyDescriptor(current, name);
            if (
              descriptor === undefined ||
              !descriptor.enumerable ||
              !("value" in descriptor)
            ) {
              throw new UnsafeJsonStructure();
            }
            add(jsonStringBytes(
              name,
              maximum === undefined ? undefined : maximum - bytes,
            ));
            add(1);
            values.push(descriptor.value);
          }
          for (let index = values.length - 1; index >= 0; index -= 1) {
            frames.push({ kind: "value", value: values[index] });
          }
        }
      } else {
        throw new UnsafeJsonStructure();
      }
    }
    return bytes;
  } catch (error) {
    if (error instanceof JsonStructureLimitExceeded) {
      limitExceeded("maxRecordBytes", maximum as number, error.actual);
    }
    throw new DomainError(
      DomainErrorCode.INVALID_SOURCE_RECORD,
      "Source record must contain only plain JSON data.",
    );
  }
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
  ): void {
    let record: SourceRecord;
    try {
      structuralJsonBytes(value, options.maxRecordBytes);
      record = normalizeSourceRecord(value);
      structuralJsonBytes(record, options.maxRecordBytes);
    } catch (error) {
      if (error instanceof DomainError) {
        if (error.code === DomainErrorCode.INGESTION_LIMIT_EXCEEDED) {
          throw error;
        }
        reject(error, index, line);
        return;
      }
      throw error;
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
        serializationError("Source record text is not valid JSON."),
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
    if (
      options.maxRecordBytes !== undefined &&
      lineBytes > options.maxRecordBytes
    ) {
      limitExceeded(
        "maxRecordBytes",
        options.maxRecordBytes,
        lineBytes,
      );
    }
    try {
      collector.ingest(
        JSON.parse(line),
        index,
        lineIndex + 1,
      );
    } catch (error) {
      if (error instanceof SyntaxError) {
        collector.reject(
          serializationError("Source record JSONL line is not valid JSON."),
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
