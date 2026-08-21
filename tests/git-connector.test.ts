import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

function writeCommitObject(
  repositoryPath: string,
  contents: string,
): string {
  const result = spawnSync(
    "git",
    ["-C", repositoryPath, "hash-object", "-t", "commit", "-w", "--stdin"],
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

function assertGitConnectorError(
  action: () => unknown,
  code: GitConnectorErrorCode,
  stage: GitConnectorStage,
): GitConnectorError {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown instanceof GitConnectorError);
  assert.equal(thrown.code, code);
  assert.equal(thrown.stage, stage);
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

test("rejects invalid closed options before repository access", () => {
  const fixture = createGitFixture();
  try {
    const invalidValues: readonly Partial<GitCommitSourceRecordOptions>[] = [
      { repositoryPath: "relative/repository" },
      { repositoryPath: "~/repository" },
      { repositoryPath: "https://example.invalid/repository" },
      { repositoryPath: `${fixture.repositoryPath}\u0000suffix` },
      { sourceInstance: " fictional-git-main" },
      { sourceInstance: "fictional\u0000git" },
      { tipCommitId: fixture.commits.merge.toUpperCase() },
      { tipCommitId: "abcdef" },
      { capturedAt: "2026-08-21T12:00:00" },
      { limit: 0 },
      { limit: 1001 },
      { includeMessage: "yes" as never },
      { includeAuthorEmail: 1 as never },
    ];
    for (const invalidValue of invalidValues) {
      const error = assertGitConnectorError(
        () => readGitCommitSourceRecords(connectorOptions(fixture, invalidValue)),
        "invalid_options",
        "options",
      );
      assert.equal(error.message, "Git connector options are invalid.");
    }

    let accessorReads = 0;
    const accessorOptions = {
      ...connectorOptions(fixture),
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
    assert.equal(error.message, "Git connector options are invalid.");
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
