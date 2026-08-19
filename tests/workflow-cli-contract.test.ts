import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { WORKFLOW_CLI_CONTRACT } from "../src/workflow-cli-contract.ts";

test("keeps the durable workflow CLI contract closed", () => {
  assert.deepEqual(WORKFLOW_CLI_CONTRACT, {
    commands: ["run"],
    formats: ["json", "jsonl"],
    policyIds: ["neutral-evidence-v1"],
    defaults: {
      maxInputBytes: 10_485_760,
      maxRecords: 10_000,
      maxRecordBytes: 1_048_576,
      maxRequestBytes: 1_048_576,
    },
    runtime: {
      stability: "supported-experimental",
      node: ">=24.14.0",
      requiredCapabilities: [
        "DatabaseSync.prototype.enableDefensive",
      ],
    },
  });
  assert.equal(Object.isFrozen(WORKFLOW_CLI_CONTRACT), true);
  assert.equal(Object.isFrozen(WORKFLOW_CLI_CONTRACT.commands), true);
  assert.equal(Object.isFrozen(WORKFLOW_CLI_CONTRACT.formats), true);
  assert.equal(Object.isFrozen(WORKFLOW_CLI_CONTRACT.policyIds), true);
  assert.equal(Object.isFrozen(WORKFLOW_CLI_CONTRACT.defaults), true);
  assert.equal(Object.isFrozen(WORKFLOW_CLI_CONTRACT.runtime), true);
  assert.equal(
    Object.isFrozen(WORKFLOW_CLI_CONTRACT.runtime.requiredCapabilities),
    true,
  );
});

test("adds only the requested durable workflow executable", () => {
  const packageJson = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { readonly bin: Readonly<Record<string, string>> };

  assert.deepEqual(packageJson.bin, {
    "collective-cognition": "./dist/cli.js",
    "collective-cognition-teammem": "./dist/team-memory-cli.js",
    "collective-cognition-markdown": "./dist/markdown-cognition-cli.js",
    "collective-cognition-workflow": "./dist/workflow-cli.js",
  });
});
