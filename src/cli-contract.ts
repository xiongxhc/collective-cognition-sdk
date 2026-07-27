import type { EvidencePromotionContext } from "./promotion.ts";

export type Command =
  | "validate"
  | "ingest"
  | "promote"
  | "ingest-promote";

export type InputFormat = "json" | "jsonl";

export type CliStage =
  | "arguments"
  | "input"
  | "ingestion"
  | "promotion"
  | "output";

export interface CliLimits {
  readonly maxInputBytes: number;
  readonly maxRecords: number;
  readonly maxRecordBytes: number;
}

export interface CliOptions {
  readonly command: Command;
  readonly input: string;
  readonly format: InputFormat;
  readonly limits: CliLimits;
  readonly promotion?: EvidencePromotionContext;
}

export const CLI_COMMAND_NAMES = [
  "validate",
  "ingest",
  "promote",
  "ingest-promote",
] as const;

export const CLI_INPUT_FORMATS = ["json", "jsonl"] as const;

export const CLI_BASE_OPTION_NAMES = [
  "input",
  "format",
  "max-input-bytes",
  "max-records",
  "max-record-bytes",
] as const;

export const CLI_PROMOTION_OPTION_NAMES = [
  "policy",
  "hypothesis-id",
  "context-id",
  "rationale",
  "initiator-id",
  "executor-id",
  "accountable-id",
  "promoted-at",
] as const;

export const CLI_DEFAULTS = {
  maxInputBytes: 10_485_760,
  maxRecords: 10_000,
  maxRecordBytes: 1_048_576,
} as const;

export const CLI_POLICY_SELECTOR = "neutral-evidence-v1";

const CLI_BASE_REQUIRED_OPTION_NAMES = ["input", "format"] as const;
const CLI_PROMOTION_REQUIRED_OPTION_NAMES = [
  ...CLI_BASE_REQUIRED_OPTION_NAMES,
  ...CLI_PROMOTION_OPTION_NAMES,
] as const;

export const CLI_CONTRACT = {
  formats: CLI_INPUT_FORMATS,
  baseOptionNames: CLI_BASE_OPTION_NAMES,
  promotionOptionNames: CLI_PROMOTION_OPTION_NAMES,
  commands: {
    validate: {
      options: CLI_BASE_OPTION_NAMES,
      requiredOptions: CLI_BASE_REQUIRED_OPTION_NAMES,
    },
    ingest: {
      options: CLI_BASE_OPTION_NAMES,
      requiredOptions: CLI_BASE_REQUIRED_OPTION_NAMES,
    },
    promote: {
      options: [...CLI_BASE_OPTION_NAMES, ...CLI_PROMOTION_OPTION_NAMES],
      requiredOptions: CLI_PROMOTION_REQUIRED_OPTION_NAMES,
    },
    "ingest-promote": {
      options: [...CLI_BASE_OPTION_NAMES, ...CLI_PROMOTION_OPTION_NAMES],
      requiredOptions: CLI_PROMOTION_REQUIRED_OPTION_NAMES,
    },
  },
  defaults: CLI_DEFAULTS,
  outputs: {
    validate: {
      channel: "stdout",
      framing: "jsonl",
      cardinality: "one-per-ingestion-item",
      variants: {
        accepted: {
          requiredFields: ["index", "status", "record"],
          optionalFields: ["line"],
        },
        duplicate: {
          requiredFields: [
            "index",
            "status",
            "record",
            "retainedRecordId",
          ],
          optionalFields: ["line"],
        },
        rejected: {
          requiredFields: ["index", "status", "error"],
          optionalFields: ["line"],
          errorFields: ["code", "message", "details"],
        },
      },
    },
    ingest: {
      channel: "stdout",
      framing: "jsonl",
      cardinality: "one-per-accepted-record",
      requiredFields: [
        "schemaVersion",
        "id",
        "source",
        "sourceId",
        "revisionId",
        "capturedAt",
        "mediaType",
        "content",
      ],
      optionalFields: [
        "observedAt",
        "contentHash",
        "actorId",
        "context",
        "extensions",
      ],
      sourceRequiredFields: ["system"],
      sourceOptionalFields: ["instance"],
    },
    promote: {
      channel: "stdout",
      framing: "jsonl",
      cardinality: "exactly-one-on-success",
      requiredFields: [
        "id",
        "type",
        "version",
        "state",
        "title",
        "data",
        "createdAt",
        "updatedAt",
        "attribution",
        "provenance",
        "contextId",
        "relationships",
        "extensions",
      ],
      objectType: "evidence",
    },
    "ingest-promote": {
      channel: "stdout",
      framing: "jsonl",
      cardinality: "exactly-one-after-ingestion",
      requiredFields: ["ingestion", "promotion"],
      ingestionFields: ["items", "acceptedRecords"],
      promotionVariants: {
        succeeded: ["status", "evidence"],
        failed: ["status", "error"],
      },
      promotionErrorFields: ["code", "message", "details"],
    },
    rejectedItemDiagnostics: {
      channel: "stderr",
      framing: "jsonl",
      cardinality: "one-per-rejected-item",
      requiredFields: ["index", "status", "error"],
      optionalFields: ["line"],
      errorFields: ["code", "message", "details"],
    },
    topLevelDiagnostic: {
      channel: "stderr",
      framing: "jsonl",
      cardinality: "exactly-one-on-failure",
      requiredFields: ["code", "message", "details", "stage"],
    },
    promotionFailureDiagnostic: {
      channel: "stderr",
      framing: "jsonl",
      cardinality: "exactly-one-on-composed-promotion-failure",
      requiredFields: ["code", "message", "details", "stage"],
    },
  },
  policySelectors: {
    [CLI_POLICY_SELECTOR]: {
      sdkExport: "neutralEvidencePolicyV1",
      id: "neutral-evidence",
      version: "1",
    },
  },
  diagnostics: {
    fields: ["code", "message", "details", "stage"],
    stages: ["arguments", "input", "ingestion", "promotion", "output"],
    cliAuthoredCodes: ["CLI_ERROR", "INPUT_READ_ERROR", "INVALID_ARGUMENT"],
    rejectedItemCodes: [
      "INVALID_SOURCE_RECORD",
      "SERIALIZATION_ERROR",
      "SOURCE_REVISION_COLLISION",
    ],
  },
  exitStatuses: {
    success: 0,
    topLevelFailure: 1,
    rejectedItem: 1,
    composedPromotionFailure: 1,
    duplicatesOnly: 0,
  },
} as const;
