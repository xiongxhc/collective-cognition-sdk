import assert from "node:assert/strict";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  GIT_REPOSITORY_FORMAT,
  GitConnectorError,
  readGitCommitSourceRecords,
} from "../src/connectors/git.ts";
import type {
  GitCommitSourceRecordOptions,
  GitConnectorErrorCode,
  GitConnectorStage,
} from "../src/connectors/git.ts";
import {
  runSourceConnectorConformance,
} from "../src/connector-conformance.ts";

interface GitFixture {
  readonly directory: string;
  readonly repositoryPath: string;
  readonly commits: Readonly<Record<string, string>>;
}

interface RepositorySnapshot {
  readonly head: string;
  readonly refs: string;
  readonly index: { readonly size: bigint; readonly mtimeNs: bigint } | null;
  readonly config: { readonly size: bigint; readonly mtimeNs: bigint };
  readonly status: string;
  readonly worktreeEntries: readonly string[];
}

interface ControlledGitRead {
  readonly result: Record<string, unknown>;
  readonly elapsedMilliseconds: number;
}

const gitEnvironment = {
  ...process.env,
  GIT_AUTHOR_DATE: "2026-08-20T10:00:00+00:00",
  GIT_AUTHOR_EMAIL: "zoe.author@fictional.example",
  GIT_AUTHOR_NAME: "Zoë Fictional",
  GIT_COMMITTER_DATE: "2026-08-20T10:00:00+00:00",
  GIT_COMMITTER_EMAIL: "commit.writer@fictional.example",
  GIT_COMMITTER_NAME: "Fictional Committer",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_TERMINAL_PROMPT: "0",
};

function runGit(repositoryPath: string, args: readonly string[]): string {
  const result = spawnSync("git", ["-C", repositoryPath, ...args], {
    encoding: "utf8",
    env: gitEnvironment,
  });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      `Git fixture command failed: ${[...args].join(" ")}\n${result.stderr}`,
    );
  }
  return result.stdout;
}

function runReadOnlyGit(repositoryPath: string, args: readonly string[]): string {
  const result = spawnSync("git", ["-C", repositoryPath, ...args], {
    encoding: "utf8",
    env: { ...gitEnvironment, GIT_OPTIONAL_LOCKS: "0" },
  });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      `Git read-only fixture command failed: ${[...args].join(" ")}\n${result.stderr}`,
    );
  }
  return result.stdout;
}

