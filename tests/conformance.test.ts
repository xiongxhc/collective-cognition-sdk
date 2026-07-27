import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  canonicalizeJson,
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
// @ts-expect-error source-specific connector types must not leak from the root API
import type { TeamMemoryQuery as RootTeamMemoryQuery } from "../src/index.ts";
// @ts-expect-error source-specific connector functions must not leak from the root API
import type { teamMemoryEventToSourceRecord as rootTeamMemoryEventToSourceRecord } from "../src/index.ts";
// @ts-expect-error source-specific connector types must not leak from the root API
import type { GitCommitInput as RootGitCommitInput } from "../src/index.ts";
// @ts-expect-error source-specific connector types must not leak from the root API
import type { GitRepositoryIdentity as RootGitRepositoryIdentity } from "../src/index.ts";
// @ts-expect-error source-specific connector types must not leak from the root API
import type { GitCommitAuthor as RootGitCommitAuthor } from "../src/index.ts";
// @ts-expect-error source-specific connector functions must not leak from the root API
import type { gitCommitToSourceRecord as rootGitCommitToSourceRecord } from "../src/index.ts";

interface InvalidFixture {
  readonly description: string;
  readonly ruleId: string;
  readonly expectedCode: string;
  readonly record?: unknown;
  readonly recordJson?: string;
}

interface CliItem {
  readonly status: "accepted" | "duplicate" | "rejected";
  readonly record?: SourceRecord;
  readonly error?: {
    readonly code: string;
  };
}

const validFixtureUrl = new URL(
  "../spec/conformance/0.1.0/source-record/valid.jsonl",
  import.meta.url,
);
const invalidFixtureUrl = new URL(
  "../spec/conformance/0.1.0/source-record/invalid.jsonl",
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
  "promoteSourceRecordsToEvidence",
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

function invalidFixtureJson(fixture: InvalidFixture): string {
  assert.notEqual(
    fixture.record === undefined,
    fixture.recordJson === undefined,
    `${fixture.description} must define exactly one record form`,
  );
  return fixture.recordJson ?? JSON.stringify(fixture.record);
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
});

