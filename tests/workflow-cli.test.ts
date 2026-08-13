import assert from "node:assert/strict";
import {
  closeSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import test, { after } from "node:test";

import {
  createObject,
  createSourceRecord,
} from "../src/index.ts";
import {
  MARKDOWN_COGNITION_MANIFEST_FILE,
  MARKDOWN_COGNITION_MARKER_FILE,
  initializeMarkdownCognitionTarget,
} from "../src/markdown-cognition.ts";

const cliPath = new URL("../src/workflow-cli.ts", import.meta.url);
const temporaryDirectories = new Set<string>();

after(() => {
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function defensiveModeIsEnforced(): boolean {
  let database: DatabaseSync | undefined;
  try {
    database = new DatabaseSync(":memory:", {
      allowExtension: false,
      defensive: true,
      enableDoubleQuotedStringLiterals: false,
      enableForeignKeyConstraints: true,
    });
    if (typeof database.enableDefensive !== "function") return false;
    database.enableDefensive(true);
    database.exec("PRAGMA writable_schema = ON");
    const result = database.prepare("PRAGMA writable_schema").get() as {
      readonly writable_schema?: unknown;
    };
    return result.writable_schema === 0;
  } catch {
    return false;
  } finally {
    if (database?.isOpen) database.close();
  }
}

const sqliteCliTest = defensiveModeIsEnforced() ? test : test.skip;

interface WorkflowFixture {
  readonly root: string;
  readonly requestPath: string;
  readonly inputPath: string;
  readonly databasePath: string;
  readonly request: Record<string, unknown>;
  readonly records: readonly Record<string, unknown>[];
  readonly baseArguments: readonly string[];
}

interface CliResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function temporaryRoot(name = "ccsdk-workflow-cli-"): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), name)));
  temporaryDirectories.add(root);
  return root;
}

function validRequest(): Record<string, unknown> {
  const hypothesis = createObject({
    id: "hypothesis:workflow-cli",
    type: "hypothesis",
    version: 1,
    state: "proposed",
    title: "Workflow CLI hypothesis",
    data: { statement: "The explicit records are ready for review." },
    createdAt: "2026-08-13T08:00:00.000Z",
    updatedAt: "2026-08-13T08:00:00.000Z",
    attribution: {
      initiatorId: "human:author",
      executorId: "human:author",
      accountableId: "human:owner",
    },
    provenance: [{
      source: "workflow-cli-test",
      sourceId: "workflow-cli:hypothesis",
      capturedAt: "2026-08-13T08:00:00.000Z",
    }],
    contextId: "context:workflow-cli",
    relationships: [{ type: "supports-goal", targetId: "goal:workflow-cli" }],
  });
  return {
    workflowVersion: "0.1.0",
    workflowId: "workflow:workflow-cli:1",
    hypothesis,
    promotion: {
      hypothesisId: hypothesis.id,
      contextId: hypothesis.contextId,
      rationale: "The records are relevant to the explicit hypothesis.",
      promotedAt: "2026-08-13T09:00:00.000Z",
      attribution: {
        initiatorId: "human:reviewer",
        executorId: "human:reviewer",
        accountableId: "human:owner",
      },
    },
    reviewTransition: {
      eventId: "event:workflow-cli:1",
      occurredAt: "2026-08-13T10:00:00.000Z",
      initiator: { id: "human:reviewer", kind: "human" },
      executor: { id: "human:reviewer", kind: "human" },
      accountableParty: { id: "human:owner", kind: "human" },
      automationMode: "manual",
      consequenceLevel: "routine",
      rationale: "Review the hypothesis alongside the explicit evidence.",
    },
    policyId: "neutral-evidence-v1",
  };
}

function validRecord(index = 1): Record<string, unknown> {
  return createSourceRecord({
    id: `source-record:workflow-cli:${index}`,
    source: { system: "workflow-cli-test" },
    sourceId: `workflow-cli:${index}`,
    revisionId: "1",
    capturedAt: "2026-08-13T09:00:00.000Z",
    mediaType: "application/json",
    content: { summary: `Workflow CLI evidence ${index}.` },
  }) as unknown as Record<string, unknown>;
}

