export const WORKFLOW_CLI_CONTRACT = Object.freeze({
  commands: Object.freeze(["run"] as const),
  formats: Object.freeze(["json", "jsonl"] as const),
  policyIds: Object.freeze(["neutral-evidence-v1"] as const),
  defaults: Object.freeze({
    maxInputBytes: 10_485_760,
    maxRecords: 10_000,
    maxRecordBytes: 1_048_576,
    maxRequestBytes: 1_048_576,
  }),
  runtime: Object.freeze({
    stability: "supported-experimental",
    node: ">=24.14.0",
    requiredCapabilities: Object.freeze([
      "DatabaseSync.prototype.enableDefensive",
    ] as const),
  }),
} as const);

export type WorkflowCliFormat =
  typeof WORKFLOW_CLI_CONTRACT.formats[number];

export type WorkflowCliStage =
  | "arguments"
  | "request"
  | "input"
  | "preparation"
  | "persistence"
  | "publication"
  | "projection"
  | "output";
