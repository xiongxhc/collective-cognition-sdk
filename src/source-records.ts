import { DomainError, DomainErrorCode } from "./errors.ts";
import {
  JsonTextProfileError,
  parseProfiledJson,
} from "./json-text.ts";
import {
  freezeJsonValue,
  isJsonObject,
  isJsonValue,
} from "./types.ts";
import type { JsonObject, JsonValue } from "./types.ts";

export const SOURCE_RECORD_SCHEMA_VERSION = "0.1.0";
export const SOURCE_RECORD_MAX_JSON_DEPTH = 256;

export interface SourceRecordSource {
  readonly system: string;
  readonly instance?: string;
}

export interface SourceRecord {
  readonly schemaVersion: typeof SOURCE_RECORD_SCHEMA_VERSION;
  readonly id: string;
  readonly source: SourceRecordSource;
  readonly sourceId: string;
  readonly revisionId: string;
  readonly capturedAt: string;
  readonly observedAt?: string;
  readonly mediaType: string;
  readonly content: JsonValue;
  readonly contentHash?: string;
  readonly actorId?: string;
  readonly context?: JsonObject;
  readonly extensions?: JsonObject;
}

export interface CreateSourceRecordInput {
  readonly id: string;
  readonly source: SourceRecordSource;
  readonly sourceId: string;
  readonly revisionId: string;
  readonly capturedAt: string;
  readonly observedAt?: string;
  readonly mediaType: string;
  readonly content: JsonValue;
  readonly contentHash?: string;
  readonly actorId?: string;
  readonly context?: JsonObject;
  readonly extensions?: JsonObject;
}

const isoTimestampPattern =
  /^(?:(?:[0-9]{2}(?:0[48]|[2468][048]|[13579][26])|(?:[02468][048]|[13579][26])00)-02-29|[0-9]{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12][0-9]|3[01])|(?:0[469]|11)-(?:0[1-9]|[12][0-9]|30)|02-(?:0[1-9]|1[0-9]|2[0-8])))T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\.[0-9]{1,9})?(?:Z|[+-](?:[01][0-9]|2[0-3]):[0-5][0-9])$/;

const mediaTypePattern =
  /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+\/[!#$%&'*+\-.^_`|~0-9A-Za-z]+(?:\s*;\s*[!#$%&'*+\-.^_`|~0-9A-Za-z]+=(?:[!#$%&'*+\-.^_`|~0-9A-Za-z]+|"(?:[^"\\\r\n]|\\.)*"))*$/;

const sourceFields = new Set(["system", "instance"]);
const sourceRecordFields = new Set([
  "schemaVersion",
  "id",
  "source",
  "sourceId",
  "revisionId",
  "capturedAt",
  "observedAt",
  "mediaType",
  "content",
  "contentHash",
  "actorId",
  "context",
  "extensions",
]);
const sourceRecordInputFields = new Set(
  [...sourceRecordFields].filter((field) => field !== "schemaVersion"),
);
const interpretationFields = new Set([
  "polarity",
  "confidence",
  "authority",
]);
const namespacedExtensionKeyPattern =
  /^[^:.\s]+(?:[:.][^:.\s]+)+$/;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && isoTimestampPattern.test(value);
}

function invalidSourceRecord(
  message: string,
  details: JsonObject = {},
): never {
  throw new DomainError(DomainErrorCode.INVALID_SOURCE_RECORD, message, details);
}

function sourceRecordDepthIsAllowed(value: unknown): boolean {
  const visitedDepths = new WeakMap<object, number>();
  const pending: Array<{ readonly value: unknown; readonly depth: number }> = [
    { value, depth: 1 },
  ];

  try {
    while (pending.length > 0) {
      const current = pending.pop();
      if (
        current === undefined ||
        typeof current.value !== "object" ||
        current.value === null
      ) {
        continue;
      }
      if (current.depth > SOURCE_RECORD_MAX_JSON_DEPTH) {
        return false;
      }

      const previousDepth = visitedDepths.get(current.value);
      if (previousDepth !== undefined && previousDepth >= current.depth) {
        continue;
      }
      visitedDepths.set(current.value, current.depth);

      for (const key of Reflect.ownKeys(current.value)) {
        const descriptor = Reflect.getOwnPropertyDescriptor(
          current.value,
          key,
        );
        if (descriptor !== undefined && "value" in descriptor) {
          pending.push({
            value: descriptor.value,
            depth: current.depth + 1,
          });
        }
      }
    }
    return true;
  } catch {
    return false;
  }
}

function validateSourceRecordDepth(value: unknown): void {
  if (!sourceRecordDepthIsAllowed(value)) {
    invalidSourceRecord(
      "Source record exceeds the maximum JSON nesting depth.",
      { maximumDepth: SOURCE_RECORD_MAX_JSON_DEPTH },
    );
  }
}

function validateSource(value: unknown): asserts value is SourceRecordSource {
  if (!isJsonObject(value)) {
    invalidSourceRecord("Source system must be a non-empty string.", {
      field: "source.system",
    });
  }
  for (const field of Object.keys(value)) {
    if (!sourceFields.has(field)) {
      invalidSourceRecord(`Source field ${field} is not supported.`, {
        field: `source.${field}`,
      });
    }
  }
  if (!isNonEmptyString(value.system)) {
    invalidSourceRecord("Source system must be a non-empty string.", {
      field: "source.system",
    });
  }
  if (value.instance !== undefined && !isNonEmptyString(value.instance)) {
    invalidSourceRecord("Source instance must be a non-empty string.", {
      field: "source.instance",
    });
  }
}

