import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import test from "node:test";

import {
  MARKDOWN_COGNITION_MAX_INPUT_BYTES,
  MARKDOWN_COGNITION_MAX_RECORDS,
  markdownCognitionRelativePath,
} from "../src/markdown-cognition.ts";
import type { MarkdownCognitionRecord } from "../src/markdown-cognition.ts";

interface CliResult {
  readonly status: number | null;
  readonly stderr: string;
  readonly stdout: string;
}

interface CliDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly relativePath?: string;
  readonly stage: string;
}

const cliPath = fileURLToPath(
  new URL("../src/markdown-cognition-cli.ts", import.meta.url),
);
const fixtureUrl = new URL(
  "./fixtures/markdown-cognition/0.1.0/records.jsonl",
  import.meta.url,
);
const portableFixtureUrl = new URL(
  "../spec/conformance/0.1.0/portable-cognition/valid.jsonl",
  import.meta.url,
);
const packageVersion = (
  JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { readonly version: string }
).version;

function runCli(args: readonly string[], input?: string): CliResult {
  const result = spawnSync(
    process.execPath,
    ["--disable-warning=ExperimentalWarning", cliPath, ...args],
    {
      encoding: "utf8",
      ...(input === undefined ? {} : { input }),
    },
  );
  return {
    status: result.status,
    stderr: result.stderr,
    stdout: result.stdout,
  };
}

async function runCliWithClosedStream(
  args: readonly string[],
  stream: "stderr" | "stdout",
): Promise<CliResult> {
  const child = spawn(
    process.execPath,
    ["--disable-warning=ExperimentalWarning", cliPath, ...args],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  let stdout = "";
  let stderr = "";
  let closed = false;
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
    if (stream === "stdout" && !closed) {
      closed = true;
      child.stdout.destroy();
    }
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
    if (stream === "stderr" && !closed) {
      closed = true;
      child.stderr.destroy();
    }
  });
  if (stream === "stdout") child.stdout.destroy();
  else child.stderr.destroy();
  child.stdin.end();
  const [status] = await once(child, "close") as [number | null];
  return { status, stderr, stdout };
}

function fixtureRecords(): MarkdownCognitionRecord[] {
  return readFileSync(fixtureUrl, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as MarkdownCognitionRecord);
}

function temporaryCliFixture(): {
  readonly input: string;
  readonly remove: () => void;
  readonly root: string;
  readonly target: string;
} {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ccsdk-markdown-cli-")));
  const input = join(root, "portable-cognition.jsonl");
  writeFileSync(input, readFileSync(fixtureUrl));
  return {
    input,
    remove: () => rmSync(root, { recursive: true, force: true }),
    root,
    target: join(root, "Collective Cognition"),
  };
}

function singleDiagnostic(result: CliResult): CliDiagnostic {
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout, "");
  const lines = result.stderr.trim().split("\n").filter(Boolean);
  assert.equal(lines.length, 1, result.stderr);
  const diagnostic = JSON.parse(lines[0]!) as CliDiagnostic;
  assert.deepEqual(
    Object.keys(diagnostic).sort(),
    diagnostic.relativePath === undefined
      ? ["code", "message", "stage"]
      : ["code", "message", "relativePath", "stage"],
  );
  return diagnostic;
}

function assertSanitized(result: CliResult, secret: string): CliDiagnostic {
  const diagnostic = singleDiagnostic(result);
  assert.equal(result.stderr.includes(secret), false);
  assert.doesNotMatch(result.stderr, /\b(?:Error:|E[A-Z]+:|at file:)\b/);
  return diagnostic;
}

test("initializes, projects, and verifies one explicit target", () => {
  const fixture = temporaryCliFixture();
  try {
    const initialized = runCli(["init", "--target", fixture.target]);
    assert.equal(initialized.status, 0, initialized.stderr);
    assert.deepEqual(JSON.parse(initialized.stdout), { status: "initialized" });

    const projected = runCli([
      "project",
      "--input",
      fixture.input,
      "--target",
      fixture.target,
    ]);
    assert.equal(projected.status, 0, projected.stderr);
    assert.deepEqual(Object.keys(JSON.parse(projected.stdout)).sort(), [
      "created",
      "pruned",
      "unchanged",
      "updated",
    ]);

    const verified = runCli(["verify", "--target", fixture.target]);
    assert.equal(verified.status, 0, verified.stderr);
    assert.equal(JSON.parse(verified.stdout).status, "passed");
  } finally {
    fixture.remove();
  }
});

