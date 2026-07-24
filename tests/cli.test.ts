import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createSourceRecord } from "../src/index.ts";
import type { SourceRecord } from "../src/index.ts";

interface CliResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

const promotedAt = "2026-07-24T12:00:00.000Z";

function sourceRecord(
  overrides: Partial<SourceRecord> = {},
): SourceRecord {
  return createSourceRecord({
    id: "source-record:cli-1",
    source: { system: "fixture", instance: "cli-tests" },
    sourceId: "item:1",
    revisionId: "revision:1",
    capturedAt: "2026-07-24T10:00:00.000Z",
    mediaType: "application/json",
    content: { summary: "CLI source record." },
    ...overrides,
  });
}

function runCli(
  args: readonly string[],
  input?: string,
): CliResult {
  const result = spawnSync(
    "npm",
    ["run", "--silent", "cc", "--", ...args],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      ...(input === undefined ? {} : { input }),
    },
  );

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function jsonLines(text: string): unknown[] {
  return text
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

function withInputFile(
  content: string,
  action: (path: string) => void,
): void {
  const directory = mkdtempSync(join(tmpdir(), "collective-cognition-cli-"));
  const path = join(directory, "records.jsonl");
  writeFileSync(path, content);
  try {
    action(path);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function promotionArguments(
  input: string,
  options: {
    readonly format?: "json" | "jsonl";
    readonly promotedAt?: string;
  } = {},
): string[] {
  return [
    "--input",
    input,
    "--format",
    options.format ?? "jsonl",
    "--policy",
    "neutral-evidence-v1",
    "--hypothesis-id",
    "hypothesis:cli",
    "--context-id",
    "organization:cli",
    "--initiator-id",
    "human:owner",
    "--executor-id",
    "agent:cli",
    "--accountable-id",
    "human:owner",
    "--promoted-at",
    options.promotedAt ?? promotedAt,
  ];
}

test("validate emits one machine-readable item result per input", () => {
  const first = sourceRecord();
  const second = sourceRecord({
    id: "source-record:cli-2",
    sourceId: "item:2",
    revisionId: "revision:2",
  });

  withInputFile(
    `${JSON.stringify(first)}\n${JSON.stringify(second)}\n`,
    (path) => {
      const result = runCli([
        "validate",
        "--input",
        path,
        "--format",
        "jsonl",
      ]);

      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stderr, "");
      const items = jsonLines(result.stdout) as Array<{
        status: string;
        record: SourceRecord;
      }>;
      assert.deepEqual(items.map((item) => item.status), [
        "accepted",
        "accepted",
      ]);
      assert.deepEqual(items.map((item) => item.record.id), [
        first.id,
        second.id,
      ]);
    },
  );
});

test("ingest reads stdin and suppresses duplicate source revisions", () => {
  const record = sourceRecord();
  const result = runCli(
    ["ingest", "--input", "-", "--format", "jsonl"],
    `${JSON.stringify(record)}\n${JSON.stringify(record)}\n`,
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.deepEqual(jsonLines(result.stdout), [record]);
});

test("promotion requires every explicit interpretation argument", () => {
  withInputFile(`${JSON.stringify(sourceRecord())}\n`, (path) => {
    const requiredFlags = [
      "--policy",
      "--hypothesis-id",
      "--context-id",
      "--initiator-id",
      "--executor-id",
      "--accountable-id",
      "--promoted-at",
    ];
    const complete = promotionArguments(path);

    for (const flag of requiredFlags) {
      const flagIndex = complete.indexOf(flag);
      const args = [
        "promote",
        ...complete.slice(0, flagIndex),
        ...complete.slice(flagIndex + 2),
      ];
      const result = runCli(args);

      assert.notEqual(result.status, 0, flag);
      assert.equal(result.stdout, "", flag);
      assert.match(result.stderr, new RegExp(flag.slice(2), "i"), flag);
    }
  });
});

test("promote emits neutral Evidence for every valid unique record", () => {
  const record = sourceRecord();

  withInputFile(
    `${JSON.stringify(record)}\n${JSON.stringify(record)}\n`,
    (path) => {
      const result = runCli(["promote", ...promotionArguments(path)]);

      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stderr, "");
      const evidence = jsonLines(result.stdout) as Array<{
        type: string;
        state: string;
        data: {
          statement: string;
          evidenceKind: string;
          polarity: string;
        };
        provenance: Array<{ sourceId: string }>;
      }>;
      assert.equal(evidence.length, 1);
      assert.equal(evidence[0]?.type, "evidence");
      assert.equal(evidence[0]?.state, "collected");
      assert.deepEqual(evidence[0]?.data, {
        statement: "CLI source record.",
        evidenceKind: "source-record",
        polarity: "neutral",
      });
      assert.equal(evidence[0]?.provenance[0]?.sourceId, record.id);
    },
  );
});

test("ingest-promote exposes both composed workflow stages", () => {
  const record = sourceRecord();

  withInputFile(`${JSON.stringify(record)}\n`, (path) => {
    const result = runCli([
      "ingest-promote",
      ...promotionArguments(path),
    ]);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    const [composed] = jsonLines(result.stdout) as Array<{
      ingestion: {
        items: Array<{ status: string }>;
        acceptedRecords: SourceRecord[];
      };
      promotions: Array<{ type: string }>;
    }>;
    assert.deepEqual(
      composed?.ingestion.items.map((item) => item.status),
      ["accepted"],
    );
    assert.deepEqual(composed?.ingestion.acceptedRecords, [record]);
    assert.deepEqual(
      composed?.promotions.map((promotion) => promotion.type),
      ["evidence"],
    );
  });
});

test("ingest-promote preserves mixed ingestion results when promotion fails", () => {
  const accepted = sourceRecord();
  const rejected = { ...accepted, schemaVersion: "9.9.9" };

  withInputFile(
    [
      JSON.stringify(accepted),
      JSON.stringify(accepted),
      JSON.stringify(rejected),
    ].join("\n"),
    (path) => {
      const result = runCli([
        "ingest-promote",
        ...promotionArguments(path, { promotedAt: "not-an-iso-timestamp" }),
      ]);

      assert.notEqual(result.status, 0);
      const [composed] = jsonLines(result.stdout) as Array<{
        ingestion: {
          items: Array<{
            status: string;
            error?: { code: string; message: string };
          }>;
          acceptedRecords: SourceRecord[];
        };
        promotions: unknown[];
        promotionError: { code: string; message: string };
      }>;
      assert.deepEqual(
        composed?.ingestion.items.map((item) => item.status),
        ["accepted", "duplicate", "rejected"],
      );
      assert.equal(
        composed?.ingestion.items[2]?.error?.code,
        "INVALID_SOURCE_RECORD",
      );
      assert.match(
        composed?.ingestion.items[2]?.error?.message ?? "",
        /schema version/i,
      );
      assert.deepEqual(composed?.ingestion.acceptedRecords, [accepted]);
      assert.deepEqual(composed?.promotions, []);
      assert.equal(composed?.promotionError.code, "INVALID_OBJECT");
      assert.match(composed?.promotionError.message, /timestamp/i);

      const diagnostics = jsonLines(result.stderr) as Array<{
        stage?: string;
        status?: string;
        error: { code: string; message: string };
      }>;
      assert.equal(diagnostics.length, 2);
      assert.equal(diagnostics[0]?.status, "rejected");
      assert.equal(
        diagnostics[0]?.error.code,
        "INVALID_SOURCE_RECORD",
      );
      assert.equal(diagnostics[1]?.stage, "promotion");
      assert.equal(diagnostics[1]?.error.code, "INVALID_OBJECT");
    },
  );
});

test("--format json accepts file object input across generic CLI paths", () => {
  const record = sourceRecord();

  withInputFile(JSON.stringify(record), (path) => {
    for (const command of [
      "validate",
      "ingest",
      "promote",
      "ingest-promote",
    ] as const) {
      const args =
        command === "promote" || command === "ingest-promote"
          ? [command, ...promotionArguments(path, { format: "json" })]
          : [command, "--input", path, "--format", "json"];
      const result = runCli(args);

      assert.equal(result.status, 0, `${command}: ${result.stderr}`);
      assert.equal(result.stderr, "", command);
      const output = jsonLines(result.stdout);
      assert.equal(output.length, 1, command);
      if (command === "ingest-promote") {
        const [composed] = output as Array<{
          ingestion: { items: Array<{ status: string }> };
          promotions: unknown[];
        }>;
        assert.deepEqual(
          composed?.ingestion.items.map((item) => item.status),
          ["accepted"],
          command,
        );
        assert.equal(composed?.promotions.length, 1, command);
      }
    }
  });
});

test("--format json accepts stdin array input across generic CLI paths", () => {
  const first = sourceRecord();
  const second = sourceRecord({
    id: "source-record:cli-2",
    sourceId: "item:2",
    revisionId: "revision:2",
  });
  const input = JSON.stringify([first, second]);

  for (const command of [
    "validate",
    "ingest",
    "promote",
    "ingest-promote",
  ] as const) {
    const args =
      command === "promote" || command === "ingest-promote"
        ? [command, ...promotionArguments("-", { format: "json" })]
        : [command, "--input", "-", "--format", "json"];
    const result = runCli(args, input);

    assert.equal(result.status, 0, `${command}: ${result.stderr}`);
    assert.equal(result.stderr, "", command);
    const output = jsonLines(result.stdout);
    if (command === "ingest-promote") {
      const [composed] = output as Array<{
        ingestion: { items: Array<{ status: string }> };
        promotions: unknown[];
      }>;
      assert.deepEqual(
        composed?.ingestion.items.map((item) => item.status),
        ["accepted", "accepted"],
        command,
      );
      assert.equal(composed?.promotions.length, 2, command);
    } else {
      assert.equal(output.length, 2, command);
    }
  }
});

test("malformed JSONL produces item output and stderr diagnostics", () => {
  const record = sourceRecord();

  withInputFile(
    `${JSON.stringify(record)}\n{broken\n`,
    (path) => {
      const result = runCli([
        "validate",
        "--input",
        path,
        "--format",
        "jsonl",
      ]);

      assert.notEqual(result.status, 0);
      const items = jsonLines(result.stdout) as Array<{
        line: number;
        status: string;
        error?: { code: string; message: string };
      }>;
      assert.deepEqual(items.map((item) => item.status), [
        "accepted",
        "rejected",
      ]);
      assert.equal(items[1]?.line, 2);
      assert.equal(items[1]?.error?.code, "SERIALIZATION_ERROR");
      assert.match(items[1]?.error?.message ?? "", /JSONL line/i);

      const diagnostics = jsonLines(result.stderr) as Array<{
        line: number;
        error: { code: string };
      }>;
      assert.equal(diagnostics.length, 1);
      assert.equal(diagnostics[0]?.line, 2);
      assert.equal(diagnostics[0]?.error.code, "SERIALIZATION_ERROR");
    },
  );
});

test("invalid command arguments write diagnostics with zero stdout", () => {
  for (const args of [
    [],
    ["unknown", "--input", "-", "--format", "jsonl"],
    ["validate", "--input", "-", "--format", "yaml"],
    ["ingest", "--input", "-", "--format", "jsonl", "--unknown", "value"],
  ]) {
    const result = runCli(args, "");

    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
    assert.notEqual(result.stderr, "");
  }
});