function writeCommitObject(
  repositoryPath: string,
  contents: string,
  literally = false,
): string {
  const result = spawnSync(
    "git",
    [
      "-C",
      repositoryPath,
      "hash-object",
      "-t",
      "commit",
      "-w",
      "--stdin",
      ...(literally ? ["--literally"] : []),
    ],
    {
      encoding: "utf8",
      env: gitEnvironment,
      input: contents,
    },
  );
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(`Git fixture object write failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function createGitFixture(): GitFixture {
  const directory = mkdtempSync(join(tmpdir(), "collective-cognition-git-"));
  const repositoryPath = join(directory, "repository");
  mkdirSync(repositoryPath);
  runGit(repositoryPath, ["init", "--initial-branch=main"]);

  writeFileSync(join(repositoryPath, "root.txt"), "root\n");
  runGit(repositoryPath, ["add", "root.txt"]);
  runGit(repositoryPath, ["commit", "--no-gpg-sign", "-m", "Root commit"]);
  const root = runGit(repositoryPath, ["rev-parse", "HEAD"]).trim();

  writeFileSync(join(repositoryPath, "main.txt"), "main\n");
  runGit(repositoryPath, ["add", "main.txt"]);
  runGit(repositoryPath, [
    "commit",
    "--no-gpg-sign",
    "-m",
    "Linear Unicode author commit",
  ]);
  const main = runGit(repositoryPath, ["rev-parse", "HEAD"]).trim();

  runGit(repositoryPath, ["branch", "side", root]);
  runGit(repositoryPath, ["switch", "side"]);
  writeFileSync(join(repositoryPath, "side.txt"), "side\n");
  runGit(repositoryPath, ["add", "side.txt"]);
  runGit(repositoryPath, ["commit", "--no-gpg-sign", "-m", "Side commit"]);
  const side = runGit(repositoryPath, ["rev-parse", "HEAD"]).trim();

  runGit(repositoryPath, ["switch", "main"]);
  runGit(repositoryPath, [
    "merge",
    "--no-ff",
    "--no-gpg-sign",
    "side",
    "-m",
    "Merge side history\n\nPreserve this multiline message only by opt-in.",
  ]);
  const merge = runGit(repositoryPath, ["rev-parse", "HEAD"]).trim();
  const rootTree = runGit(repositoryPath, ["rev-parse", `${root}^{tree}`]).trim();
  const emptyAuthorEmail = writeCommitObject(
    repositoryPath,
    `tree ${rootTree}\nparent ${root}\nauthor No Email <> 1787220000 +0000\ncommitter Fictional Committer <commit.writer@fictional.example> 1787220000 +0000\n\nEmpty author email\n`,
  );

  return {
    directory,
    repositoryPath,
    commits: Object.freeze({ root, main, side, merge, emptyAuthorEmail }),
  };
}

function removeGitFixture(directory: string): void {
  rmSync(directory, { force: true, recursive: true });
}

function snapshotFile(path: string): { readonly size: bigint; readonly mtimeNs: bigint } {
  const file = statSync(path, { bigint: true });
  return { size: file.size, mtimeNs: file.mtimeNs };
}

function recursiveEntries(directory: string): readonly string[] {
  const entries: string[] = [];
  const visit = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      entries.push(relative(directory, path));
      if (entry.isDirectory()) {
        visit(path);
      }
    }
  };
  visit(directory);
  return entries.sort();
}

function snapshotRepository(repositoryPath: string): RepositorySnapshot {
  const gitDirectory = runReadOnlyGit(repositoryPath, ["rev-parse", "--git-dir"]).trim();
  const resolvedGitDirectory = resolve(repositoryPath, gitDirectory);
  const indexPath = join(resolvedGitDirectory, "index");
  return {
    head: readFileSync(join(resolvedGitDirectory, "HEAD"), "utf8"),
    refs: runReadOnlyGit(repositoryPath, ["show-ref", "--head"]).trim(),
    index: (() => {
      try {
        return snapshotFile(indexPath);
      } catch {
        return null;
      }
    })(),
    config: snapshotFile(join(resolvedGitDirectory, "config")),
    status: runReadOnlyGit(repositoryPath, ["status", "--porcelain=v1", "--untracked-files=all"]),
    worktreeEntries: recursiveEntries(repositoryPath),
  };
}

function writeGitExecutable(directory: string, source: string): string {
  const binDirectory = join(directory, "bin");
  mkdirSync(binDirectory);
  const executable = join(binDirectory, "git");
  writeFileSync(executable, `#!${process.execPath}\n${source}\n`);
  chmodSync(executable, 0o755);
  return binDirectory;
}

function readInControlledGitEnvironment(
  fixture: GitFixture,
  path: string,
): Record<string, unknown> {
  return controlledGitRead(fixture, path).result;
}

function controlledGitRead(
  fixture: GitFixture,
  path: string,
): ControlledGitRead {
  const connectorUrl = pathToFileURL(resolve("src/connectors/git.ts")).href;
  const input = [
    `import { readGitCommitSourceRecords } from ${JSON.stringify(connectorUrl)};`,
    "try {",
    `  readGitCommitSourceRecords(${JSON.stringify(connectorOptions(fixture))});`,
    "  process.stdout.write(JSON.stringify({ result: \"returned\" }));",
    "} catch (error) {",
    "  process.stdout.write(JSON.stringify({",
    "    name: error instanceof Error ? error.name : undefined,",
    "    message: error instanceof Error ? error.message : undefined,",
    "    code: error && typeof error === \"object\" ? error.code : undefined,",
    "    stage: error && typeof error === \"object\" ? error.stage : undefined,",
    "    details: error && typeof error === \"object\" ? error.details : undefined,",
    "  }));",
    "}",
  ].join("\n");
  const startedAt = Date.now();
  const processResult = spawnSync(process.execPath, ["--input-type=module", "--eval", input], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, PATH: path },
  });
  const elapsedMilliseconds = Date.now() - startedAt;
  assert.equal(processResult.error, undefined);
  assert.equal(processResult.status, 0, processResult.stderr);
  return {
    result: JSON.parse(processResult.stdout) as Record<string, unknown>,
    elapsedMilliseconds,
  };
}

