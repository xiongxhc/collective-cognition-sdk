import { ingestSourceRecords } from "./ingestion.ts";
import { DomainError, DomainErrorCode } from "./errors.ts";
import { createObject } from "./objects.ts";
import { canonicalizeJson, sourceRevisionKey } from "./source-records.ts";
import type { IngestionBatchResult, IngestionOptions } from "./ingestion.ts";
import type { SourceRecord } from "./source-records.ts";
import type {
  Attribution,
  CognitiveObject,
  EvidenceData,
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
  map(record: SourceRecord): EvidencePromotionMapping;
}

export interface EvidencePromotionRequest {
  readonly record: SourceRecord;
  readonly hypothesisId: string;
  readonly contextId: string;
  readonly promotedAt: string;
  readonly attribution: Attribution;
}

export type EvidencePromotionContext = Omit<EvidencePromotionRequest, "record">;

export interface IngestAndPromoteEvidenceResult {
  readonly ingestion: IngestionBatchResult;
  readonly promotions: readonly CognitiveObject<"evidence">[];
}

function invalidMapping(field: string, message: string): never {
  throw new DomainError(DomainErrorCode.INVALID_OBJECT, message, { field });
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
  request: EvidencePromotionRequest,
  policy: EvidencePromotionPolicy,
): string {
  return [
    "evidence:source-record",
    encodeURIComponent(request.record.id),
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

function sourceProvenance(record: SourceRecord) {
  return [
    {
      source: "collective-cognition:source-record",
      sourceId: record.id,
      capturedAt: record.capturedAt,
      ...(record.contentHash === undefined
        ? {}
        : { contentHash: record.contentHash }),
    },
  ];
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
  map(record) {
    return {
      title: `Source record ${record.id}`,
      statement: statementFor(record),
      evidenceKind: "source-record",
      polarity: "neutral",
    };
  },
};

export function promoteSourceRecordToEvidence(
  request: EvidencePromotionRequest,
  policy: EvidencePromotionPolicy,
): CognitiveObject<"evidence"> {
  const mapping = policy.map(request.record);
  validateMapping(mapping);

  return createObject({
    id: evidenceId(request, policy),
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
    provenance: sourceProvenance(request.record),
    contextId: request.contextId,
    relationships: [
      { type: "relates-to-hypothesis", targetId: request.hypothesisId },
    ],
    extensions: {
      "collective-cognition:promotion": {
        sourceRevisionKey: sourceRevisionKey(request.record),
        policy: { id: policy.id, version: policy.version },
      },
    },
  });
}

export function ingestAndPromoteEvidence(
  values: readonly unknown[],
  request: EvidencePromotionContext,
  policy: EvidencePromotionPolicy,
  options: IngestionOptions = {},
): IngestAndPromoteEvidenceResult {
  const ingestion = ingestSourceRecords(values, options);
  const promotions = ingestion.acceptedRecords.map((record) =>
    promoteSourceRecordToEvidence({ ...request, record }, policy)
  );

  return { ingestion, promotions };
}