test("rejects every canonical invalid fixture with its expected code", () => {
  const fixtures = jsonLines<InvalidFixture>(fixtureText(invalidFixtureUrl));
  fixtures.forEach((fixture) => {
    assert.ok(fixture.description.trim().length > 0);
    assert.ok(fixture.ruleId.trim().length > 0);
    assert.equal(fixture.expectedCode, DomainErrorCode.INVALID_SOURCE_RECORD);
  });
  const jsonl = fixtures.map(invalidFixtureJson).join("\n");
  const sdkResult = ingestSourceRecordText(jsonl, { format: "jsonl" });

  assert.ok(fixtures.length > 0);
  assert.deepEqual(
    sdkResult.items.map((item) => item.status),
    fixtures.map(() => "rejected"),
  );
  fixtures.forEach((fixture, index) => {
    const item = sdkResult.items[index];
    assert.ok(item?.status === "rejected", fixture.description);
    assert.equal(
      item.error.code,
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

test("binary64 numeric semantics determine duplicate and collision outcomes", () => {
  const recordPrefix = {
    schemaVersion: "0.1.0",
    id: "source-record:numeric:first",
    source: { system: "fixture" },
    sourceId: "item:numeric",
    revisionId: "revision:numeric",
    capturedAt: "2026-07-24T10:00:00Z",
    mediaType: "application/json",
  };
  const first = JSON.stringify({
    ...recordPrefix,
    content: 9_007_199_254_740_992,
  });
  const roundedEquivalent = JSON.stringify({
    ...recordPrefix,
    id: "source-record:numeric:equivalent",
    content: 9_007_199_254_740_992,
  }).replace("9007199254740992", "9007199254740993");
  const distinct = JSON.stringify({
    ...recordPrefix,
    id: "source-record:numeric:distinct",
    content: 9_007_199_254_740_994,
  });

  const duplicateResult = ingestSourceRecordText(
    `${first}\n${roundedEquivalent}`,
    { format: "jsonl" },
  );
  assert.deepEqual(
    duplicateResult.items.map((item) => item.status),
    ["accepted", "duplicate"],
  );

  const collisionResult = ingestSourceRecordText(
    `${first}\n${distinct}`,
    { format: "jsonl" },
  );
  assert.deepEqual(
    collisionResult.items.map((item) => item.status),
    ["accepted", "rejected"],
  );
  assert.equal(
    collisionResult.items[1]?.status === "rejected"
      ? collisionResult.items[1].error.code
      : undefined,
    DomainErrorCode.SOURCE_REVISION_COLLISION,
  );
});

test("canonical content ignores object order but preserves media type spelling", () => {
  const base = {
    schemaVersion: "0.1.0",
    id: "source-record:canonical:first",
    source: { system: "fixture" },
    sourceId: "item:canonical",
    revisionId: "revision:canonical",
    capturedAt: "2026-07-24T10:00:00Z",
    mediaType: "application/json",
    content: { alpha: 1, beta: 2 },
  };
  const reordered = {
    ...base,
    id: "source-record:canonical:reordered",
    content: { beta: 2, alpha: 1 },
  };
  const mediaTypeChanged = {
    ...base,
    id: "source-record:canonical:media-type",
    mediaType: "Application/JSON",
  };

  assert.deepEqual(
    ingestSourceRecords([base, reordered]).items.map((item) => item.status),
    ["accepted", "duplicate"],
  );

  const collision = ingestSourceRecords([base, mediaTypeChanged]);
  assert.deepEqual(
    collision.items.map((item) => item.status),
    ["accepted", "rejected"],
  );
  assert.equal(
    collision.items[1]?.status === "rejected"
      ? collision.items[1].error.code
      : undefined,
    DomainErrorCode.SOURCE_REVISION_COLLISION,
  );
});

test("canonical number vectors match RFC 8785 ECMAScript serialization", () => {
  assert.equal(canonicalizeJson(-0), "0");
  assert.equal(canonicalizeJson(1e21), "1e+21");
  assert.equal(canonicalizeJson(1e-7), "1e-7");
  assert.equal(
    canonicalizeJson(333333333.33333329),
    "333333333.3333333",
  );
});

test("deep valid JSON remains an item-level SourceRecord rejection", () => {
  const nestedContent =
    `${"[".repeat(10_000)}null${"]".repeat(10_000)}`;
  const recordJson =
    `{"schemaVersion":"0.1.0","id":"source-record:deep","source":{"system":"fixture"},"sourceId":"item:deep","revisionId":"revision:deep","capturedAt":"2026-07-24T10:00:00Z","mediaType":"application/json","content":${nestedContent}}`;

  const sdkResult = ingestSourceRecordText(recordJson, { format: "jsonl" });
  assert.equal(sdkResult.items[0]?.status, "rejected");
  assert.equal(
    sdkResult.items[0]?.status === "rejected"
      ? sdkResult.items[0].error.code
      : undefined,
    DomainErrorCode.INVALID_SOURCE_RECORD,
  );

  const cliResult = runValidate(recordJson, "jsonl");
  assert.notEqual(cliResult.status, 0);
  const cliItem = jsonLines<CliItem>(cliResult.stdout)[0];
  const cliDiagnostic = jsonLines<CliItem>(cliResult.stderr)[0];
  assert.equal(cliItem?.status, "rejected");
  assert.equal(cliItem?.error?.code, DomainErrorCode.INVALID_SOURCE_RECORD);
  assert.equal(cliDiagnostic?.status, "rejected");
  assert.equal(
    cliDiagnostic?.error?.code,
    DomainErrorCode.INVALID_SOURCE_RECORD,
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
