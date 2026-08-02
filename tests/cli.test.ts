import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
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

interface CliDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly details: Record<string, unknown>;
  readonly stage: string;
}

interface CliLimits {
  readonly maxInputBytes?: number;
  readonly maxRecords?: number;
  readonly maxRecordBytes?: number;
}

const promotedAt = "2026-07-24T12:00:00.000Z";
const rationale = "The selected records jointly document the CLI change.";

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

function secondSourceRecord(): SourceRecord {
  return sourceRecord({
    id: "source-record:cli-2",
    sourceId: "item:2",
    revisionId: "revision:2",
    content: { summary: "Second CLI source record." },
  });
}

function runCli(
  args: readonly string[],
  input?: string,
): CliResult {
  const result = spawnSync(
    process.execPath,
    ["--disable-warning=ExperimentalWarning", "src/cli.ts", ...args],
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

async function runCliWithClosedStdout(
  args: readonly string[],
  input: string,
): Promise<CliResult> {
  const child = spawn(
    process.execPath,
    [
      "--disable-warning=ExperimentalWarning",
      "src/cli.ts",
      ...args,
    ],
    {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";
  let stdoutClosed = false;

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
    if (!stdoutClosed) {
      stdoutClosed = true;
      child.stdout.destroy();
    }
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  child.stdin.end(input);

  const [status] = await once(child, "close") as [number | null];
  return { status, stdout, stderr };
}

function jsonLines(text: string): unknown[] {
  return text
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

function singleDiagnostic(result: CliResult): CliDiagnostic {
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  const diagnostics = jsonLines(result.stderr) as CliDiagnostic[];
  assert.equal(diagnostics.length, 1, result.stderr);
  const diagnostic = diagnostics[0];
  assert.ok(diagnostic);
  assert.deepEqual(
    Object.keys(diagnostic).sort(),
    ["code", "details", "message", "stage"],
  );
  assert.equal(typeof diagnostic.code, "string");
  assert.equal(typeof diagnostic.message, "string");
  assert.equal(typeof diagnostic.details, "object");
  assert.equal(typeof diagnostic.stage, "string");
  return diagnostic;
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

function limitArguments(limits: CliLimits = {}): string[] {
  return [
    ...(limits.maxInputBytes === undefined
      ? []
      : ["--max-input-bytes", String(limits.maxInputBytes)]),
    ...(limits.maxRecords === undefined
      ? []
      : ["--max-records", String(limits.maxRecords)]),
    ...(limits.maxRecordBytes === undefined
      ? []
      : ["--max-record-bytes", String(limits.maxRecordBytes)]),
  ];
}

function ingestionArguments(
  input: string,
  options: {
    readonly format?: "json" | "jsonl";
    readonly limits?: CliLimits;
  } = {},
): string[] {
  return [
    "--input",
    input,
    "--format",
    options.format ?? "jsonl",
    ...limitArguments(options.limits),
  ];
}

function promotionArguments(
  input: string,
  options: {
    readonly format?: "json" | "jsonl";
    readonly promotedAt?: string;
    readonly rationale?: string;
    readonly limits?: CliLimits;
  } = {},
): string[] {
  return [
    ...ingestionArguments(input, options),
    "--policy",
    "neutral-evidence-v1",
    "--hypothesis-id",
    "hypothesis:cli",
    "--context-id",
    "organization:cli",
    "--rationale",
    options.rationale ?? rationale,
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
  const second = secondSourceRecord();

  withInputFile(
    `${JSON.stringify(first)}\n${JSON.stringify(second)}\n`,
    (path) => {
      const result = runCli([
        "validate",
        ...ingestionArguments(path),
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
    ["ingest", ...ingestionArguments("-")],
    `${JSON.stringify(record)}\n${JSON.stringify(record)}\n`,
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.deepEqual(jsonLines(result.stdout), [record]);
});

test("validate exposes accepted and duplicate shapes only on stdout", () => {
  const record = sourceRecord();
  const result = runCli(
    ["validate", ...ingestionArguments("-")],
    `${JSON.stringify(record)}\n${JSON.stringify(record)}\n`,
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.deepEqual(jsonLines(result.stdout), [
    {
      index: 0,
      line: 1,
      status: "accepted",
      record,
    },
    {
      index: 1,
      line: 2,
      status: "duplicate",
      record,
      retainedRecordId: record.id,
    },
  ]);
});

test("CLI parser rejects every argument-form branch structurally", () => {
  const validInput = `${JSON.stringify(sourceRecord())}\n`;
  const completePromotion = promotionArguments("-");
  const cases: ReadonlyArray<{
    readonly name: string;
    readonly args: readonly string[];
  }> = [
    { name: "missing command", args: [] },
    { name: "unknown command", args: ["unknown"] },
    {
      name: "positional argument",
      args: ["validate", "input", "-", "--format", "jsonl"],
    },
    {
      name: "unknown option",
      args: [
        "validate",
        "--input",
        "-",
        "--format",
        "jsonl",
        "--unknown",
        "value",
      ],
    },
    {
      name: "missing option value",
      args: ["validate", "--input", "-", "--format"],
    },
    {
      name: "duplicate option",
      args: [
        "validate",
        "--input",
        "-",
        "--input",
        "-",
        "--format",
        "jsonl",
      ],
    },
    {
      name: "missing required option",
      args: ["validate", "--format", "jsonl"],
    },
    {
      name: "blank required value",
      args: ["validate", "--input", " ", "--format", "jsonl"],
    },
    {
      name: "unsupported format",
      args: ["validate", "--input", "-", "--format", "yaml"],
    },
    {
      name: "invalid positive limit",
      args: [
        "validate",
        ...ingestionArguments("-", { limits: { maxRecords: 0 } }),
      ],
    },
    {
      name: "promotion option on non-promotion command",
      args: [
        "validate",
        ...ingestionArguments("-"),
        "--policy",
        "neutral-evidence-v1",
      ],
    },
    {
      name: "unsupported policy",
      args: [
        "promote",
        ...completePromotion.map((value) =>
          value === "neutral-evidence-v1" ? "other-policy" : value
        ),
      ],
    },
  ];

  for (const cliCase of cases) {
    const diagnostic = singleDiagnostic(
      runCli(cliCase.args, validInput),
    );
    assert.equal(diagnostic.code, "INVALID_ARGUMENT", cliCase.name);
    assert.equal(diagnostic.stage, "arguments", cliCase.name);
  }
});

test("CLI reports source revision collisions on stderr and exits one", () => {
  const retained = sourceRecord();
  const collision = sourceRecord({
    id: "source-record:cli-collision",
    content: { summary: "Changed content under the same revision key." },
  });
  const result = runCli(
    ["validate", ...ingestionArguments("-")],
    `${JSON.stringify(retained)}\n${JSON.stringify(collision)}\n`,
  );

  assert.equal(result.status, 1);
  const output = jsonLines(result.stdout) as Array<{
    readonly status: string;
    readonly error?: {
      readonly code: string;
      readonly message: string;
      readonly details: Record<string, unknown>;
    };
  }>;
  assert.equal(output.length, 2);
  assert.equal(output[0]?.status, "accepted");
  assert.deepEqual(Object.keys(output[1] ?? {}).sort(), [
    "error",
    "index",
    "line",
    "status",
  ]);
  assert.equal(output[1]?.status, "rejected");
  assert.equal(output[1]?.error?.code, "SOURCE_REVISION_COLLISION");
  assert.deepEqual(jsonLines(result.stderr), [output[1]]);
});

test("closed stdout emits one sanitized CLI_ERROR diagnostic", async () => {
  const secret = "BROKEN_PIPE_SOURCE_CONTENT_MUST_NOT_LEAK";
  const record = sourceRecord({ content: { summary: secret } });
  const input = `${JSON.stringify(record)}\n`.repeat(20_000);
  const result = await runCliWithClosedStdout(
    [
      "validate",
      ...ingestionArguments("-", {
        limits: { maxRecords: 20_000 },
      }),
    ],
    input,
  );

  assert.equal(result.status, 1);
  assert.deepEqual(jsonLines(result.stderr), [
    {
      code: "CLI_ERROR",
      message: "CLI operation failed.",
      details: {},
      stage: "output",
    },
  ]);
  assert.equal(result.stderr.includes(secret), false);
  assert.equal(result.stderr.includes(process.cwd()), false);
  assert.doesNotMatch(result.stderr, /\b(?:Error:|at file:|at writeJsonLine)\b/);
});

test("promotion requires every explicit interpretation argument", () => {
  withInputFile(`${JSON.stringify(sourceRecord())}\n`, (path) => {
    const requiredFlags = [
      "--policy",
      "--hypothesis-id",
      "--context-id",
      "--rationale",
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
      const diagnostic = singleDiagnostic(runCli(args));

      assert.equal(diagnostic.code, "INVALID_ARGUMENT", flag);
      assert.equal(diagnostic.stage, "arguments", flag);
      assert.match(diagnostic.message, new RegExp(flag.slice(2), "i"), flag);
    }
  });
});

test("promote emits one Evidence preserving every contributing source and rationale", () => {
  const first = sourceRecord();
  const second = secondSourceRecord();

  withInputFile(
    `${JSON.stringify(first)}\n${JSON.stringify(second)}\n`,
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
        extensions: {
          "collective-cognition:promotion": {
            rationale: string;
          };
        };
      }>;
      assert.equal(evidence.length, 1);
      assert.equal(evidence[0]?.type, "evidence");
      assert.equal(evidence[0]?.state, "collected");
      assert.deepEqual(evidence[0]?.data, {
        statement: "CLI source record.\n\nSecond CLI source record.",
        evidenceKind: "source-record",
        polarity: "neutral",
      });
      assert.deepEqual(
        evidence[0]?.provenance.map((reference) => reference.sourceId),
        [first.id, second.id],
      );
      assert.equal(
        evidence[0]?.extensions["collective-cognition:promotion"].rationale,
        rationale,
      );
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
      promotion: {
        status: "succeeded";
        evidence: { type: string };
      };
    }>;
    assert.deepEqual(
      composed?.ingestion.items.map((item) => item.status),
      ["accepted"],
    );
    assert.deepEqual(composed?.ingestion.acceptedRecords, [record]);
    assert.equal(composed?.promotion.status, "succeeded");
    assert.equal(composed?.promotion.evidence.type, "evidence");
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

      assert.equal(result.status, 1);
      const [composed] = jsonLines(result.stdout) as Array<{
        ingestion: {
          items: Array<{
            status: string;
            error?: { code: string; message: string };
          }>;
          acceptedRecords: SourceRecord[];
        };
        promotion: {
          status: "failed";
          error: { code: string; message: string; details: object };
        };
      }>;
      assert.deepEqual(
        composed?.ingestion.items.map((item) => item.status),
        ["accepted", "duplicate", "rejected"],
      );
      assert.equal(
        composed?.ingestion.items[2]?.error?.code,
        "INVALID_SOURCE_RECORD",
      );
      assert.deepEqual(composed?.ingestion.acceptedRecords, [accepted]);
      assert.equal(composed?.promotion.status, "failed");
      assert.equal(composed?.promotion.error.code, "INVALID_OBJECT");
      assert.match(composed?.promotion.error.message ?? "", /timestamp/i);

      const diagnostics = jsonLines(result.stderr) as Array<{
        stage?: string;
        status?: string;
        code?: string;
        error?: { code: string };
      }>;
      assert.equal(diagnostics.length, 2);
      assert.equal(diagnostics[0]?.status, "rejected");
      assert.equal(
        diagnostics[0]?.error?.code,
        "INVALID_SOURCE_RECORD",
      );
      assert.deepEqual(diagnostics[1], {
        code: "INVALID_OBJECT",
        message: composed?.promotion.error.message,
        details: composed?.promotion.error.details,
        stage: "promotion",
      });
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
          : [command, ...ingestionArguments(path, { format: "json" })];
      const result = runCli(args);

      assert.equal(result.status, 0, `${command}: ${result.stderr}`);
      assert.equal(result.stderr, "", command);
      const output = jsonLines(result.stdout);
      assert.equal(output.length, 1, command);
      if (command === "ingest-promote") {
        const [composed] = output as Array<{
          ingestion: { items: Array<{ status: string }> };
          promotion: { status: string };
        }>;
        assert.deepEqual(
          composed?.ingestion.items.map((item) => item.status),
          ["accepted"],
          command,
        );
        assert.equal(composed?.promotion.status, "succeeded", command);
      }
    }
  });
});

test("--format json accepts stdin arrays across generic CLI paths", () => {
  const first = sourceRecord();
  const second = secondSourceRecord();
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
        : [command, ...ingestionArguments("-", { format: "json" })];
    const result = runCli(args, input);

    assert.equal(result.status, 0, `${command}: ${result.stderr}`);
    assert.equal(result.stderr, "", command);
    const output = jsonLines(result.stdout);
    if (command === "validate" || command === "ingest") {
      assert.equal(output.length, 2, command);
    } else if (command === "promote") {
      assert.equal(output.length, 1, command);
    } else {
      const [composed] = output as Array<{
        ingestion: { items: Array<{ status: string }> };
        promotion: { status: string; evidence: { provenance: unknown[] } };
      }>;
      assert.deepEqual(
        composed?.ingestion.items.map((item) => item.status),
        ["accepted", "accepted"],
        command,
      );
      assert.equal(composed?.promotion.status, "succeeded", command);
      assert.equal(composed?.promotion.evidence.provenance.length, 2, command);
    }
  }
});

test("malformed JSONL produces item output and item diagnostics", () => {
  const record = sourceRecord();

  withInputFile(
    `${JSON.stringify(record)}\n{broken\n`,
    (path) => {
      const result = runCli([
        "validate",
        ...ingestionArguments(path),
      ]);

      assert.equal(result.status, 1);
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

test("CLI parser and input diagnostics never expose distinctive secrets", () => {
  const parserSecret = "LEAK42";
  const parserResult = runCli(
    ["validate", ...ingestionArguments("-")],
    `{"value": ${parserSecret}}\n`,
  );

  assert.equal(parserResult.status, 1);
  assert.equal(parserResult.stdout.includes(parserSecret), false);
  assert.equal(parserResult.stderr.includes(parserSecret), false);

  const pathSecret = "CLI_PATH_SECRET_DO_NOT_EXPOSE";
  const inputResult = runCli([
    "validate",
    ...ingestionArguments(`/missing/${pathSecret}.jsonl`),
  ]);
  assert.equal(inputResult.status, 1);
  assert.equal(inputResult.stdout, "");
  assert.equal(inputResult.stderr.includes(pathSecret), false);
});

test("all top-level CLI failures emit one structured diagnostic", () => {
  const cases: Array<{
    args: string[];
    input?: string;
    code: string;
    stage: string;
  }> = [
    {
      args: [],
      input: "",
      code: "INVALID_ARGUMENT",
      stage: "arguments",
    },
    {
      args: ["validate", ...ingestionArguments("/path/that/does/not/exist")],
      code: "INPUT_READ_ERROR",
      stage: "input",
    },
  ];

  withInputFile(`${JSON.stringify(sourceRecord())}\n`, (path) => {
    cases.push({
      args: [
        "promote",
        ...promotionArguments(path, { promotedAt: "not-an-iso-timestamp" }),
      ],
      code: "INVALID_OBJECT",
      stage: "promotion",
    });

    for (const cliCase of cases) {
      const diagnostic = singleDiagnostic(
        runCli(cliCase.args, cliCase.input),
      );
      assert.equal(diagnostic.code, cliCase.code);
      assert.equal(diagnostic.stage, cliCase.stage);
    }
  });
});

test("CLI bounds file input incrementally by maxInputBytes", () => {
  const content = `${JSON.stringify(sourceRecord())}\n`;
  const inputBytes = Buffer.byteLength(content);

  withInputFile(content, (path) => {
    const diagnostic = singleDiagnostic(
      runCli([
        "validate",
        ...ingestionArguments(path, {
          limits: { maxInputBytes: inputBytes - 1 },
        }),
      ]),
    );

    assert.equal(diagnostic.code, "INGESTION_LIMIT_EXCEEDED");
    assert.equal(diagnostic.stage, "input");
    assert.deepEqual(diagnostic.details, {
      limit: "maxInputBytes",
      maximum: inputBytes - 1,
      actual: inputBytes,
    });
  });
});

test("CLI rejects an oversized malformed JSONL line before parsing", () => {
  const malformed = `{"value":"${"x".repeat(256)}"`;
  const diagnostic = singleDiagnostic(
    runCli(
      [
        "validate",
        ...ingestionArguments("-", {
          limits: { maxRecordBytes: 64 },
        }),
      ],
      malformed,
    ),
  );

  assert.equal(diagnostic.code, "INGESTION_LIMIT_EXCEEDED");
  assert.equal(diagnostic.stage, "ingestion");
  assert.equal(diagnostic.details.limit, "maxRecordBytes");
});

test("CLI enforces maxRecords before emitting output", () => {
  const content = [
    JSON.stringify(sourceRecord()),
    JSON.stringify(secondSourceRecord()),
  ].join("\n");

  withInputFile(content, (path) => {
    const diagnostic = singleDiagnostic(
      runCli([
        "validate",
        ...ingestionArguments(path, { limits: { maxRecords: 1 } }),
      ]),
    );

    assert.equal(diagnostic.code, "INGESTION_LIMIT_EXCEEDED");
    assert.equal(diagnostic.stage, "ingestion");
    assert.equal(diagnostic.details.limit, "maxRecords");
  });
});

test("CLI enforces maxRecordBytes before emitting output", () => {
  const record = sourceRecord();
  const content = JSON.stringify(record);
  const recordBytes = Buffer.byteLength(content);

  withInputFile(content, (path) => {
    const diagnostic = singleDiagnostic(
      runCli([
        "validate",
        ...ingestionArguments(path, {
          limits: { maxRecordBytes: recordBytes - 1 },
        }),
      ]),
    );

    assert.equal(diagnostic.code, "INGESTION_LIMIT_EXCEEDED");
    assert.equal(diagnostic.stage, "ingestion");
    assert.equal(diagnostic.details.limit, "maxRecordBytes");
  });
});

test("stdin is bounded incrementally by maxInputBytes", () => {
  const input = `${JSON.stringify(sourceRecord())}\n`;
  const maximum = Math.floor(Buffer.byteLength(input) / 2);
  const diagnostic = singleDiagnostic(
    runCli(
      [
        "validate",
        ...ingestionArguments("-", {
          limits: { maxInputBytes: maximum },
        }),
      ],
      input,
    ),
  );

  assert.equal(diagnostic.code, "INGESTION_LIMIT_EXCEEDED");
  assert.equal(diagnostic.stage, "input");
  assert.equal(diagnostic.details.limit, "maxInputBytes");
  assert.equal(diagnostic.details.maximum, maximum);
  assert.ok((diagnostic.details.actual as number) > maximum);
});
