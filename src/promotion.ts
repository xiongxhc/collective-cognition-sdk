import { ingestSourceRecords } from "./ingestion.ts";
import { DomainError, DomainErrorCode } from "./errors.ts";
import { createObject } from "./objects.ts";
import {
  canonicalizeJson,
  normalizeSourceRecord,
  sourceRevisionKey,
} from "./source-records.ts";
import type { IngestionBatchResult, IngestionOptions } from "./ingestion.ts";
import type { SourceRecord } from "./source-records.ts";
import type {
  Attribution,
  CognitiveObject,
  EvidenceData,
  JsonObject,
} from "./types.ts";
import { isJsonObject } from "./types.ts";

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

function invalidMapping(field: string, message: string): never {
  throw new DomainError(DomainErrorCode.INVALID_OBJECT, message, { field });
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validatePolicy(policy: EvidencePromotionPolicy): void {
  if (!isNonEmptyString(policy?.id)) {
    invalidMapping(
      "policy.id",
      "Promotion policy id must be a non-empty string.",
    );
  }
  if (!isNonEmptyString(policy.version)) {
    invalidMapping(
      "policy.version",
      "Promotion policy version must be a non-empty string.",
    );
  }
  if (typeof policy.map !== "function") {
    invalidMapping("policy.map", "Promotion policy map must be a function.");
  }
}

function normalizeRecords(
  records: readonly SourceRecord[],
): readonly SourceRecord[] {
  if (!Array.isArray(records) || records.length === 0) {
    invalidMapping("records", "At least one source record is required.");
  }
  return Object.freeze(records.map(normalizeSourceRecord));
}

function validateMapping(value: unknown): asserts value is EvidencePromotionMapping {
  if (!isJsonObject(value)) {
    invalidMapping("mapping", "Policy mapping must be a JSON object.");
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
  records: readonly SourceRecord[],
  request: EvidencePromotionRequest,
  policy: EvidencePromotionPolicy,
): string {
  return [
    "evidence:source-records",
    encodeURIComponent(
      canonicalizeJson(records.map((record) => sourceRevisionKey(record))),
    ),
    "context",
    encodeURIComponent(request.contextId),
    "hypothesis",
    encodeURIComponent(request.hypothesisId),
    "policy",
    encodeURIComponent(policy.id),
    "version",
    encodeURIComponent(policy.version),
  ].join(":");
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
  validatePolicy(policy);
  const records = normalizeRecords(request.records);
  if (!isNonEmptyString(request.rationale)) {
    invalidMapping(
      "rationale",
      "Promotion rationale must be a non-empty string.",
    );
  }
  const mapping = policy.map(records);
  validateMapping(mapping);

  return createObject({
    id: evidenceId(records, request, policy),
    type: "evidence",
    version: 1,
    state: "collected",
    title: mapping.title,
    data: {
      statement: mapping.statement,
      evidenceKind: mapping.evidenceKind,
      polarity: mapping.polarity,
    },
    createdAt: request.promotedAt,
    updatedAt: request.promotedAt,
    attribution: request.attribution,
    provenance: sourceProvenance(records),
    contextId: request.contextId,
    relationships: [
      { type: "relates-to-hypothesis", targetId: request.hypothesisId },
    ],
    extensions: {
      "collective-cognition:promotion": {
        sourceRevisionKeys: records.map(sourceRevisionKey),
        policy: { id: policy.id, version: policy.version },
        rationale: request.rationale,
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
    message: error instanceof Error ? error.message : String(error),
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
