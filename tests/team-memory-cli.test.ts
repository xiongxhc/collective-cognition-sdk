import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { canonicalizeJson } from "../src/source-records.ts";

const cliPath = "src/team-memory-cli.ts";

function createLedger(
  raw = '{"private":"fictional raw"}',
): { readonly directory: string; readonly path: string } {
  const directory = mkdtempSync(join(tmpdir(), "cc-teammem-cli-"));
  const path = join(directory, "ledger.db");
  const database = new DatabaseSync(path);
  database.exec(`
    CREATE TABLE events (
      id INTEGER PRIMARY KEY,
      person TEXT NOT NULL,
      project TEXT,
      ts TEXT NOT NULL,
      source TEXT NOT NULL,
      kind TEXT NOT NULL,
      summary TEXT NOT NULL,
      refs TEXT,
      raw TEXT,
      hash TEXT NOT NULL,
      UNIQUE(person, source, hash)
    );
  `);
  const insert = database.prepare(
    "INSERT INTO events (id, person, project, ts, source, kind, summary, refs, raw, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  insert.run(
    1,
    "alice",
    "fictional-cognition",
    "2026-07-29T10:00:00.000Z",
    "fictional-git",
    "commit",
    "A fictional public event.",
    '{"sha":"abc123"}',
    raw,
    "hash-1",
  );
  insert.run(
    2,
    "bob",
    "fictional-cognition",
    "2026-07-29T11:00:00.000Z",
    "fictional-chat",
    "message",
    "Another fictional public event.",
    null,
    null,
    "hash-2",
  );
  database.close();
  return { directory, path };
}