function assertControlledError(
  result: Record<string, unknown>,
  code: GitConnectorErrorCode,
  stage: GitConnectorStage,
  details: Record<string, string | number | boolean> = {},
): void {
  assert.deepEqual(result, {
    name: "GitConnectorError",
    message: {
      invalid_options: "Git connector options are invalid.",
      target_unavailable: "Git repository is unavailable.",
      incompatible_repository: "Git repository is incompatible.",
      invalid_commit: "Git repository contains an invalid commit.",
      read_failed: "Git repository could not be read.",
    }[code],
    code,
    stage,
    details,
  });
}

function assertGitConnectorError(
  action: () => unknown,
  code: GitConnectorErrorCode,
  stage: GitConnectorStage,
  details?: Record<string, string | number | boolean>,
): GitConnectorError {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown instanceof GitConnectorError);
  assert.equal(thrown.name, "GitConnectorError");
  assert.equal(thrown.message, {
    invalid_options: "Git connector options are invalid.",
    target_unavailable: "Git repository is unavailable.",
    incompatible_repository: "Git repository is incompatible.",
    invalid_commit: "Git repository contains an invalid commit.",
    read_failed: "Git repository could not be read.",
  }[code]);
  assert.equal(thrown.code, code);
  assert.equal(thrown.stage, stage);
  if (details !== undefined) {
    assert.deepEqual(thrown.details, details);
  }
  assert.equal(Object.isFrozen(thrown), true);
  assert.equal(Object.isFrozen(thrown.details), true);
  return thrown;
}

function connectorOptions(
  fixture: GitFixture,
  overrides: Partial<GitCommitSourceRecordOptions> = {},
): GitCommitSourceRecordOptions {
  return {
    repositoryPath: fixture.repositoryPath,
    sourceInstance: "fictional-git-main",
    tipCommitId: fixture.commits.merge,
    capturedAt: "2026-08-21T12:00:00.000Z",
    limit: 3,
    ...overrides,
  };
}

test("reads a first-parent Git window into immutable neutral SourceRecords", () => {
  const fixture = createGitFixture();
  try {
    const records = readGitCommitSourceRecords(connectorOptions(fixture));

    assert.equal(GIT_REPOSITORY_FORMAT, "git-repository/1");
    assert.deepEqual(records.map(({ revisionId }) => revisionId), [
      fixture.commits.root,
      fixture.commits.main,
      fixture.commits.merge,
    ]);
    assert.equal(records.at(-1)?.source.system, "git-repository");
    assert.equal(records.at(-1)?.source.instance, "fictional-git-main");
    const latestRecord = records.at(-1);
    assert.ok(latestRecord !== undefined);
    const latestContent = latestRecord.content as {
      readonly author: object;
      readonly parents: readonly string[];
      readonly summary: string;
    };
    assert.deepEqual(
      latestContent.parents,
      [fixture.commits.main, fixture.commits.side],
    );
    assert.equal("message" in latestContent, false);
    assert.equal("email" in latestContent.author, false);
    assert.equal(Object.isFrozen(records), true);
    assert.equal(records[1]?.observedAt, "2026-08-20T10:00:00.000Z");
    assert.equal(latestContent.summary, "Merge side history");
  } finally {
    removeGitFixture(fixture.directory);
  }
});

