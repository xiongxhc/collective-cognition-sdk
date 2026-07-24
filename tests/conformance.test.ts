import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DomainErrorCode,
  ingestSourceRecordText,
  ingestSourceRecords,
  validateSourceRecord,
} from "../src/index.ts";
import * as publicApi from "../src/index.ts";
import {
  gitCommitToSourceRecord,
} from "../src/adapters/git-commit.ts";
import {
  teamMemoryEventToSourceRecord,
} from "../src/adapters/team-memory.ts";
import type { GitCommitInput } from "../src/adapters/git-commit.ts";
import type { TeamMemoryEventRow } from "../src/adapters/team-memory.ts";
import type { SourceRecord } from "../src/index.ts";

// @ts-expect-error source-specific connector types must not leak from the root API
import type { TeamMemoryEventRow as RootTeamMemoryEventRow } from "../src/index.ts";
// @ts-expect-error source-specific connector functions must not leak from the root API
import type { teamMemoryEventToSourceRecord as rootTeamMemoryEventToSourceRecord } from "../src/index.ts";
// @ts-expect-error source-specific connector types must not leak from the root API
import type { GitCommitInput as RootGitCommitInput } from "../src/index.ts";
// @ts-expect-error source-specific connector functions must not leak from the root API
import type { gitCommitToSourceRecord as rootGitCommitToSourceRecord } from "../src/index.ts";

interface InvalidFixture {
  readonly description: string;
  readonly expectedCode: string;
  readonly record: unknown;
}

interface CliItem {
  readonly status: "accepted" | "duplicate" | "rejected";
  readonly record?: SourceRecord;
  readonly error?: {
    readonly code: string;
  };
}

const validFixtureUrl = new URL(
  "../spec/fixtures/source-records/valid.jsonl",
  import.meta.url,
);
const invalidFixtureUrl = new URL(
  "../spec/fixtures/source-records/invalid.jsonl",
  import.meta.url,
);

const neutralRuntimeExports = [
  "DomainError",
  "DomainErrorCode",
  "SOURCE_RECORD_SCHEMA_VERSION",
  "canonicalizeJson",
  "createObject",
  "createSourceRecord",
  "deserializeObject",
  "deserializeSourceRecord",
  "evaluateAuthorization",
  "ingestAndPromoteEvidence",
  "ingestSourceRecordText",
  "ingestSourceRecords",
  "neutralEvidencePolicyV1",
  "promoteSourceRecordToEvidence",
  "serializeObject",
  "serializeSourceRecord",
  "sourceRevisionKey",
  "transitionObject",
  "validateSourceRecord",
] as const;

function fixtureText(url: URL): string {
  return readFileSync(url, "utf8");
}

function jsonLines<T>(text: string): T[] {
  return text
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as T);
}