function fixture(format: "json" | "jsonl" = "jsonl"): WorkflowFixture {
  const root = temporaryRoot();
  const requestPath = join(root, "request.json");
  const inputPath = join(root, format === "json" ? "records.json" : "records.jsonl");
  const databasePath = join(root, "cognition.db");
  const request = validRequest();
  const records = [validRecord()];
  writeFileSync(requestPath, JSON.stringify(request));
  writeFileSync(
    inputPath,
    format === "json"
      ? JSON.stringify(records)
      : `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
  );
  return {
    root,
    requestPath,
    inputPath,
    databasePath,
    request,
    records,
    baseArguments: [
      "run",
      "--request",
      requestPath,
      "--input",
      inputPath,
      "--format",
      format,
      "--cognition-db",
      databasePath,
    ],
  };
}

function runCli(
  args: readonly string[],
  options: {
    readonly input?: string;
    readonly cwd?: string;
    readonly env?: NodeJS.ProcessEnv;
  } = {},
): CliResult {
  const result = spawnSync(
    process.execPath,
    ["--disable-warning=ExperimentalWarning", cliPath.pathname, ...args],
    {
      cwd: options.cwd,
      encoding: "utf8",
      input: options.input,
      env: options.env ?? process.env,
    },
  );
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function diagnostic(result: CliResult): Record<string, unknown> {
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^\{[^\n]+\}\n$/);
  return JSON.parse(result.stderr) as Record<string, unknown>;
}

function assertFailure(
  result: CliResult,
  stage: string,
  code?: string,
): Record<string, unknown> {
  assert.equal(result.status, 1);
  const value = diagnostic(result);
  assert.equal(value.stage, stage);
  if (code !== undefined) assert.equal(value.code, code);
  assert.deepEqual(Object.keys(value).sort(), ["code", "message", "stage"]);
  return value;
}

function withArguments(
  current: WorkflowFixture,
  replacements: Readonly<Record<string, string>>,
): string[] {
  const args = [...current.baseArguments];
  for (const [option, value] of Object.entries(replacements)) {
    const index = args.indexOf(option);
    assert.notEqual(index, -1);
    args[index + 1] = value;
  }
  return args;
}

function rowCounts(databasePath: string): Record<string, number> {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return {
      objects: (database.prepare("SELECT COUNT(*) AS count FROM cognition_objects").get() as { count: number }).count,
      events: (database.prepare("SELECT COUNT(*) AS count FROM cognition_events").get() as { count: number }).count,
      workflows: (database.prepare("SELECT COUNT(*) AS count FROM cognition_workflows").get() as { count: number }).count,
    };
  } finally {
    database.close();
  }
}

test("keeps the workflow CLI argument surface closed", () => {
  for (const args of [
    [],
    ["run"],
    ["watch"],
    ["run", "--input", "records.jsonl"],
    ["run", "--unknown", "value"],
  ]) {
    assertFailure(runCli(args), "arguments", "WORKFLOW_INVALID_ARGUMENTS");
  }
});

test("rejects relative, duplicate, repeated, positional, and invalid limit arguments", () => {
  const current = fixture();
  const invalidArguments = [
    [
      "run", "--request", "request.json", "--input", "records.jsonl",
      "--format", "jsonl", "--cognition-db", "cognition.db",
    ],
    [...current.baseArguments, "--request", current.requestPath],
    [...current.baseArguments, "--create-cognition-db", "--create-cognition-db"],
    [...current.baseArguments, "extra"],
    [...current.baseArguments, "--max-input-bytes", "0"],
    [...current.baseArguments, "--max-records", "1.5"],
    [...current.baseArguments, "--max-record-bytes", "9007199254740992"],
    [...current.baseArguments, "--max-request-bytes", "+1"],
  ];
  for (const args of invalidArguments) {
    assertFailure(runCli(args), "arguments", "WORKFLOW_INVALID_ARGUMENTS");
  }
});

test("accepts only the closed serialized request shape and built-in policy identity", () => {
  const current = fixture();
  const variants = [
    { ...current.request, extra: true },
    { ...current.request, policyId: "another-policy" },
    { ...current.request, policyId: { id: "neutral-evidence-v1" } },
  ];
  for (const request of variants) {
    writeFileSync(current.requestPath, JSON.stringify(request));
    assertFailure(runCli(current.baseArguments), "request", "WORKFLOW_INVALID_REQUEST");
    assert.equal(existsSync(current.databasePath), false);
  }

  const serialized = JSON.stringify(current.request);
  writeFileSync(
    current.requestPath,
    serialized.replace(
      '"policyId":"neutral-evidence-v1"',
      '"policyId":"neutral-evidence-v1","policyId":"neutral-evidence-v1"',
    ),
  );
  assertFailure(runCli(current.baseArguments), "request", "WORKFLOW_INVALID_REQUEST");
  assert.equal(existsSync(current.databasePath), false);
});

test("enforces the exact request byte limit before input and persistence", () => {
  const current = fixture();
  writeFileSync(current.inputPath, "not json\n");
  const requestBytes = statSync(current.requestPath).size;

  assertFailure(
    runCli([...current.baseArguments, "--max-request-bytes", String(requestBytes - 1)]),
    "request",
    "WORKFLOW_INVALID_REQUEST",
  );
  assertFailure(
    runCli([...current.baseArguments, "--max-request-bytes", String(requestBytes)]),
    "input",
    "WORKFLOW_INVALID_INPUT",
  );
  assert.equal(existsSync(current.databasePath), false);
});

test("enforces exact input, record, and record-count limits", () => {
  const current = fixture();
  const request = structuredClone(current.request);
  (request.promotion as Record<string, unknown>).hypothesisId = "hypothesis:other";
  writeFileSync(current.requestPath, JSON.stringify(request));
  const inputText = readFileSync(current.inputPath, "utf8");
  const inputBytes = Buffer.byteLength(inputText);
  const recordBytes = Buffer.byteLength(inputText.trimEnd());

  assertFailure(
    runCli([...current.baseArguments, "--max-input-bytes", String(inputBytes - 1)]),
    "input",
    "WORKFLOW_INVALID_INPUT",
  );
  assertFailure(
    runCli([
      ...current.baseArguments,
      "--max-input-bytes", String(inputBytes),
      "--max-record-bytes", String(recordBytes),
      "--max-records", "1",
    ]),
    "preparation",
    "WORKFLOW_PREPARATION_FAILED",
  );
  assertFailure(
    runCli([...current.baseArguments, "--max-record-bytes", String(recordBytes - 1)]),
    "input",
    "WORKFLOW_INVALID_INPUT",
  );

  writeFileSync(current.inputPath, `${inputText}${inputText}`);
  assertFailure(
    runCli([...current.baseArguments, "--max-records", "1"]),
    "input",
    "WORKFLOW_INVALID_INPUT",
  );
  assertFailure(
    runCli([...current.baseArguments, "--max-records", "2"]),
    "preparation",
    "WORKFLOW_PREPARATION_FAILED",
  );
  assert.equal(existsSync(current.databasePath), false);
});

test("rejects malformed lexical JSON and source revision collisions as input", () => {
  const current = fixture();
  for (const input of [
    '{"id":"a","id":"a"}\n',
    "{not-json}\n",
    `${JSON.stringify(current.records[0])}\n${JSON.stringify({
      ...current.records[0],
      content: { summary: "Colliding content." },
    })}\n`,
  ]) {
    writeFileSync(current.inputPath, input);
    assertFailure(runCli(current.baseArguments), "input", "WORKFLOW_INVALID_INPUT");
    assert.equal(existsSync(current.databasePath), false);
  }
});

test("finishes preparation before attempting to open the cognition store", () => {
  const current = fixture();
  const request = structuredClone(current.request);
  (request.promotion as Record<string, unknown>).hypothesisId = "hypothesis:other";
  writeFileSync(current.requestPath, JSON.stringify(request));
  writeFileSync(current.databasePath, "not a cognition database");
  const before = readFileSync(current.databasePath);

  assertFailure(
    runCli([...current.baseArguments, "--create-cognition-db"]),
    "preparation",
    "WORKFLOW_PREPARATION_FAILED",
  );
  assert.deepEqual(readFileSync(current.databasePath), before);
});

test("rejects lexical, realpath, symlink, hardlink, sidecar, and Markdown metadata aliases before mutation", async () => {
  const cases: Array<(current: WorkflowFixture) => Promise<string[]> | string[]> = [
    (current) => withArguments(current, { "--input": current.requestPath }),
    (current) => withArguments(current, { "--cognition-db": current.requestPath }),
    (current) => {
      const databasePath = join(current.root, "reserved.db");
      const requestPath = `${databasePath}-wal`;
      writeFileSync(requestPath, JSON.stringify(current.request));
      return withArguments(current, {
        "--request": requestPath,
        "--cognition-db": databasePath,
      });
    },
    (current) => {
      const requestLink = join(current.root, "request-link.json");
      symlinkSync(current.requestPath, requestLink);
      return withArguments(current, { "--request": requestLink });
    },
    (current) => {
      rmSync(current.inputPath);
      linkSync(current.requestPath, current.inputPath);
      return [...current.baseArguments];
    },
    (current) => {
      const databaseLink = join(current.root, "cognition-link.db");
      symlinkSync(current.inputPath, databaseLink);
      return withArguments(current, { "--cognition-db": databaseLink });
    },
    async (current) => {
      const target = join(current.root, "markdown");
      await initializeMarkdownCognitionTarget({ targetDirectory: target });
      rmSync(join(target, MARKDOWN_COGNITION_MARKER_FILE));
      linkSync(current.requestPath, join(target, MARKDOWN_COGNITION_MARKER_FILE));
      return [...current.baseArguments, "--markdown-target", target];
    },
    async (current) => {
      const target = join(current.root, "markdown");
      await initializeMarkdownCognitionTarget({ targetDirectory: target });
      return withArguments(current, {
        "--cognition-db": join(target, MARKDOWN_COGNITION_MANIFEST_FILE),
      }).concat("--markdown-target", target);
    },
    (current) => {
      const actual = join(current.root, "actual");
      const alias = join(current.root, "alias");
      writeFileSync(actual, "not used");
      rmSync(actual);
      symlinkSync(current.root, alias, "dir");
      return withArguments(current, {
        "--request": join(alias, "request.json"),
      });
    },
  ];

  for (const configure of cases) {
    const current = fixture();
    const args = await configure(current);
    assertFailure(runCli(args), "preparation", "WORKFLOW_PATH_CONFLICT");
    if (!args.includes("--create-cognition-db")) {
      assert.equal(existsSync(current.databasePath), false);
    }
  }
});

test("sanitizes read failures without paths, contents, exceptions, or stacks", () => {
  const current = fixture();
  const secretPath = join(current.root, "PRIVATE-REQUEST-NAME.json");
  const result = runCli(withArguments(current, { "--request": secretPath }));
  const value = assertFailure(result, "request", "WORKFLOW_INVALID_REQUEST");

  assert.equal(value.message, "Durable workflow request is invalid.");
  assert.equal(result.stderr.includes(current.root), false);
  assert.equal(result.stderr.includes("PRIVATE-REQUEST-NAME"), false);
  assert.equal(result.stderr.includes("Error"), false);
  assert.equal(result.stderr.includes("stack"), false);
});

sqliteCliTest("persists equivalent JSON and JSONL input with one closed result each", () => {
  const json = fixture("json");
  const jsonl = fixture("jsonl");
  const jsonResult = runCli([...json.baseArguments, "--create-cognition-db"]);
  const jsonlResult = runCli([...jsonl.baseArguments, "--create-cognition-db"]);

  for (const result of [jsonResult, jsonlResult]) {
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert.match(result.stdout, /^\{[^\n]+\}\n$/);
    const value = JSON.parse(result.stdout) as Record<string, unknown>;
    assert.equal(value.status, "committed");
    assert.equal(value.persistence, "committed");
    assert.equal(value.publication, "not_requested");
    assert.equal(value.projection, "not_requested");
  }
  const jsonValue = JSON.parse(jsonResult.stdout) as Record<string, unknown>;
  const jsonlValue = JSON.parse(jsonlResult.stdout) as Record<string, unknown>;
  assert.equal(jsonValue.requestDigest, jsonlValue.requestDigest);
  assert.deepEqual(jsonValue.records, jsonlValue.records);
});

sqliteCliTest("supports bounded stdin, explicit creation, replay, and reopen", () => {
  const current = fixture();
  const input = readFileSync(current.inputPath, "utf8");
  const stdinArguments = withArguments(current, { "--input": "-" });
  const first = runCli([...stdinArguments, "--create-cognition-db"], { input });
  const replay = runCli(stdinArguments, { input });

  assert.equal(first.status, 0, first.stderr);
  assert.equal(replay.status, 0, replay.stderr);
  assert.equal((JSON.parse(first.stdout) as { persistence: string }).persistence, "committed");
  assert.equal((JSON.parse(replay.stdout) as { persistence: string }).persistence, "already_committed");
  assert.deepEqual(rowCounts(current.databasePath), {
    objects: 3,
    events: 1,
    workflows: 1,
  });

  const missing = fixture();
  assertFailure(
    runCli(missing.baseArguments),
    "persistence",
    "WORKFLOW_PERSISTENCE_FAILED",
  );
  assert.equal(existsSync(missing.databasePath), false);
});

sqliteCliTest("projects only after persistence and never configures a publisher", () => {
  const current = fixture();
  const markdownTarget = join(current.root, "not-initialized-markdown");
  const result = runCli([
    ...current.baseArguments,
    "--create-cognition-db",
    "--markdown-target",
    markdownTarget,
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  const value = JSON.parse(result.stdout) as Record<string, unknown>;
  assert.equal(value.status, "committed_but_unprojected");
  assert.equal(value.persistence, "committed");
  assert.equal(value.publication, "not_requested");
  assert.equal(value.projection, "failed");
  assert.deepEqual(rowCounts(current.databasePath), {
    objects: 3,
    events: 1,
    workflows: 1,
  });
});

sqliteCliTest("does not discover a source ledger, repository, vault, or home path", () => {
  const current = fixture();
  const isolated = temporaryRoot("ccsdk-workflow-cli-isolated-");
  const home = join(isolated, "home");
  const ledger = join(isolated, "ledger.db");
  const repository = join(isolated, ".git");
  const vault = join(isolated, "Obsidian");
  writeFileSync(home, "home trap");
  writeFileSync(ledger, "ledger trap");
  writeFileSync(repository, "repository trap");
  writeFileSync(vault, "vault trap");
  const before = [home, ledger, repository, vault].map((path) => ({
    path,
    bytes: readFileSync(path),
    mtime: statSync(path).mtimeMs,
  }));

  const result = runCli([...current.baseArguments, "--create-cognition-db"], {
    cwd: isolated,
    env: {
      ...process.env,
      HOME: home,
      CCSDK_ACCEPTANCE_LEDGER: ledger,
      TEAM_MEMORY_LEDGER: ledger,
    },
  });

  assert.equal(result.status, 0, result.stderr);
  for (const entry of before) {
    assert.deepEqual(readFileSync(entry.path), entry.bytes);
    assert.equal(statSync(entry.path).mtimeMs, entry.mtime);
  }
});

sqliteCliTest("emits a fixed output diagnostic when stdout is not writable", () => {
  const current = fixture();
  const outputPath = join(current.root, "closed-output");
  writeFileSync(outputPath, "unchanged");
  const readOnlyDescriptor = openSync(outputPath, "r");
  try {
    const result = spawnSync(
      process.execPath,
      [
        "--disable-warning=ExperimentalWarning",
        cliPath.pathname,
        ...current.baseArguments,
        "--create-cognition-db",
      ],
      {
        cwd: current.root,
        encoding: "utf8",
        stdio: ["pipe", readOnlyDescriptor, "pipe"],
      },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /^\{[^\n]+\}\n$/);
    assert.deepEqual(JSON.parse(result.stderr), {
      code: "WORKFLOW_OUTPUT_FAILED",
      message: "Durable workflow output failed.",
      stage: "output",
    });
    assert.equal(readFileSync(outputPath, "utf8"), "unchanged");
  } finally {
    closeSync(readOnlyDescriptor);
  }
});

test("leaves request and input regular-file identities unchanged", () => {
  const current = fixture();
  const requestBefore = lstatSync(current.requestPath, { bigint: true });
  const inputBefore = lstatSync(current.inputPath, { bigint: true });
  runCli(current.baseArguments);
  const requestAfter = lstatSync(current.requestPath, { bigint: true });
  const inputAfter = lstatSync(current.inputPath, { bigint: true });

  assert.equal(requestAfter.dev, requestBefore.dev);
  assert.equal(requestAfter.ino, requestBefore.ino);
  assert.equal(inputAfter.dev, inputBefore.dev);
  assert.equal(inputAfter.ino, inputBefore.ino);
  assert.equal(dirname(current.requestPath), current.root);
});