async function runWithClosedStdout(
  args: readonly string[],
): Promise<{ readonly status: number | null; readonly stderr: string }> {
  const child = spawn(
    process.execPath,
    ["--disable-warning=ExperimentalWarning", cliPath, ...args],
    { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] },
  );
  let stderr = "";
  let stdoutClosed = false;
  child.stdout.on("data", () => {
    if (!stdoutClosed) {
      stdoutClosed = true;
      child.stdout.destroy();
    }
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const [status] = await once(child, "close") as [number | null];
  return { status, stderr };
}

function run(args: readonly string[]) {
  return spawnSync(
    process.execPath,
    ["--disable-warning=ExperimentalWarning", cliPath, ...args],
    { cwd: process.cwd(), encoding: "utf8" },
  );
}

function parseLines(text: string): unknown[] {
  return text.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

test("exports deterministic SourceRecord JSONL with explicit source identity", () => {
  const ledger = createLedger();
  try {
    const args = [
      "export",
      "--db",
      ledger.path,
      "--source-instance",
      "fictional-engineering-hub",
      "--person",
      "alice",
      "--limit",
      "1",
    ];
    const first = run(args);
    const second = run(args);

    assert.equal(first.status, 0, first.stderr);
    assert.equal(first.stderr, "");
    assert.equal(second.stdout, first.stdout);
    const records = parseLines(first.stdout) as Array<Record<string, unknown>>;
    assert.equal(records.length, 1);
    assert.deepEqual(records[0].source, {
      system: "teammem-event-ledger",
      instance: "fictional-engineering-hub",
    });
    assert.equal(
      records[0].id,
      "source-record:teammem-event-ledger:fictional-engineering-hub:alice:fictional-git:hash-1",
    );
    assert.equal("raw" in (records[0].content as object), false);
    assert.equal(
      first.stdout,
      `${canonicalizeJson(records[0] as never)}\n`,
    );
  } finally {
    rmSync(ledger.directory, { recursive: true, force: true });
  }
});

test("includes raw content only with the explicit CLI flag", () => {
  const ledger = createLedger();
  try {
    const result = run([
      "export",
      "--db",
      ledger.path,
      "--source-instance",
      "public-demo",
      "--person",
      "alice",
      "--include-raw",
    ]);

    assert.equal(result.status, 0, result.stderr);
    const [record] = parseLines(result.stdout) as Array<{
      readonly content: { readonly raw?: string };
    }>;
    assert.equal(record.content.raw, '{"private":"fictional raw"}');
  } finally {
    rmSync(ledger.directory, { recursive: true, force: true });
  }
});

test("emits one sanitized diagnostic for closed argument failures", () => {
  const ledger = createLedger();
  try {
    const invalidArguments = [
      [],
      ["unknown"],
      ["export"],
      ["export", "--db", ledger.path],
      ["export", "positional", "--db", ledger.path],
      ["export", "--db"],
      ["unknown", "--help"],
      ["export", "--unknown", "value", "--help"],
      ["export", "--db", "--help"],
      ["export", "--help", "--version"],
      [
        "export",
        "--db",
        ledger.path,
        "--source-instance",
        "demo",
        "--limit",
        "0",
      ],
      [
        "export",
        "--db",
        ledger.path,
        "--db",
        ledger.path,
        "--source-instance",
        "demo",
      ],
      [
        "export",
        "--db",
        ledger.path,
        "--source-instance",
        "demo",
        "--unknown",
        "value",
      ],
    ];

    for (const args of invalidArguments) {
      const result = run(args);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      const diagnostics = parseLines(result.stderr);
      assert.equal(diagnostics.length, 1);
      assert.deepEqual(Object.keys(diagnostics[0] as object).sort(), [
        "code",
        "message",
        "stage",
      ]);
      assert.deepEqual(diagnostics[0], {
        code: "invalid_command",
        message: "Team-memory CLI arguments are invalid.",
        stage: "arguments",
      });
    }
  } finally {
    rmSync(ledger.directory, { recursive: true, force: true });
  }
});

test("sanitizes connector failures and writes nothing to stdout", () => {
  const secret = "PRIVATE_LEDGER_PATH_MUST_NOT_ESCAPE";
  const result = run([
    "export",
    "--db",
    `/missing/${secret}.db`,
    "--source-instance",
    "public-demo",
  ]);

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr.includes(secret), false);
  assert.deepEqual(parseLines(result.stderr), [{
    code: "target_unavailable",
    message: "Team-memory ledger is unavailable.",
    stage: "open",
  }]);
});

test("help and version do not require an available source", () => {
  for (const args of [
    ["--help"],
    ["export", "--help"],
    ["export", "--db", "/missing/private.db", "--help"],
  ]) {
    const result = run(args);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /collective-cognition-teammem export/);
    assert.equal(result.stderr, "");
  }

  const result = run([
    "export",
    "--db",
    "/missing/private.db",
    "--version",
  ]);
  const packageVersion = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ).version;
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `${packageVersion}\n`);
  assert.equal(result.stderr, "");
});

test("closed stdout emits one sanitized output diagnostic without a stack trace", async () => {
  const secret = "BROKEN_PIPE_SOURCE_CONTENT_MUST_NOT_LEAK";
  const ledger = createLedger(secret.repeat(100_000));
  try {
    const result = await runWithClosedStdout([
      "export",
      "--db",
      ledger.path,
      "--source-instance",
      "public-demo",
      "--include-raw",
    ]);

    assert.equal(result.status, 1);
    assert.deepEqual(parseLines(result.stderr), [{
      code: "output_failed",
      message: "Team-memory CLI output failed.",
      stage: "output",
    }]);
    assert.equal(result.stderr.includes(secret), false);
    assert.doesNotMatch(result.stderr, /\b(?:EPIPE|Error:|at file:)\b/);
  } finally {
    rmSync(ledger.directory, { recursive: true, force: true });
  }
});

test("generic CLI validates the exported JSONL", () => {
  const ledger = createLedger();
  try {
    const exported = run([
      "export",
      "--db",
      ledger.path,
      "--source-instance",
      "public-demo",
    ]);
    assert.equal(exported.status, 0, exported.stderr);

    const validated = spawnSync(
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
        "jsonl",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        input: exported.stdout,
      },
    );
    assert.equal(validated.status, 0, validated.stderr);
    assert.equal(parseLines(validated.stdout).length, 2);
  } finally {
    rmSync(ledger.directory, { recursive: true, force: true });
  }
});
