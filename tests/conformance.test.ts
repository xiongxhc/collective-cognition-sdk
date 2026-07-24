import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DomainErrorCode,
  ingestSourceRecordText,
} from "../src/index.ts";
import * as publicApi from "../src/index.ts";
import type { SourceRecord } from "../src/index.ts";

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

test("root public API contains no source-specific connector exports", () => {
  const sourceSpecificExports = Object.keys(publicApi).filter((name) =>
    /teamMemory|teammem/i.test(name)
  );

  assert.deepEqual(sourceSpecificExports, []);
  assert.equal(
    DomainErrorCode.INVALID_SOURCE_RECORD,
    "INVALID_SOURCE_RECORD",
  );
});