test("selects exact tips, honors privacy opt-ins, and remains deterministic", async () => {
  const fixture = createGitFixture();
  try {
    const exactTip = readGitCommitSourceRecords(connectorOptions(fixture, {
      limit: 1,
      tipCommitId: fixture.commits.main,
    }));
    assert.deepEqual(exactTip.map(({ revisionId }) => revisionId), [fixture.commits.main]);

    const privateRecords = readGitCommitSourceRecords(connectorOptions(fixture, {
      includeAuthorEmail: true,
      includeMessage: true,
    }));
    const mergeContent = privateRecords.at(-1)?.content as {
      readonly author: { readonly email?: string };
      readonly message?: string;
    };
    assert.equal(mergeContent.author.email, "zoe.author@fictional.example");
    assert.equal(
      mergeContent.message,
      "Merge side history\n\nPreserve this multiline message only by opt-in.\n",
    );

    const emptyEmailRecord = readGitCommitSourceRecords(connectorOptions(fixture, {
      includeAuthorEmail: true,
      limit: 1,
      tipCommitId: fixture.commits.emptyAuthorEmail,
    }));
    assert.equal(
      "email" in (emptyEmailRecord[0]?.content as { readonly author: object }).author,
      false,
    );

    const first = readGitCommitSourceRecords(connectorOptions(fixture));
    const second = readGitCommitSourceRecords(connectorOptions(fixture));
    assert.deepEqual(first, second);
    assert.notEqual(
      first[0]?.id,
      readGitCommitSourceRecords(connectorOptions(fixture, {
        sourceInstance: "fictional-git-secondary",
      }))[0]?.id,
    );

    const results = await runSourceConnectorConformance([{
      name: "fictional Git connector",
      collect: () => readGitCommitSourceRecords(connectorOptions(fixture)),
      collectAgain: () => readGitCommitSourceRecords(connectorOptions(fixture)),
    }]);
    assert.deepEqual(results, [{
      name: "fictional Git connector",
      status: "passed",
      diagnostics: [],
    }]);
  } finally {
    removeGitFixture(fixture.directory);
  }
});

test("rejects every malformed closed option before repository access", () => {
  const fixture = createGitFixture();
  try {
    const unavailableOptions = connectorOptions(fixture, {
      repositoryPath: join(fixture.directory, "missing-before-options"),
    });
    const invalidValues: readonly {
      readonly field: string;
      readonly overrides: Partial<GitCommitSourceRecordOptions>;
    }[] = [
      { field: "repositoryPath", overrides: { repositoryPath: "relative/repository" } },
      { field: "repositoryPath", overrides: { repositoryPath: "~/repository" } },
      { field: "repositoryPath", overrides: { repositoryPath: "https://example.invalid/repository" } },
      { field: "repositoryPath", overrides: { repositoryPath: `${fixture.repositoryPath}\u0000suffix` } },
      { field: "sourceInstance", overrides: { sourceInstance: " fictional-git-main" } },
      { field: "sourceInstance", overrides: { sourceInstance: "fictional\u0000git" } },
      { field: "tipCommitId", overrides: { tipCommitId: fixture.commits.merge.toUpperCase() } },
      { field: "tipCommitId", overrides: { tipCommitId: "abcdef" } },
      { field: "tipCommitId", overrides: { tipCommitId: "HEAD" } },
      { field: "tipCommitId", overrides: { tipCommitId: `${fixture.commits.merge}^` } },
      { field: "capturedAt", overrides: { capturedAt: "2026-08-21T12:00:00" } },
      { field: "limit", overrides: { limit: Number.NaN } },
      { field: "limit", overrides: { limit: 1.5 } },
      { field: "limit", overrides: { limit: 0 } },
      { field: "limit", overrides: { limit: 1001 } },
      { field: "includeMessage", overrides: { includeMessage: "yes" as never } },
      { field: "includeAuthorEmail", overrides: { includeAuthorEmail: 1 as never } },
    ];
    for (const { field, overrides } of invalidValues) {
      assertGitConnectorError(
        () => readGitCommitSourceRecords({ ...unavailableOptions, ...overrides }),
        "invalid_options",
        "options",
        { field },
      );
    }

    let accessorReads = 0;
    const accessorOptions = {
      ...unavailableOptions,
    } as Record<string, unknown>;
    Object.defineProperty(accessorOptions, "limit", {
      enumerable: true,
      get() {
        accessorReads += 1;
        return 3;
      },
    });
    assertGitConnectorError(
      () => readGitCommitSourceRecords(accessorOptions as unknown as GitCommitSourceRecordOptions),
      "invalid_options",
      "options",
    );
    assert.equal(accessorReads, 0);

    const nonEnumerableOptions = { ...unavailableOptions } as Record<string, unknown>;
    Object.defineProperty(nonEnumerableOptions, "limit", {
      configurable: true,
      enumerable: false,
      value: 3,
    });
    assertGitConnectorError(
      () => readGitCommitSourceRecords(nonEnumerableOptions as unknown as GitCommitSourceRecordOptions),
      "invalid_options",
      "options",
      {},
    );

    const symbolOptions = { ...unavailableOptions } as Record<string | symbol, unknown>;
    Object.defineProperty(symbolOptions, Symbol("unexpected"), {
      enumerable: true,
      value: "must-not-be-read",
    });
    assertGitConnectorError(
      () => readGitCommitSourceRecords(symbolOptions as unknown as GitCommitSourceRecordOptions),
      "invalid_options",
      "options",
      {},
    );

    assertGitConnectorError(
      () => readGitCommitSourceRecords({
        ...connectorOptions(fixture),
        unexpected: "must-not-be-read",
      } as GitCommitSourceRecordOptions),
      "invalid_options",
      "options",
    );
  } finally {
    removeGitFixture(fixture.directory);
  }
});

