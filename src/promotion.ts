import { createHash } from "node:crypto";

import { ingestSourceRecords } from "./ingestion.ts";
import { DomainError, DomainErrorCode } from "./errors.ts";
import { createObject } from "./objects.ts";
import {
  canonicalizeJson,
  sourceRevisionKey,
} from "./source-records.ts";
import type { IngestionBatchResult, IngestionOptions } from "./ingestion.ts";
import type { SourceRecord } from "./source-records.ts";
import type {
  Attribution,
  CognitiveObject,
  EvidenceData,
  JsonObject,
  JsonValue,
} from "./types.ts";
import { freezeJsonValue, isJsonObject } from "./types.ts";

export interface EvidencePromotionMapping {
  readonly title: string;
  readonly statement: string;
  readonly evidenceKind: string;
  readonly polarity: NonNullable<EvidenceData["polarity"]>;
}

export interface EvidencePromotionPolicy {
  readonly id: string;
  readonly version: string;
  map(records: readonly SourceRecord[]): EvidencePromotionMapping;
}

export interface EvidencePromotionRequest {
  readonly records: readonly SourceRecord[];
  readonly hypothesisId: string;
  readonly contextId: string;
  readonly rationale: string;
  readonly promotedAt: string;
  readonly attribution: Attribution;
}

export type EvidencePromotionContext = Omit<EvidencePromotionRequest, "records">;

export interface PromotionFailure {
  readonly code: DomainErrorCode;
  readonly message: string;
  readonly details: JsonObject;
}

export type EvidencePromotionResult =
  | {
    readonly status: "succeeded";
    readonly evidence: CognitiveObject<"evidence">;
  }
  | {
    readonly status: "failed";
    readonly error: PromotionFailure;
  };

export interface IngestAndPromoteEvidenceResult {
  readonly ingestion: IngestionBatchResult;
  readonly promotion: EvidencePromotionResult;
}

interface PromotionPolicySnapshot {
  readonly id: string;
  readonly version: string;
}

interface PromotionRequestSnapshot extends EvidencePromotionRequest {
  readonly records: readonly SourceRecord[];
}

interface ValidatedPolicy {
  readonly identity: PromotionPolicySnapshot;
  readonly receiver: EvidencePromotionPolicy;
}

const promotionRequestFields = new Set([
  "records",
  "hypothesisId",
  "contextId",
  "rationale",
  "promotedAt",
  "attribution",
]);
const attributionFields = new Set([
  "initiatorId",
  "executorId",
  "accountableId",
]);
const mappingFields = new Set([
  "title",
  "statement",
  "evidenceKind",
  "polarity",
]);
const isoTimestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

function invalidMapping(field: string, message: string): never {
  throw new DomainError(DomainErrorCode.INVALID_OBJECT, message, { field });
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoTimestamp(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !isoTimestampPattern.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    return false;
  }
  const datePart = value.slice(0, 10);
  const calendarDate = new Date(`${datePart}T00:00:00.000Z`);
  return (
    !Number.isNaN(calendarDate.getTime()) &&
    calendarDate.toISOString().slice(0, 10) === datePart
  );
}

function isPromotionMapper(
  value: unknown,
): value is EvidencePromotionPolicy["map"] {
  return typeof value === "function";
}

function promotionPolicyFailed(): never {
  throw new DomainError(
    DomainErrorCode.PROMOTION_FAILED,
    "Promotion policy failed.",
  );
}

function validatePolicy(policy: EvidencePromotionPolicy): ValidatedPolicy {
  if (typeof policy !== "object" || policy === null) {
    invalidMapping("policy", "Promotion policy must be an object.");
  }
  let id: unknown;
  let version: unknown;
  let map: unknown;
  try {
    id = policy.id;
    version = policy.version;
    map = policy.map;
  } catch {
    promotionPolicyFailed();
  }
  if (!isNonEmptyString(id)) {
    invalidMapping(
      "policy.id",
      "Promotion policy id must be a non-empty string.",
    );
  }
  if (!isNonEmptyString(version)) {
    invalidMapping(
      "policy.version",
      "Promotion policy version must be a non-empty string.",
    );
  }
  if (!isPromotionMapper(map)) {
    invalidMapping("policy.map", "Promotion policy map must be a function.");
  }
  const identity = Object.freeze({ id, version });
  return Object.freeze({
    identity,
    receiver: Object.freeze({ id, version, map }),
  });
}