test("keeps the command surface and control modes closed", () => {
  const secret = "CLI_ARGUMENT_SECRET_MUST_NOT_ESCAPE";
  const invalidArguments = [
    [],
    ["unknown"],
    ["init"],
    ["project", "--target", "/tmp/target"],
    ["verify", "--target", "relative-target"],
    ["init", "--target"],
    ["init", "--unknown", secret],
    ["init", "--target", "/tmp/target", "--target", "/tmp/other"],
    ["init", "--target", "/tmp/target", "extra"],
    ["init", "--target", "/tmp/target", "--prune-managed"],
    ["verify", "--target", "/tmp/target", "--prune-managed"],
    ["project", "--input", "-", "--target", "/tmp/target", "--prune-managed", "--prune-managed"],
    ["--help", "--target", secret],
    ["init", "--help", "--version"],
    ["init", "--input", "/tmp/input", "--help"],
    ["init", "--target", "relative-target", "--help"],
    ["init", "--help", "--target", "relative-target"],
    ["init", "--target", "", "--version"],
    ["init", "--target", "--help"],
    ["verify", "--target", "--help"],
    ["project", "--input", "relative.jsonl", "--target", "/tmp/target", "--version"],
    ["project", "--version", "--input", "relative.jsonl", "--target", "/tmp/target"],
    ["project", "--input", "-", "--help"],
    ["project", "--input", "", "--target", "/tmp/target", "--help"],
    ["project", "--input", "--version", "--target", "/tmp/target"],
    ["project", "--input", "relative.jsonl", "--target", "/tmp/target"],
    ["project", "--input", "--", "--target", "/tmp/target"],
  ];
  for (const args of invalidArguments) {
    const result = runCli(args);
    assert.equal(result.status, 1, JSON.stringify(args));
    assert.deepEqual(assertSanitized(result, secret), {
      code: "invalid_command",
      message: "Markdown cognition CLI arguments are invalid.",
      stage: "arguments",
    });
  }

  for (const args of [["--help"], ["init", "--target", "/missing/target", "--help"]]) {
    const result = runCli(args);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /collective-cognition-markdown init/);
    assert.equal(result.stderr, "");
  }
  for (const args of [
    ["verify", "--target", "/missing/target", "--version"],
    ["project", "--input", "/missing/input.jsonl", "--target", "/missing/target", "--version"],
  ]) {
    const result = runCli(args);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout, `${packageVersion}\n`);
  }
  const stdinHelp = runCli(
    ["project", "--input", "-", "--target", "/missing/target", "--help"],
    "{\n",
  );
  assert.equal(stdinHelp.status, 0, stdinHelp.stderr);
  assert.match(stdinHelp.stdout, /collective-cognition-markdown init/);
  assert.equal(stdinHelp.stderr, "");
});

test("reads only explicit stdin and validates all input before mutation", () => {
  const fixture = temporaryCliFixture();
  const secret = "CLI_INPUT_SECRET_MUST_NOT_ESCAPE";
  try {
    assert.equal(runCli(["init", "--target", fixture.target]).status, 0);
    const markerBefore = readFileSync(join(fixture.target, ".collective-cognition.json"));
    const manifestBefore = readFileSync(join(fixture.target, ".collective-cognition-manifest.json"));
    const malformed = runCli(
      ["project", "--input", "-", "--target", fixture.target],
      `{"secret":"${secret}"}\n`,
    );
    assert.deepEqual(assertSanitized(malformed, secret), {
      code: "invalid_projection_input",
      message: "Markdown cognition projection input is invalid.",
      stage: "projection",
    });
    assert.deepEqual(readFileSync(join(fixture.target, ".collective-cognition.json")), markerBefore);
    assert.deepEqual(readFileSync(join(fixture.target, ".collective-cognition-manifest.json")), manifestBefore);

    for (const invalidJsonl of ["{\n", "{\"id\":1,\"id\":2}\n"]) {
      assert.deepEqual(singleDiagnostic(runCli(
        ["project", "--input", "-", "--target", fixture.target],
        invalidJsonl,
      )), {
        code: "invalid_projection_input",
        message: "Markdown cognition projection input is invalid.",
        stage: "input",
      });
      assert.deepEqual(readFileSync(join(fixture.target, ".collective-cognition.json")), markerBefore);
      assert.deepEqual(readFileSync(join(fixture.target, ".collective-cognition-manifest.json")), manifestBefore);
    }

    const stdinProjected = runCli(
      ["project", "--input", "-", "--target", fixture.target],
      readFileSync(fixture.input, "utf8"),
    );
    assert.equal(stdinProjected.status, 0, stdinProjected.stderr);

    const dashFile = join(fixture.root, "-");
    writeFileSync(dashFile, readFileSync(fixture.input));
    const fileProjected = runCli([
      "project", "--input", dashFile, "--target", fixture.target,
    ]);
    assert.equal(fileProjected.status, 0, fileProjected.stderr);

    const unavailable = runCli([
      "project",
      "--input",
      join(fixture.root, `${secret}.jsonl`),
      "--target",
      fixture.target,
    ]);
    assert.deepEqual(assertSanitized(unavailable, secret), {
      code: "projection_io_failed",
      message: "Markdown cognition CLI input could not be read.",
      stage: "input",
    });
  } finally {
    fixture.remove();
  }
});