test("rejects inherited custom-prototype options before repository access", () => {
  const fixture = createGitFixture();
  try {
    const inheritedOptions = Object.create({
      inheritedOption: "must-not-be-accepted",
    }) as Record<string, unknown>;
    Object.assign(inheritedOptions, connectorOptions(fixture, {
      repositoryPath: join(fixture.directory, "missing"),
    }));

    const error = assertGitConnectorError(
      () => readGitCommitSourceRecords(
        inheritedOptions as unknown as GitCommitSourceRecordOptions,
      ),
      "invalid_options",
      "options",
    );
    assert.deepEqual(error.details, {});
  } finally {
    removeGitFixture(fixture.directory);
  }
});

test("reports unavailable targets and incompatible repositories with fixed diagnostics", () => {
  const fixture = createGitFixture();
  const nonRepository = join(fixture.directory, "not-a-repository");
  mkdirSync(nonRepository);
  try {
    const unavailable = assertGitConnectorError(
      () => readGitCommitSourceRecords(connectorOptions(fixture, {
        repositoryPath: join(fixture.directory, "missing"),
      })),
      "target_unavailable",
      "open",
    );
    assert.equal(unavailable.message, "Git repository is unavailable.");

    const incompatible = assertGitConnectorError(
      () => readGitCommitSourceRecords(connectorOptions(fixture, {
        repositoryPath: nonRepository,
      })),
      "incompatible_repository",
      "open",
    );
    assert.equal(incompatible.message, "Git repository is incompatible.");
  } finally {
    removeGitFixture(fixture.directory);
  }
});

test("classifies unavailable, incompatible, missing, and malformed local objects", () => {
  const fixture = createGitFixture();
  try {
    const blobTip = runGit(
      fixture.repositoryPath,
      ["rev-parse", `${fixture.commits.root}:root.txt`],
    ).trim();
    assertGitConnectorError(
      () => readGitCommitSourceRecords(connectorOptions(fixture, { tipCommitId: blobTip })),
      "incompatible_repository",
      "history",
      {},
    );

    const malformedCommit = writeCommitObject(
      fixture.repositoryPath,
      [
        `tree ${runGit(fixture.repositoryPath, ["rev-parse", `${fixture.commits.root}^{tree}`]).trim()}`,
        `parent ${fixture.commits.root}`,
        "author Fictional Author <author@fictional.example> not-a-timestamp +0000",
        "committer Fictional Committer <commit.writer@fictional.example> 1787220000 +0000",
        "",
        "Malformed metadata",
        "",
      ].join("\n"),
      true,
    );
    const malformedSnapshot = snapshotRepository(fixture.repositoryPath);
    assertGitConnectorError(
      () => readGitCommitSourceRecords(connectorOptions(fixture, {
        limit: 1,
        tipCommitId: malformedCommit,
      })),
      "invalid_commit",
      "mapping",
      { commitIndex: 0 },
    );
    assert.deepEqual(snapshotRepository(fixture.repositoryPath), malformedSnapshot);

    const deletedCommit = writeCommitObject(
      fixture.repositoryPath,
      [
        `tree ${runGit(fixture.repositoryPath, ["rev-parse", `${fixture.commits.root}^{tree}`]).trim()}`,
        `parent ${fixture.commits.root}`,
        "author Fictional Author <author@fictional.example> 1787220000 +0000",
        "committer Fictional Committer <commit.writer@fictional.example> 1787220000 +0000",
        "",
        "Deleted object",
        "",
      ].join("\n"),
    );
    const objectPath = join(
      fixture.repositoryPath,
      ".git",
      "objects",
      deletedCommit.slice(0, 2),
      deletedCommit.slice(2),
    );
    rmSync(objectPath);
    assertGitConnectorError(
      () => readGitCommitSourceRecords(connectorOptions(fixture, {
        limit: 1,
        tipCommitId: deletedCommit,
      })),
      "incompatible_repository",
      "history",
      {},
    );
  } finally {
    removeGitFixture(fixture.directory);
  }
});

