import assert from "node:assert/strict";
import test from "node:test";

import { CLI_CONTRACT } from "../src/cli-contract.ts";

test("CLI registry describes the complete current command boundary", () => {
  assert.deepEqual(Object.keys(CLI_CONTRACT.commands), [
    "validate",
    "ingest",
    "promote",
    "ingest-promote",
  ]);
  assert.deepEqual(CLI_CONTRACT.defaults, {
    maxInputBytes: 10_485_760,
    maxRecords: 10_000,
    maxRecordBytes: 1_048_576,
  });
  assert.deepEqual(CLI_CONTRACT.formats, ["json", "jsonl"]);
  assert.deepEqual(CLI_CONTRACT.baseOptionNames, [
    "input",
    "format",
    "max-input-bytes",
    "max-records",
    "max-record-bytes",
  ]);
  assert.deepEqual(CLI_CONTRACT.promotionOptionNames, [
    "policy",
    "hypothesis-id",
    "context-id",
    "rationale",
    "initiator-id",
    "executor-id",
    "accountable-id",
    "promoted-at",
  ]);
  assert.deepEqual(CLI_CONTRACT.outputs, {
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
  });
  assert.deepEqual(CLI_CONTRACT.policySelectors, {
    "neutral-evidence-v1": {
      sdkExport: "neutralEvidencePolicyV1",
      id: "neutral-evidence",
      version: "1",
    },
  });
  assert.deepEqual(CLI_CONTRACT.diagnostics.stages, [
    "arguments",
    "input",
    "ingestion",
    "promotion",
    "output",
  ]);
});
