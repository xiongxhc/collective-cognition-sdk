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