test("rejects partial and promisor repositories without changing their state", () => {
  const configurations: readonly {
    readonly key?: string;
    readonly label: string;
    readonly value?: string;
  }[] = [
    { key: "extensions.partialClone", label: "partial clone", value: "origin" },
    { key: "remote.origin.promisor", label: "true", value: "true" },
    { key: "remote.origin.promisor", label: "yes", value: "yes" },
    { key: "remote.origin.promisor", label: "uppercase true", value: "TRUE" },
    { key: "remote.origin.promisor", label: "on", value: "on" },
    { key: "remote.origin.promisor", label: "one", value: "1" },
    { label: "valueless" },
    { key: "remote.dotted.name.promisor", label: "dotted remote", value: "true" },
  ];
  for (const configuration of configurations) {
    const fixture = createGitFixture();
    try {
      if (configuration.key === undefined) {
        const configPath = join(fixture.repositoryPath, ".git", "config");
        writeFileSync(
          configPath,
          `${readFileSync(configPath, "utf8")}\n[remote \"valueless\"]\n\tpromisor\n`,
        );
      } else {
        runGit(fixture.repositoryPath, ["config", configuration.key, configuration.value ?? ""]);
      }
      const before = snapshotRepository(fixture.repositoryPath);
      assertGitConnectorError(
        () => readGitCommitSourceRecords(connectorOptions(fixture)),
        "incompatible_repository",
        "open",
        {},
      ).message;
      assert.deepEqual(snapshotRepository(fixture.repositoryPath), before, configuration.label);
    } finally {
      removeGitFixture(fixture.directory);
    }
  }
});

test("preserves repository state after successful and failed collection", () => {
  const fixture = createGitFixture();
  try {
    const beforeSuccessfulRead = snapshotRepository(fixture.repositoryPath);
    readGitCommitSourceRecords(connectorOptions(fixture));
    assert.deepEqual(snapshotRepository(fixture.repositoryPath), beforeSuccessfulRead);

    const incompatibleBefore = snapshotRepository(fixture.repositoryPath);
    const blobTip = runGit(
      fixture.repositoryPath,
      ["rev-parse", `${fixture.commits.root}:root.txt`],
    ).trim();
    assertGitConnectorError(
      () => readGitCommitSourceRecords(connectorOptions(fixture, { tipCommitId: blobTip })),
      "incompatible_repository",
      "history",
      {},
    );
    assert.deepEqual(snapshotRepository(fixture.repositoryPath), incompatibleBefore);
  } finally {
    removeGitFixture(fixture.directory);
  }
});