function validateAttribution(value: unknown): asserts value is Attribution {
  if (!isJsonObject(value)) {
    invalidMapping("attribution", "Promotion attribution must be an object.");
  }
  for (const field of Object.keys(value)) {
    if (!attributionFields.has(field)) {
      invalidMapping(
        `attribution.${field}`,
        `Promotion attribution field ${field} is not supported.`,
      );
    }
  }
  for (const field of attributionFields) {
    if (!isNonEmptyString(value[field])) {
      invalidMapping(
        `attribution.${field}`,
        `Promotion attribution ${field} must be a non-empty string.`,
      );
    }
  }
}

function snapshotRequest(
  request: EvidencePromotionRequest,
): PromotionRequestSnapshot {
  if (!isJsonObject(request)) {
    invalidMapping("request", "Promotion request must be a JSON object.");
  }
  for (const field of Object.keys(request)) {
    if (!promotionRequestFields.has(field)) {
      invalidMapping(
        field,
        `Promotion request field ${field} is not supported.`,
      );
    }
  }
  if (!Array.isArray(request.records) || request.records.length === 0) {
    invalidMapping("records", "At least one source record is required.");
  }
  for (const field of ["hypothesisId", "contextId", "rationale"] as const) {
    if (!isNonEmptyString(request[field])) {
      invalidMapping(
        field,
        `Promotion ${field} must be a non-empty string.`,
      );
    }
  }
  if (!isIsoTimestamp(request.promotedAt)) {
    invalidMapping(
      "promotedAt",
      "Promotion promotedAt must be an ISO timestamp.",
    );
  }
  validateAttribution(request.attribution);

  const ingestion = ingestSourceRecords(request.records, {
    mode: "fail-fast",
  });
  const snapshot = structuredClone({
    records: ingestion.acceptedRecords,
    hypothesisId: request.hypothesisId,
    contextId: request.contextId,
    rationale: request.rationale,
    promotedAt: request.promotedAt,
    attribution: request.attribution,
  }) as unknown as JsonValue;
  return freezeJsonValue(snapshot) as unknown as PromotionRequestSnapshot;
}

function validateMapping(value: unknown): asserts value is EvidencePromotionMapping {
  if (!isJsonObject(value)) {
    invalidMapping("mapping", "Policy mapping must be a JSON object.");
  }
  for (const field of Object.keys(value)) {
    if (!mappingFields.has(field)) {
      invalidMapping(
        `mapping.${field}`,
        `Policy mapping field ${field} is not supported.`,
      );
    }
  }

  for (const field of ["title", "statement", "evidenceKind"] as const) {
    if (typeof value[field] !== "string" || value[field].trim().length === 0) {
      invalidMapping(field, `Policy mapping ${field} must be a non-empty string.`);
    }
  }

  if (
    value.polarity !== "supports" &&
    value.polarity !== "challenges" &&
    value.polarity !== "neutral"
  ) {
    invalidMapping(
      "polarity",
      "Policy mapping polarity must be supports, challenges, or neutral.",
    );
  }
}

function evidenceId(
  request: PromotionRequestSnapshot,
  policy: PromotionPolicySnapshot,
  mapping: EvidencePromotionMapping,
): string {
  const payload = {
    records: request.records,
    contextId: request.contextId,
    hypothesisId: request.hypothesisId,
    policy,
    rationale: request.rationale,
    attribution: request.attribution,
    promotedAt: request.promotedAt,
    mapping,
  } as unknown as JsonValue;
  const hash = createHash("sha256")
    .update(canonicalizeJson(payload))
    .digest("hex");
  return `evidence:promotion:sha256:${hash}`;
}