test("bounds JSONL input before projection and rejects unsupported families", () => {
  const fixture = temporaryCliFixture();
  try {
    assert.equal(runCli(["init", "--target", fixture.target]).status, 0);
    const oversized = runCli(
      ["project", "--input", "-", "--target", fixture.target],
      `${"x".repeat(MARKDOWN_COGNITION_MAX_INPUT_BYTES)}\n`,
    );
    assert.deepEqual(singleDiagnostic(oversized), {
      code: "projection_limit_exceeded",
      message: "Markdown cognition projection exceeds a supported limit.",
      stage: "input",
    });

    const tooMany = runCli(
      ["project", "--input", "-", "--target", fixture.target],
      `${Array.from({ length: MARKDOWN_COGNITION_MAX_RECORDS + 1 }, () => "1").join("\n")}\n`,
    );
    assert.deepEqual(singleDiagnostic(tooMany), {
      code: "projection_limit_exceeded",
      message: "Markdown cognition projection exceeds a supported limit.",
      stage: "input",
    });

    const unsupported = readFileSync(portableFixtureUrl, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { readonly recordType: string })
      .find((record) => record.recordType === "transition-context");
    assert.ok(unsupported);
    const unsupportedResult = runCli(
      ["project", "--input", "-", "--target", fixture.target],
      `${JSON.stringify(unsupported)}\n`,
    );
    assert.deepEqual(singleDiagnostic(unsupportedResult), {
      code: "invalid_projection_input",
      message: "Markdown cognition projection input is invalid.",
      stage: "projection",
    });
  } finally {
    fixture.remove();
  }
});

test("reports target conflicts without leaking paths or manual content", () => {
  const fixture = temporaryCliFixture();
  const secret = "MANUAL_MARKDOWN_SECRET_MUST_NOT_ESCAPE";
  try {
    assert.equal(runCli(["init", "--target", fixture.target]).status, 0);
    assert.equal(runCli([
      "project", "--input", fixture.input, "--target", fixture.target,
    ]).status, 0);
    writeFileSync(
      join(fixture.target, markdownCognitionRelativePath(fixtureRecords()[0]!)),
      secret,
    );
    const conflict = runCli([
      "project", "--input", fixture.input, "--target", fixture.target,
    ]);
    const diagnostic = assertSanitized(conflict, secret);
    assert.deepEqual(diagnostic, {
      code: "managed_file_conflict",
      message: "A managed Markdown cognition file has changed.",
      relativePath: markdownCognitionRelativePath(fixtureRecords()[0]!),
      stage: "projection",
    });
    assert.equal(
      readFileSync(join(fixture.target, markdownCognitionRelativePath(fixtureRecords()[0]!)), "utf8"),
      secret,
    );
  } finally {
    fixture.remove();
  }
});

test("uses fixed output diagnostics when standard streams close", async () => {
  const stdout = await runCliWithClosedStream(["--help"], "stdout");
  assert.equal(stdout.status, 1);
  assert.deepEqual(JSON.parse(stdout.stderr), {
    code: "output_failed",
    message: "Markdown cognition CLI output failed.",
    stage: "output",
  });

  const stderr = await runCliWithClosedStream(["unknown"], "stderr");
  assert.equal(stderr.status, 1);
  assert.equal(stderr.stdout, "");
});