test("classifies repository recognition without stderr content", () => {
  const fixture = createGitFixture();
  const nonEnglishDirectory = mkdtempSync(join(tmpdir(), "collective-cognition-git-non-english-"));
  const overflowDirectory = mkdtempSync(join(tmpdir(), "collective-cognition-git-recognition-overflow-"));
  try {
    const nonEnglishPath = writeGitExecutable(
      nonEnglishDirectory,
      [
        "const [, , command] = process.argv.slice(2);",
        "if (command === 'rev-parse') { process.stderr.write('kein Git-Repository\\n'); process.exit(1); }",
        "process.exit(1);",
      ].join("\n"),
    );
    assertControlledError(
      readInControlledGitEnvironment(fixture, nonEnglishPath),
      "incompatible_repository",
      "open",
    );

    const overflowPath = writeGitExecutable(
      overflowDirectory,
      [
        "const [, , command] = process.argv.slice(2);",
        "if (command === 'rev-parse') require('node:fs').writeSync(2, 'not a git repository\\n' + 'x'.repeat(128 * 1024 + 1));",
        "process.exit(1);",
      ].join("\n"),
    );
    assertControlledError(
      readInControlledGitEnvironment(fixture, overflowPath),
      "read_failed",
      "open",
    );
  } finally {
    removeGitFixture(fixture.directory);
    rmSync(nonEnglishDirectory, { force: true, recursive: true });
    rmSync(overflowDirectory, { force: true, recursive: true });
  }
});

test("bounds Git execution failures at the tip probe", () => {
  const fixture = createGitFixture();
  const failureDirectory = mkdtempSync(join(tmpdir(), "collective-cognition-git-process-"));
  const timeoutDirectory = mkdtempSync(join(tmpdir(), "collective-cognition-git-timeout-"));
  const overflowDirectory = mkdtempSync(join(tmpdir(), "collective-cognition-git-overflow-"));
  try {
    assertControlledError(
      readInControlledGitEnvironment(fixture, ""),
      "target_unavailable",
      "open",
    );

    const failurePath = writeGitExecutable(
      failureDirectory,
      [
        "const [, , command, ...rest] = process.argv.slice(2);",
        "if (command === 'rev-parse' && rest[0] === '--git-dir') process.stdout.write('.git\\n');",
        "else if (command === 'config') process.exit(1);",
        "else process.exit(1);",
      ].join("\n"),
    );
    assertControlledError(
      readInControlledGitEnvironment(fixture, failurePath),
      "read_failed",
      "open",
    );

    const timeoutPath = writeGitExecutable(
      timeoutDirectory,
      [
        "const [, , command, ...rest] = process.argv.slice(2);",
        "if (command === 'rev-parse' && rest[0] === '--git-dir') process.stdout.write('.git\\n');",
        "else if (command === 'rev-parse' && rest[0] === '--show-object-format') process.stdout.write('sha1\\n');",
        "else if (command === 'config') process.stdout.write('');",
        "else if (command === 'cat-file' && rest[0] === '-e') { process.on('SIGTERM', () => {}); setInterval(() => {}, 1_000); }",
        "else process.exit(1);",
      ].join("\n"),
    );
    const timeout = controlledGitRead(fixture, timeoutPath);
    assertControlledError(
      timeout.result,
      "read_failed",
      "history",
    );
    assert.ok(timeout.elapsedMilliseconds >= 4_500);
    assert.ok(timeout.elapsedMilliseconds < 5_750, `${timeout.elapsedMilliseconds}ms exceeded the wall-clock bound.`);

    const overflowPath = writeGitExecutable(
      overflowDirectory,
      [
        "const [, , command, ...rest] = process.argv.slice(2);",
        "if (command === 'rev-parse' && rest[0] === '--git-dir') process.stdout.write('.git\\n');",
        "else if (command === 'rev-parse' && rest[0] === '--show-object-format') process.stdout.write('sha1\\n');",
        "else if (command === 'config') process.stdout.write('');",
        "else if (command === 'cat-file' && rest[0] === '-e') process.stderr.write('x'.repeat(128 * 1024 + 1));",
        "else process.exit(1);",
      ].join("\n"),
    );
    assertControlledError(
      readInControlledGitEnvironment(fixture, overflowPath),
      "read_failed",
      "history",
    );
  } finally {
    removeGitFixture(fixture.directory);
    rmSync(failureDirectory, { force: true, recursive: true });
    rmSync(timeoutDirectory, { force: true, recursive: true });
    rmSync(overflowDirectory, { force: true, recursive: true });
  }
});

