import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const builder = fileURLToPath(
  new URL("../scripts/build-github-prerelease.mjs", import.meta.url),
);
const expectedAssets = [
  "SHA256SUMS",
  "collective-cognition-sdk-0.6.0.cdx.json",
  "collective-cognition-sdk-0.6.0.tgz",
  "release-manifest.json",
];
const expectedCommit = runGit(["rev-parse", "HEAD"]);

function runGit(args: readonly string[]): string {
  const result = spawnSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function runBuilder(
  args: readonly string[],
  environment: NodeJS.ProcessEnv = {},
  executable = process.execPath,
) {
  return spawnSync(executable, [builder, ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, ...environment },
  });
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function createOutput(root: string, name: string): string {
  const output = join(root, name);
  mkdirSync(output);
  return output;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function assertNoAutoMergeWorkflows(workflows: string): void {
  if (!existsSync(workflows)) {
    return;
  }

  const workflowFiles = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return workflowFiles(path);
      }
      return entry.isFile() && /\.ya?ml$/i.test(entry.name) ? [path] : [];
    });
  const instructions = (workflow: string): { kind: string; value: string }[] => {
    const parsed: { kind: string; value: string }[] = [];
    let block: { kind: string; indent: number } | undefined;

    for (const line of workflow.split("\n")) {
      const trimmed = line.trim();
      const indent = line.length - line.trimStart().length;
      if (trimmed.startsWith("#")) {
        continue;
      }
      if (block && trimmed && indent > block.indent) {
        parsed.push({ kind: block.kind, value: trimmed });
        continue;
      }
      block = undefined;
      const field = line.match(/^\s*(?:-\s*)?(run|uses|script|query):\s*(.*?)\s*$/);
      if (!field) {
        continue;
      }
      const [, kind, value] = field;
      if ((kind === "run" || kind === "script" || kind === "query") && /^[>|]/.test(value)) {
        block = { kind, indent };
      } else {
        parsed.push({ kind, value: value.replace(/^['"]|['"]$/g, "") });
      }
    }

    return parsed;
  };
  const knownMergeActions = new Set([
    "pascalgn/automerge-action",
    "peter-evans/enable-pull-request-automerge",
    "ahmadnassri/action-dependabot-auto-merge",
    "actions-ecosystem/action-automerge",
  ]);
  const graphQlMerge = /\b(?:mergePullRequest|enablePullRequestAutoMerge)\b/;
  const mergeEndpoint = /\/pulls\/[^/\s'"`]+\/merge\b/i;

  for (const path of workflowFiles(workflows)) {
    for (const instruction of instructions(readFileSync(path, "utf8"))) {
      const value = instruction.value.trim();
      const isRunMerge = instruction.kind === "run" && /^gh\s+pr\s+merge\b/i.test(value);
      const isRestMerge = mergeEndpoint.test(value) && /\bPUT\b/i.test(value) && (
        (instruction.kind === "run" && /^(?:gh\s+api|curl)\b/i.test(value)) ||
        (instruction.kind === "script" && /\b(?:github|octokit)\b/i.test(value))
      );
      const isGraphQlMerge = graphQlMerge.test(value) && (
        (instruction.kind === "run" && /^(?:gh\s+api\s+graphql|curl)\b/i.test(value)) ||
        instruction.kind === "query" ||
        (instruction.kind === "script" && /\b(?:github|octokit)\.graphql\b/i.test(value))
      );
      const isMergeAction = instruction.kind === "uses" && knownMergeActions.has(value.split("@", 1)[0]);

      assert.equal(
        isRunMerge || isRestMerge || isGraphQlMerge || isMergeAction,
        false,
        `${path} enables automatic pull-request merging`,
      );
    }
  }
}

function assertFailureLeavesNoAssets(
  output: string,
  args: readonly string[],
): void {
  const result = runBuilder(args);
  assert.notEqual(result.status, 0);
  assert.deepEqual(readdirSync(output), []);
}

test("release builder requires an explicit safe output directory", () => {
  const root = mkdtempSync(join(tmpdir(), "cc-release-output-"));
  const emptyOutput = createOutput(root, "empty");
  const fileOutput = join(root, "file");
  const nonEmptyOutput = createOutput(root, "non-empty");
  const linkedOutput = join(root, "linked");

  try {
    writeFileSync(fileOutput, "not a directory\n");
    writeFileSync(join(nonEmptyOutput, "operator-file"), "preserve me\n");
    symlinkSync(emptyOutput, linkedOutput);

    assertFailureLeavesNoAssets(emptyOutput, []);
    assertFailureLeavesNoAssets(emptyOutput, ["--output", "relative-output"]);
    assertFailureLeavesNoAssets(emptyOutput, ["--output", join(root, "missing", "output")]);
    assertFailureLeavesNoAssets(emptyOutput, ["--output", fileOutput]);
    const nonEmptyResult = runBuilder(["--output", nonEmptyOutput]);
    assert.notEqual(nonEmptyResult.status, 0);
    assert.deepEqual(readdirSync(nonEmptyOutput), ["operator-file"]);
    assertFailureLeavesNoAssets(emptyOutput, ["--output", linkedOutput]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("release builder creates the exact deterministic asset set", () => {
  const root = mkdtempSync(join(tmpdir(), "cc-release-assets-"));
  const first = createOutput(root, "first");
  const second = createOutput(root, "second");

  try {
    for (const output of [first, second]) {
      const result = runBuilder(["--output", output], {
        GIT_COMMIT: "f".repeat(40),
      });
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), {
        ok: true,
        tag: "v0.6.0",
        assets: expectedAssets,
      });
      assert.deepEqual(readdirSync(output).sort(), expectedAssets);
    }

    for (const asset of expectedAssets) {
      assert.deepEqual(
        readFileSync(join(first, asset)),
        readFileSync(join(second, asset)),
        `${asset} must be byte-for-byte deterministic`,
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("release manifest, checksums, and SBOM are exact", () => {
  const root = mkdtempSync(join(tmpdir(), "cc-release-metadata-"));
  const output = createOutput(root, "output");

  try {
    const scripts = readJson(join(repositoryRoot, "package.json")) as {
      readonly scripts: Record<string, string>;
    };
    for (const script of Object.values(scripts.scripts)) {
      assert.doesNotMatch(
        script,
        /\b(?:npm\s+(?:publish|token)|NPM_TOKEN|NODE_AUTH_TOKEN|npm_[A-Za-z0-9_]*token)\b/i,
      );
    }

    const result = runBuilder(["--output", output]);
    assert.equal(result.status, 0, result.stderr);

    const tarball = readFileSync(join(output, "collective-cognition-sdk-0.6.0.tgz"));
    const sbom = readJson(
      join(output, "collective-cognition-sdk-0.6.0.cdx.json"),
    );
    const manifest = readJson(join(output, "release-manifest.json")) as {
      readonly repository: string;
      readonly tag: string;
      readonly commit: string;
      readonly package: { readonly name: string; readonly version: string; readonly private: boolean };
      readonly nodeVersion: string;
      readonly assets: readonly { readonly name: string; readonly bytes: number; readonly sha256: string }[];
    };
    const manifestBuffer = readFileSync(join(output, "release-manifest.json"));
    const sums = readFileSync(join(output, "SHA256SUMS"), "utf8");

    assert.deepEqual(sbom, {
      bomFormat: "CycloneDX",
      specVersion: "1.6",
      version: 1,
      metadata: {
        component: {
          "bom-ref": "pkg:npm/collective-cognition-sdk@0.6.0",
          name: "collective-cognition-sdk",
          purl: "pkg:npm/collective-cognition-sdk@0.6.0",
          type: "library",
          version: "0.6.0",
        },
      },
      components: [],
      dependencies: [
        {
          ref: "pkg:npm/collective-cognition-sdk@0.6.0",
          dependsOn: [],
        },
      ],
    });
    assert.deepEqual(manifest, {
      repository: "xiongxhc/collective-cognition-sdk",
      tag: "v0.6.0",
      commit: expectedCommit,
      package: {
        name: "collective-cognition-sdk",
        version: "0.6.0",
        private: true,
      },
      nodeVersion: process.version,
      assets: [
        {
          name: "collective-cognition-sdk-0.6.0.tgz",
          bytes: tarball.length,
          sha256: sha256(tarball),
        },
        {
          name: "collective-cognition-sdk-0.6.0.cdx.json",
          bytes: readFileSync(join(output, "collective-cognition-sdk-0.6.0.cdx.json")).length,
          sha256: sha256(readFileSync(join(output, "collective-cognition-sdk-0.6.0.cdx.json"))),
        },
      ],
    });
    assert.match(manifest.commit, /^[0-9a-f]{40}$/);

    const checksumLines = sums.trimEnd().split("\n");
    assert.deepEqual(
      checksumLines.map((line) => line.slice(66)),
      [
        "collective-cognition-sdk-0.6.0.cdx.json",
        "collective-cognition-sdk-0.6.0.tgz",
        "release-manifest.json",
      ],
    );
    assert.deepEqual(checksumLines, [
      `${sha256(readFileSync(join(output, "collective-cognition-sdk-0.6.0.cdx.json")))}  collective-cognition-sdk-0.6.0.cdx.json`,
      `${sha256(tarball)}  collective-cognition-sdk-0.6.0.tgz`,
      `${sha256(manifestBuffer)}  release-manifest.json`,
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("release diagnostics do not disclose paths or injected secrets", () => {
  const root = mkdtempSync(join(tmpdir(), "cc-release-diagnostics-"));
  const secret = "release-secret-must-not-leak";
  const output = createOutput(root, "output");

  try {
    const result = runBuilder(["--output", "relative-output"], {
      RELEASE_TEST_SECRET: secret,
    });
    assert.notEqual(result.status, 0);
    assert.deepEqual(JSON.parse(result.stderr), {
      ok: false,
      error: "INVALID_OUTPUT_TARGET",
    });
    assert.equal(result.stdout, "");
    for (const value of [secret, root, repositoryRoot, process.cwd()]) {
      assert.doesNotMatch(result.stderr, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.deepEqual(readdirSync(output), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("release builder runs tools without a shell and preserves literal metacharacters", () => {
  const root = mkdtempSync(join(tmpdir(), "cc-release-shell-free-"));
  const output = createOutput(root, "output;literal&value");

  try {
    assert.doesNotMatch(readFileSync(builder, "utf8"), /\bshell\s*:/);
    const result = runBuilder(["--output", output]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(readdirSync(output).sort(), expectedAssets);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("release builder isolates failing subprocesses and preserves swapped output", () => {
  const root = mkdtempSync(join(tmpdir(), "cc-release-subprocess-"));
  const output = createOutput(root, "output");
  const external = createOutput(root, "external");
  const callerHome = createOutput(root, "caller-home");
  const shadowPath = createOutput(root, "caller-path");
  const trustedBin = createOutput(root, "trusted-bin");
  const secret = "release-subprocess-secret-must-not-leak";
  const sentinel = join(external, "sentinel");
  const observedEnvironment = join(root, "observed-environment.json");
  const stagedPrefix = ".collective-cognition-release-";
  const node = join(trustedBin, "node");
  const npm = join(trustedBin, "npm");
  const npmCli = join(root, "lib", "node_modules", "npm", "bin", "npm-cli.js");
  const shadowGit = join(shadowPath, "git");

  try {
    writeFileSync(sentinel, "external sentinel\n");
    writeFileSync(join(callerHome, ".npmrc"), "script-shell=/missing-shell\n");
    copyFileSync(process.execPath, node);
    chmodSync(node, 0o755);
    writeFileSync(
      shadowGit,
      `#!${process.execPath}\nprocess.stderr.write(${JSON.stringify(secret)}); process.exit(1);\n`,
    );
    chmodSync(shadowGit, 0o755);
    writeFileSync(
      npm,
      `#!${node}\nimport { rmSync, symlinkSync, writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(observedEnvironment)}, JSON.stringify({ home: process.env.HOME, path: process.env.PATH, userconfig: process.env.npm_config_userconfig, globalconfig: process.env.npm_config_globalconfig }));\nrmSync(${JSON.stringify(output)}, { recursive: true, force: true });\nsymlinkSync(${JSON.stringify(external)}, ${JSON.stringify(output)});\nprocess.stderr.write(${JSON.stringify(`${secret} ${root}\n`)});\nprocess.exit(1);\n`,
    );
    chmodSync(npm, 0o755);
    mkdirSync(dirname(npmCli), { recursive: true });
    writeFileSync(
      npmCli,
      `import { rmSync, symlinkSync, writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(observedEnvironment)}, JSON.stringify({ home: process.env.HOME, path: process.env.PATH, userconfig: process.env.npm_config_userconfig, globalconfig: process.env.npm_config_globalconfig }));\nrmSync(${JSON.stringify(output)}, { recursive: true, force: true });\nsymlinkSync(${JSON.stringify(external)}, ${JSON.stringify(output)});\nprocess.stderr.write(${JSON.stringify(`${secret} ${root}\n`)});\nprocess.exit(1);\n`,
    );

    const result = runBuilder(
      ["--output", output],
      {
        HOME: callerHome,
        PATH: shadowPath,
        RELEASE_TEST_SECRET: secret,
      },
      node,
    );

    assert.notEqual(result.status, 0);
    assert.deepEqual(JSON.parse(result.stderr), {
      ok: false,
      error: "BUILD_FAILED",
    });
    assert.equal(result.stdout, "");
    assert.equal(readFileSync(sentinel, "utf8"), "external sentinel\n");
    assert.equal(lstatSync(output).isSymbolicLink(), true);
    assert.equal(existsSync(observedEnvironment), true);
    const environment = readJson(observedEnvironment) as {
      readonly home: string;
      readonly path: string;
      readonly userconfig: string;
      readonly globalconfig: string;
    };
    assert.notEqual(environment.home, callerHome);
    assert.equal(environment.path.includes(shadowPath), false);
    assert.notEqual(environment.userconfig, join(callerHome, ".npmrc"));
    assert.notEqual(environment.globalconfig, join(callerHome, ".npmrc"));
    assert.deepEqual(
      readdirSync(root).filter((name) => name.startsWith(stagedPrefix)),
      [],
    );
    for (const value of [secret, root, repositoryRoot, callerHome, shadowPath]) {
      assert.doesNotMatch(result.stderr, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("public contribution and security policies preserve the prerelease boundary", () => {
  const requiredFiles = [
    "SECURITY.md",
    "CONTRIBUTING.md",
    "SUPPORT.md",
    "CHANGELOG.md",
    ".github/ISSUE_TEMPLATE/bug_report.yml",
    ".github/ISSUE_TEMPLATE/feature_request.yml",
    ".github/ISSUE_TEMPLATE/config.yml",
    ".github/pull_request_template.md",
    ".github/dependabot.yml",
  ];
  const readPolicy = (path: string): string => {
    const file = join(repositoryRoot, path);
    assert.equal(existsSync(file), true, `${path} must exist`);
    return readFileSync(file, "utf8");
  };

  for (const path of requiredFiles) {
    readPolicy(path);
  }

  const security = readPolicy("SECURITY.md");
  const contributing = readPolicy("CONTRIBUTING.md");
  const support = readPolicy("SUPPORT.md");
  const changelog = readPolicy("CHANGELOG.md");
  const bugReport = readPolicy(".github/ISSUE_TEMPLATE/bug_report.yml");
  const featureRequest = readPolicy(".github/ISSUE_TEMPLATE/feature_request.yml");
  const issueConfig = readPolicy(".github/ISSUE_TEMPLATE/config.yml");
  const pullRequest = readPolicy(".github/pull_request_template.md");
  const dependabot = readPolicy(".github/dependabot.yml");

  assert.match(security, /security\/advisories\/new/);
  assert.doesNotMatch(security, /@(?:gmail|outlook|company)\./i);
  assert.match(contributing, /Conventional Commits/);
  assert.match(contributing, /feature\/|fix\/|docs\//);
  assert.match(contributing, /Co-Authored-By/);
  assert.match(support, /GitHub Issues/);
  assert.match(support, /private data|personal data/i);
  assert.match(changelog, /0\.6\.0/);
  assert.match(changelog, /private|unpublished/i);
  assert.match(dependabot, /package-ecosystem: "github-actions"/);
  assert.match(dependabot, /package-ecosystem: "npm"/);

  assert.match(bugReport, /SDK version/);
  assert.match(bugReport, /Node/);
  assert.match(bugReport, /minimal reproduction/i);
  assert.match(bugReport, /expected behavior/i);
  assert.match(bugReport, /actual behavior/i);
  assert.match(bugReport, /private data/i);
  assert.match(featureRequest, /user problem/i);
  assert.match(featureRequest, /portable behavior/i);
  assert.match(featureRequest, /alternatives/i);
  assert.match(featureRequest, /compatibility impact/i);
  assert.match(featureRequest, /RFC/i);
  assert.match(issueConfig, /blank_issues_enabled: false/);
  assert.match(issueConfig, /security\/advisories\/new/);
  assert.match(pullRequest, /tests/i);
  assert.match(pullRequest, /compatibility/i);
  assert.match(pullRequest, /security|privacy/i);
  assert.match(pullRequest, /documentation/i);
  assert.match(pullRequest, /release impact/i);
  assert.match(pullRequest, /private data/i);
  assert.match(dependabot, /interval: "weekly"/);
  assert.match(dependabot, /open-pull-requests-limit:/);
  assert.doesNotMatch(dependabot, /auto-merge/i);
  assert.equal(existsSync(join(repositoryRoot, "CODE_OF_CONDUCT.md")), false);
  assertNoAutoMergeWorkflows(join(repositoryRoot, ".github/workflows"));
});

test("release readiness rejects executable auto-merge workflow instructions", () => {
  const root = mkdtempSync(join(tmpdir(), "cc-auto-merge-workflows-"));
  const workflows = join(root, ".github/workflows");
  const prohibitedInstructions = [
    "run: gh pr merge 42",
    "run: |\n  gh api --method PUT repos/xiongxhc/collective-cognition-sdk/pulls/42/merge",
    "run: gh api graphql -f query='mutation { mergePullRequest(input: {}) { pullRequest { id } } }'",
    "script: github.graphql(`mutation { enablePullRequestAutoMerge(input: {}) { clientMutationId } }`)",
    "uses: pascalgn/automerge-action@v0.16.3",
    "uses: peter-evans/enable-pull-request-automerge@v3",
    "uses: ahmadnassri/action-dependabot-auto-merge@v2",
  ];

  try {
    mkdirSync(workflows, { recursive: true });
    mkdirSync(join(workflows, "nested"));
    writeFileSync(join(workflows, "release.yml"), "run: git merge-base HEAD origin/main\n");
    writeFileSync(
      join(workflows, "documentation.yml"),
      "name: Auto-merge documentation\n# auto-merge remains disabled\njobs:\n  explain:\n    name: Explain auto-merge policy\n    run: echo \"gh pr merge is disabled\"\n",
    );
    assert.doesNotThrow(() => assertNoAutoMergeWorkflows(workflows));

    for (const [index, instruction] of prohibitedInstructions.entries()) {
      const workflow = join(
        workflows,
        index === 0 ? "nested/release.yaml" : `workflow-${index}.yaml`,
      );
      writeFileSync(workflow, `${instruction}\n`);
      assert.throws(() => assertNoAutoMergeWorkflows(workflows));
      rmSync(workflow);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