function runValidate(
  input: string,
  format: "json" | "jsonl",
): {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
} {
  const result = spawnSync(
    "npm",
    [
      "run",
      "--silent",
      "cc",
      "--",
      "validate",
      "--input",
      "-",
      "--format",
      format,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      input,
    },
  );

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

test("accepts every canonical valid SourceRecord fixture through SDK and CLI", () => {
  const text = fixtureText(validFixtureUrl);
  const sdkResult = ingestSourceRecordText(text, { format: "jsonl" });

  assert.ok(sdkResult.items.length > 0);
  assert.ok(sdkResult.items.every((item) => item.status === "accepted"));

  const cliResult = runValidate(text, "jsonl");
  assert.equal(cliResult.status, 0, cliResult.stderr);
  assert.equal(cliResult.stderr, "");
  const cliItems = jsonLines<CliItem>(cliResult.stdout);
  assert.deepEqual(
    cliItems.map((item) => item.status),
    sdkResult.items.map((item) => item.status),
  );
  assert.deepEqual(
    cliItems.map((item) => item.record),
    sdkResult.acceptedRecords,
  );
  for (const record of sdkResult.acceptedRecords) {
    if (record.contentHash?.startsWith("sha256:")) {
      assert.match(
        record.contentHash,
        /^sha256:[a-f0-9]{64}$/,
        `${record.id} must contain a real SHA-256 digest`,
      );
    }
  }
});

test("rejects every canonical invalid fixture with its expected code", () => {
  const fixtures = jsonLines<InvalidFixture>(fixtureText(invalidFixtureUrl));
  const records = fixtures.map((fixture) => fixture.record);
  const jsonl = records.map((record) => JSON.stringify(record)).join("\n");
  const sdkResult = ingestSourceRecordText(jsonl, { format: "jsonl" });

  assert.ok(fixtures.length > 0);
  assert.deepEqual(
    sdkResult.items.map((item) => item.status),
    fixtures.map(() => "rejected"),
  );
  fixtures.forEach((fixture, index) => {
    assert.equal(
      sdkResult.items[index]?.error?.code,
      fixture.expectedCode,
      fixture.description,
    );
  });

  const cliResult = runValidate(jsonl, "jsonl");
  assert.notEqual(cliResult.status, 0);
  const cliItems = jsonLines<CliItem>(cliResult.stdout);
  fixtures.forEach((fixture, index) => {
    assert.equal(cliItems[index]?.status, "rejected", fixture.description);
    assert.equal(
      cliItems[index]?.error?.code,
      fixture.expectedCode,
      fixture.description,
    );
  });
});

test("canonical JSON and JSONL produce equivalent SourceRecords", () => {
  const jsonl = fixtureText(validFixtureUrl);
  const records = jsonLines<SourceRecord>(jsonl);
  const json = JSON.stringify(records);

  const sdkJsonl = ingestSourceRecordText(jsonl, { format: "jsonl" });
  const sdkJson = ingestSourceRecordText(json, { format: "json" });
  assert.deepEqual(sdkJson.acceptedRecords, sdkJsonl.acceptedRecords);

  const cliJsonl = runValidate(jsonl, "jsonl");
  const cliJson = runValidate(json, "json");
  assert.equal(cliJsonl.status, 0, cliJsonl.stderr);
  assert.equal(cliJson.status, 0, cliJson.stderr);
  assert.deepEqual(
    jsonLines<CliItem>(cliJson.stdout).map((item) => item.record),
    jsonLines<CliItem>(cliJsonl.stdout).map((item) => item.record),
  );
});

test("team-memory and Git connectors satisfy the same SourceRecord contract", () => {
  const teamMemoryInput: TeamMemoryEventRow = {
    id: 1,
    person: "Chris",
    project: "collective-cognition-sdk",
    ts: "2026-07-24T09:58:00.000Z",
    source: "gitlab",
    kind: "commit",
    summary: "Implemented neutral ingestion.",
    refs: '{"url":"https://git.example/acme/sdk/commit/abc123"}',
    raw: null,
    hash: "team-memory-revision-1",
  };
  const gitInput: GitCommitInput = {
    repository: { id: "git.example/acme/sdk" },
    commitId: "abc123",
    author: { id: "human:chris", name: "Chris" },
    authoredAt: "2026-07-24T09:57:00.000Z",
    capturedAt: "2026-07-24T09:59:00.000Z",
    summary: "Implemented neutral ingestion.",
    message: "Implemented neutral ingestion.",
    parents: ["parent-1"],
  };
  const records = [
    teamMemoryEventToSourceRecord(teamMemoryInput),
    gitCommitToSourceRecord(gitInput),
  ];

  records.forEach((record) => {
    assert.doesNotThrow(() => validateSourceRecord(record));
  });
  assert.deepEqual(
    ingestSourceRecords(records).items.map((item) => item.status),
    ["accepted", "accepted"],
  );
  assert.deepEqual(
    records.map((record) => record.source.system),
    ["team-memory-agent", "git"],
  );
});

test("root public API is exactly the neutral runtime allowlist", () => {
  assert.deepEqual(Object.keys(publicApi).sort(), neutralRuntimeExports);
  assert.equal(
    DomainErrorCode.INVALID_SOURCE_RECORD,
    "INVALID_SOURCE_RECORD",
  );
});