function sourceProvenance(records: readonly SourceRecord[]) {
  return records.map((record) => ({
    source: "collective-cognition:source-record",
    sourceId: record.id,
    capturedAt: record.capturedAt,
    ...(record.contentHash === undefined
      ? {}
      : { contentHash: record.contentHash }),
  }));
}

function statementFor(record: SourceRecord): string {
  if (typeof record.content === "string") {
    return record.content;
  }
  if (
    isJsonObject(record.content) &&
    typeof record.content.summary === "string"
  ) {
    return record.content.summary;
  }
  return canonicalizeJson(record.content);
}

export const neutralEvidencePolicyV1: EvidencePromotionPolicy = {
  id: "neutral-evidence",
  version: "1",
  map(records) {
    return {
      title: records.length === 1
        ? `Source record ${records[0]?.id}`
        : `Source records (${records.length})`,
      statement: records.map(statementFor).join("\n\n"),
      evidenceKind: "source-record",
      polarity: "neutral",
    };
  },
};

export function promoteSourceRecordsToEvidence(
  request: EvidencePromotionRequest,
  policy: EvidencePromotionPolicy,
): CognitiveObject<"evidence"> {
  const snapshot = snapshotRequest(request);
  const validatedPolicy = validatePolicy(policy);
  let mappingValue: unknown;
  try {
    mappingValue = validatedPolicy.receiver.map(snapshot.records);
  } catch {
    promotionPolicyFailed();
  }
  validateMapping(mappingValue);
  const mapping = freezeJsonValue({
    title: mappingValue.title,
    statement: mappingValue.statement,
    evidenceKind: mappingValue.evidenceKind,
    polarity: mappingValue.polarity,
  }) as EvidencePromotionMapping;

  return createObject({
    id: evidenceId(snapshot, validatedPolicy.identity, mapping),
    type: "evidence",
    version: 1,
    state: "collected",
    title: mapping.title,
    data: {
      statement: mapping.statement,
      evidenceKind: mapping.evidenceKind,
      polarity: mapping.polarity,
    },
    createdAt: snapshot.promotedAt,
    updatedAt: snapshot.promotedAt,
    attribution: snapshot.attribution,
    provenance: sourceProvenance(snapshot.records),
    contextId: snapshot.contextId,
    relationships: [
      { type: "relates-to-hypothesis", targetId: snapshot.hypothesisId },
    ],
    extensions: {
      "collective-cognition:promotion": {
        sourceRevisionKeys: snapshot.records.map(sourceRevisionKey),
        policy: {
          id: validatedPolicy.identity.id,
          version: validatedPolicy.identity.version,
        },
        rationale: snapshot.rationale,
      },
    },
  });
}

function promotionFailure(error: unknown): PromotionFailure {
  if (error instanceof DomainError) {
    return {
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }
  return {
    code: DomainErrorCode.PROMOTION_FAILED,
    message: "Promotion failed.",
    details: {},
  };
}

export function ingestAndPromoteEvidence(
  values: readonly unknown[],
  request: EvidencePromotionContext,
  policy: EvidencePromotionPolicy,
  options?: IngestionOptions,
): IngestAndPromoteEvidenceResult;
export function ingestAndPromoteEvidence(
  ingestion: IngestionBatchResult,
  request: EvidencePromotionContext,
  policy: EvidencePromotionPolicy,
): IngestAndPromoteEvidenceResult;
export function ingestAndPromoteEvidence(
  input: readonly unknown[] | IngestionBatchResult,
  request: EvidencePromotionContext,
  policy: EvidencePromotionPolicy,
  options: IngestionOptions = {},
): IngestAndPromoteEvidenceResult {
  const ingestion = Array.isArray(input)
    ? ingestSourceRecords(input, options)
    : input as IngestionBatchResult;
  try {
    const evidence = promoteSourceRecordsToEvidence(
      { ...request, records: ingestion.acceptedRecords },
      policy,
    );
    return {
      ingestion,
      promotion: { status: "succeeded", evidence },
    };
  } catch (error) {
    return {
      ingestion,
      promotion: { status: "failed", error: promotionFailure(error) },
    };
  }
}