test("bounds aggregate Git objects and rejects oversized declared commits", () => {
  const fixture = createGitFixture();
  const aggregateDirectory = mkdtempSync(join(tmpdir(), "collective-cognition-git-batch-overflow-"));
  const declaredSizeDirectory = mkdtempSync(join(tmpdir(), "collective-cognition-git-commit-overflow-"));
  try {
    const aggregatePath = writeGitExecutable(
      aggregateDirectory,
      [
        "const [, , command, ...rest] = process.argv.slice(2);",
        "if (command === 'rev-parse' && rest[0] === '--git-dir') process.stdout.write('.git\\n');",
        "else if (command === 'rev-parse' && rest[0] === '--show-object-format') process.stdout.write('sha1\\n');",
        "else if (command === 'config' || (command === 'cat-file' && rest[0] === '-e')) process.exit(0);",
        `else if (command === 'rev-list') process.stdout.write(${JSON.stringify(`${fixture.commits.merge}\n`)});`,
        "else if (command === 'cat-file' && rest[0] === '--batch') process.stdout.write('x'.repeat(8 * 1024 * 1024 + 1));",
        "else process.exit(1);",
      ].join("\n"),
    );
    assertControlledError(
      readInControlledGitEnvironment(fixture, aggregatePath),
      "read_failed",
      "history",
    );

    const declaredSizePath = writeGitExecutable(
      declaredSizeDirectory,
      [
        "const [, , command, ...rest] = process.argv.slice(2);",
        "if (command === 'rev-parse' && rest[0] === '--git-dir') process.stdout.write('.git\\n');",
        "else if (command === 'rev-parse' && rest[0] === '--show-object-format') process.stdout.write('sha1\\n');",
        "else if (command === 'config' || (command === 'cat-file' && rest[0] === '-e')) process.exit(0);",
        `else if (command === 'rev-list') process.stdout.write(${JSON.stringify(`${fixture.commits.merge}\n`)});`,
        `else if (command === 'cat-file' && rest[0] === '--batch') process.stdout.write(${JSON.stringify(`${fixture.commits.merge} commit ${1024 * 1024 + 1}\n`)});`,
        "else process.exit(1);",
      ].join("\n"),
    );
    assertControlledError(
      readInControlledGitEnvironment(fixture, declaredSizePath),
      "invalid_commit",
      "history",
      { commitIndex: 0 },
    );
  } finally {
    removeGitFixture(fixture.directory);
    rmSync(aggregateDirectory, { force: true, recursive: true });
    rmSync(declaredSizeDirectory, { force: true, recursive: true });
  }
});

test("reads a SHA-256 repository when the installed Git supports it", (testContext) => {
  const directory = mkdtempSync(join(tmpdir(), "collective-cognition-git-sha256-"));
  const repositoryPath = join(directory, "repository");
  mkdirSync(repositoryPath);
  const initialization = spawnSync(
    "git",
    ["-C", repositoryPath, "init", "--initial-branch=main", "--object-format=sha256"],
    { encoding: "utf8", env: gitEnvironment },
  );
  if (initialization.status !== 0) {
    const diagnostic = `${initialization.stdout}\n${initialization.stderr}`;
    if (/sha-?256|object-format/i.test(diagnostic) && /unsupported|unknown option|not support/i.test(diagnostic)) {
      testContext.skip("Installed Git explicitly does not support SHA-256 repositories.");
      removeGitFixture(directory);
      return;
    }
    removeGitFixture(directory);
    assert.fail(`SHA-256 fixture initialization failed: ${diagnostic}`);
  }
  try {
    writeFileSync(join(repositoryPath, "sha256.txt"), "sha256\n");
    runGit(repositoryPath, ["add", "sha256.txt"]);
    runGit(repositoryPath, ["commit", "--no-gpg-sign", "-m", "SHA-256 root"]);
    const tipCommitId = runGit(repositoryPath, ["rev-parse", "HEAD"]).trim();
    assert.match(tipCommitId, /^[0-9a-f]{64}$/);

    const records = readGitCommitSourceRecords({
      repositoryPath,
      sourceInstance: "fictional-git-sha256",
      tipCommitId,
      capturedAt: "2026-08-21T12:00:00.000Z",
      limit: 1,
    });
    assert.deepEqual(records.map(({ revisionId }) => revisionId), [tipCommitId]);
  } finally {
    removeGitFixture(directory);
  }
});