function validateSourceRecordFields(
  value: JsonObject,
  includeSchemaVersion: boolean,
): void {
  const allowedFields = includeSchemaVersion
    ? sourceRecordFields
    : sourceRecordInputFields;
  for (const field of Object.keys(value)) {
    if (!allowedFields.has(field)) {
      invalidSourceRecord(`Source record field ${field} is not supported.`, {
        field,
      });
    }
  }
  if (
    includeSchemaVersion &&
    value.schemaVersion !== SOURCE_RECORD_SCHEMA_VERSION
  ) {
    invalidSourceRecord("Source record schema version is unsupported.", {
      field: "schemaVersion",
    });
  }
  for (const field of ["id", "sourceId", "revisionId"] as const) {
    if (!isNonEmptyString(value[field])) {
      invalidSourceRecord(
        `Source record ${field} must be a non-empty string.`,
        { field },
      );
    }
  }
  validateSource(value.source);

  if (!isIsoTimestamp(value.capturedAt)) {
    invalidSourceRecord("Source record capturedAt must be an ISO timestamp.", {
      field: "capturedAt",
    });
  }
  if (value.observedAt !== undefined && !isIsoTimestamp(value.observedAt)) {
    invalidSourceRecord("Source record observedAt must be an ISO timestamp.", {
      field: "observedAt",
    });
  }
  if (
    !isNonEmptyString(value.mediaType) ||
    !mediaTypePattern.test(value.mediaType)
  ) {
    invalidSourceRecord("Source record mediaType must be a media type.", {
      field: "mediaType",
    });
  }
  if (!isJsonValue(value.content)) {
    invalidSourceRecord("Source record content must be JSON-compatible.", {
      field: "content",
    });
  }
  for (const field of ["contentHash", "actorId"] as const) {
    if (value[field] !== undefined && !isNonEmptyString(value[field])) {
      invalidSourceRecord(
        `Source record ${field} must be a non-empty string.`,
        { field },
      );
    }
  }
  const context = value.context;
  if (context !== undefined) {
    if (!isJsonObject(context)) {
      invalidSourceRecord(
        "Source record context must be a JSON object.",
        { field: "context" },
      );
    }
    for (const field of Object.keys(context)) {
      if (interpretationFields.has(field)) {
        invalidSourceRecord(
          `Source record context field ${field} is not supported.`,
          { field: `context.${field}` },
        );
      }
    }
  }
  const extensions = value.extensions;
  if (extensions !== undefined) {
    if (!isJsonObject(extensions)) {
      invalidSourceRecord(
        "Source record extensions must be a JSON object.",
        { field: "extensions" },
      );
    }
    for (const field of Object.keys(extensions)) {
      if (!namespacedExtensionKeyPattern.test(field)) {
        invalidSourceRecord(
          `Source record extension key ${field} must be namespaced.`,
          { field: `extensions.${field}` },
        );
      }
    }
  }
}

function freezeSourceRecord(record: SourceRecord): SourceRecord {
  return freezeJsonValue(
    structuredClone(record) as unknown as JsonValue,
  ) as unknown as SourceRecord;
}

export function createSourceRecord(
  input: CreateSourceRecordInput,
): SourceRecord {
  validateSourceRecordDepth(input);
  if (!isJsonObject(input)) {
    invalidSourceRecord("Source record input must be an object.");
  }
  validateSourceRecordFields(input, false);

  return freezeSourceRecord({
    schemaVersion: SOURCE_RECORD_SCHEMA_VERSION,
    id: input.id,
    source: input.source,
    sourceId: input.sourceId,
    revisionId: input.revisionId,
    capturedAt: input.capturedAt,
    ...(input.observedAt === undefined ? {} : { observedAt: input.observedAt }),
    mediaType: input.mediaType,
    content: input.content,
    ...(input.contentHash === undefined
      ? {}
      : { contentHash: input.contentHash }),
    ...(input.actorId === undefined ? {} : { actorId: input.actorId }),
    ...(input.context === undefined ? {} : { context: input.context }),
    ...(input.extensions === undefined ? {} : { extensions: input.extensions }),
  });
}

export function validateSourceRecord(value: unknown): asserts value is SourceRecord {
  validateSourceRecordDepth(value);
  if (!isJsonObject(value)) {
    invalidSourceRecord("Source record must be an object.");
  }
  validateSourceRecordFields(value, true);
}

export function normalizeSourceRecord(value: unknown): SourceRecord {
  validateSourceRecord(value);
  return freezeSourceRecord(value);
}

export function canonicalizeJson(value: JsonValue): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeJson).join(",")}]`;
  }
  const object = value as JsonObject;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalizeJson(object[key])}`)
    .join(",")}}`;
}

export function serializeSourceRecord(record: SourceRecord): string {
  validateSourceRecord(record);
  try {
    return JSON.stringify(record);
  } catch {
    throw new DomainError(
      DomainErrorCode.SERIALIZATION_ERROR,
      "Source record could not be serialized.",
    );
  }
}

export function deserializeSourceRecord(json: string): SourceRecord {
  let value: unknown;
  try {
    value = parseProfiledJson(json);
  } catch (error) {
    if (error instanceof JsonTextProfileError) {
      throw new DomainError(
        DomainErrorCode.INVALID_SOURCE_RECORD,
        "Serialized source record violates the JSON interoperability profile.",
      );
    }
    throw new DomainError(
      DomainErrorCode.SERIALIZATION_ERROR,
      "Serialized source record is not valid JSON.",
    );
  }

  return normalizeSourceRecord(value);
}

export function sourceRevisionKey(record: SourceRecord): string {
  validateSourceRecord(record);
  return canonicalizeJson([
    record.source.system,
    record.source.instance ?? null,
    record.sourceId,
    record.revisionId,
  ]);
}
