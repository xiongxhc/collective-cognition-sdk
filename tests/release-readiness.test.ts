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
const ciWorkflow = fileURLToPath(
  new URL("../.github/workflows/ci.yml", import.meta.url),
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

const forbiddenPublicationOrAuthentication =
  /\b(?:npm\s+publish|NPM_TOKEN|NODE_AUTH_TOKEN|npm_[A-Za-z0-9_]*token|_authToken|authToken)\b/i;

function assertSafePackageScripts(scripts: Readonly<Record<string, string>>): void {
  for (const [name, script] of Object.entries(scripts)) {
    assert.doesNotMatch(
      script,
      forbiddenPublicationOrAuthentication,
      `package script ${name} must not publish or use authentication tokens`,
    );
  }
}

interface ParsedWorkflowStep {
  readonly properties: Readonly<Record<string, string>>;
  readonly run?: string;
  readonly raw: string;
}

interface ParsedWorkflowJob {
  readonly properties: Readonly<Record<string, string>>;
  readonly permissions?: Readonly<Record<string, string>> | string;
  readonly steps: readonly ParsedWorkflowStep[];
  readonly raw: string;
}

interface ParsedCiWorkflow {
  readonly permissions: Readonly<Record<string, string>> | string;
  readonly triggers: {
    readonly pullRequest: boolean;
    readonly pushBranches: readonly string[];
    readonly workflowDispatch: boolean;
  };
  readonly jobs: Readonly<Record<string, ParsedWorkflowJob>>;
}

function yamlScalar(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

function indentation(line: string): number {
  return line.length - line.trimStart().length;
}

function nestedMapping(
  lines: readonly string[],
  headerIndex: number,
  childIndent: number,
): Readonly<Record<string, string>> | string {
  const inline = lines[headerIndex]?.match(/^\s*[a-z0-9_-]+:\s*(.*?)\s*$/)?.[1];
  assert.notEqual(inline, undefined);
  if (inline !== "") {
    return yamlScalar(inline as string);
  }

  const values: Record<string, string> = {};
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index] as string;
    if (!line.trim()) {
      continue;
    }
    if (indentation(line) < childIndent) {
      break;
    }
    if (indentation(line) !== childIndent) {
      continue;
    }
    const entry = line.match(/^\s*([a-z0-9_-]+):\s*(.*?)\s*$/);
    assert.ok(entry, `unsupported mapping entry: ${line}`);
    values[entry[1] as string] = yamlScalar(entry[2] as string);
  }
  return values;
}

function parseWorkflowSteps(
  lines: readonly string[],
  stepsIndex: number,
  end: number,
): ParsedWorkflowStep[] {
  const steps: ParsedWorkflowStep[] = [];
  let index = stepsIndex + 1;

  while (index < end) {
    const line = lines[index] as string;
    if (!/^ {6}- /.test(line)) {
      index += 1;
      continue;
    }
    const next = lines.findIndex(
      (candidate, candidateIndex) =>
        candidateIndex > index && candidateIndex < end && /^ {6}- /.test(candidate),
    );
    const stepEnd = next === -1 ? end : next;
    const properties: Record<string, string> = {};
    let run: string | undefined;
    const first = line.match(/^ {6}- ([a-z0-9_-]+):\s*(.*?)\s*$/);
    assert.ok(first, `unsupported step entry: ${line}`);
    properties[first[1] as string] = yamlScalar(first[2] as string);

    for (let propertyIndex = index + 1; propertyIndex < stepEnd; propertyIndex += 1) {
      const propertyLine = lines[propertyIndex] as string;
      if (indentation(propertyLine) !== 8 || !propertyLine.trim()) {
        continue;
      }
      const property = propertyLine.match(/^ {8}([a-z0-9_-]+):\s*(.*?)\s*$/);
      assert.ok(property, `unsupported step property: ${propertyLine}`);
      const name = property[1] as string;
      const value = property[2] as string;
      if (name === "run" && /^[>|]/.test(value)) {
        properties[name] = value;
        const block: string[] = [];
        for (let blockIndex = propertyIndex + 1; blockIndex < stepEnd; blockIndex += 1) {
          const blockLine = lines[blockIndex] as string;
          if (blockLine.trim() && indentation(blockLine) <= 8) {
            break;
          }
          block.push(blockLine.startsWith("          ") ? blockLine.slice(10) : "");
        }
        run = block.join("\n").trimEnd();
      } else {
        properties[name] = yamlScalar(value);
        if (name === "run") {
          run = yamlScalar(value);
        }
      }
    }
    steps.push({
      properties,
      ...(run === undefined ? {} : { run }),
      raw: lines.slice(index, stepEnd).join("\n"),
    });
    index = stepEnd;
  }

  return steps;
}

function parseCiWorkflow(workflow: string): ParsedCiWorkflow {
  const lines = workflow.split("\n");
  const topLevelKeys = lines.flatMap((line) => {
    if (indentation(line) !== 0 || !line.trim()) {
      return [];
    }
    const entry = line.match(/^([a-z0-9_-]+):/);
    return entry ? [entry[1] as string] : [];
  });
  assert.deepEqual(
    topLevelKeys,
    ["name", "on", "permissions", "concurrency", "jobs"],
    "workflow top-level structure must remain closed",
  );
  const permissionsIndex = lines.indexOf("permissions:");
  const onIndex = lines.indexOf("on:");
  const jobsIndex = lines.indexOf("jobs:");
  assert.notEqual(permissionsIndex, -1, "workflow permissions must exist");
  assert.notEqual(onIndex, -1, "literal GitHub Actions on key must exist");
  assert.notEqual(jobsIndex, -1, "workflow jobs must exist");

  const triggerLines = lines.slice(onIndex + 1, permissionsIndex);
  assert.deepEqual(
    triggerLines.filter((line) => line.trim()),
    [
      "  pull_request:",
      "  push:",
      "    branches:",
      "      - master",
      "  workflow_dispatch:",
    ],
    "workflow trigger structure must remain closed",
  );
  const pushIndex = triggerLines.indexOf("  push:");
  const triggers = {
    pullRequest: triggerLines.includes("  pull_request:"),
    pushBranches: pushIndex === -1
      ? []
      : triggerLines
        .slice(pushIndex + 1)
        .filter((line) => /^ {6}- /.test(line))
        .map((line) => yamlScalar(line.slice(8))),
    workflowDispatch: triggerLines.includes("  workflow_dispatch:"),
  };
  const jobs: Record<string, ParsedWorkflowJob> = {};

  for (let index = jobsIndex + 1; index < lines.length; index += 1) {
    const jobHeader = (lines[index] as string).match(/^ {2}([a-z0-9_-]+):$/);
    if (!jobHeader) {
      continue;
    }
    const name = jobHeader[1] as string;
    const next = lines.findIndex(
      (line, candidateIndex) => candidateIndex > index && /^ {2}[a-z0-9_-]+:$/.test(line),
    );
    const end = next === -1 ? lines.length : next;
    const properties: Record<string, string> = {};
    let permissions: Readonly<Record<string, string>> | string | undefined;
    let steps: ParsedWorkflowStep[] = [];

    for (let propertyIndex = index + 1; propertyIndex < end; propertyIndex += 1) {
      const propertyLine = lines[propertyIndex] as string;
      if (indentation(propertyLine) !== 4 || !propertyLine.trim()) {
        continue;
      }
      const property = propertyLine.match(/^ {4}([a-z0-9_-]+):\s*(.*?)\s*$/);
      assert.ok(property, `unsupported job property: ${propertyLine}`);
      const propertyName = property[1] as string;
      if (propertyName === "permissions") {
        permissions = nestedMapping(lines, propertyIndex, 6);
      } else if (propertyName === "steps") {
        steps = parseWorkflowSteps(lines, propertyIndex, end);
      } else {
        properties[propertyName] = yamlScalar(property[2] as string);
      }
    }
    jobs[name] = {
      properties,
      ...(permissions === undefined ? {} : { permissions }),
      steps,
      raw: lines.slice(index, end).join("\n"),
    };
    index = end - 1;
  }

  return {
    permissions: nestedMapping(lines, permissionsIndex, 2),
    triggers,
    jobs,
  };
}

function requiredStep(job: ParsedWorkflowJob, name: string): ParsedWorkflowStep {
  const matches = job.steps.filter((step) => step.properties.name === name);
  assert.equal(matches.length, 1, `workflow step ${name} must exist exactly once`);
  return matches[0] as ParsedWorkflowStep;
}

function assertReadOnlyPermissions(
  permissions: Readonly<Record<string, string>> | string,
  scope: string,
): void {
  assert.deepEqual(permissions, { contents: "read" }, `${scope} permissions must be read-only`);
}

function assertUnconditional(job: ParsedWorkflowJob, name: string): ParsedWorkflowStep {
  assert.equal(job.properties.if, undefined, "required jobs must not use if");
  assert.equal(
    job.properties["continue-on-error"],
    undefined,
    "required jobs must propagate failures",
  );
  const step = requiredStep(job, name);
  const allowedProperties = step.properties.uses === undefined
    ? new Set(["name", "run"])
    : new Set(["name", "uses", "with"]);
  for (const property of Object.keys(step.properties)) {
    assert.equal(
      allowedProperties.has(property),
      true,
      `${name} uses unsupported control ${property}`,
    );
  }
  assert.equal(step.properties.if, undefined, `${name} must not use if`);
  assert.equal(
    step.properties["continue-on-error"],
    undefined,
    `${name} must propagate failures`,
  );
  assert.doesNotMatch(
    step.run ?? "",
    /(?:\|\||;\s*true\b|&&\s*true\b|set\s+\+e\b|trap\b[^\n]*\bERR\b|exit\s+0\b)/,
    `${name} must not suppress shell failures`,
  );
  return step;
}

function commandLines(step: ParsedWorkflowStep): string[] {
  return (step.run ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function assertReadOnlyCiWorkflow(workflow: string): void {
  const yaml = workflow
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");

  assert.doesNotMatch(workflow, /\t/, "workflow indentation must not use tabs");
  assert.doesNotMatch(
    yaml,
    /(?:^|[\s:[{,])\*[A-Za-z_][A-Za-z0-9_-]*/m,
    "workflow must not use YAML aliases",
  );
  assert.doesNotMatch(yaml, forbiddenPublicationOrAuthentication);
  assert.doesNotMatch(yaml, /\.npmrc\b/i);
  assert.doesNotMatch(yaml, /^\s*packages:\s*['"]?write['"]?\s*$/mi);
  const parsed = parseCiWorkflow(yaml);
  assert.deepEqual(parsed.triggers, {
    pullRequest: true,
    pushBranches: ["master"],
    workflowDispatch: true,
  });
  assertReadOnlyPermissions(parsed.permissions, "workflow");
  assert.deepEqual(Object.keys(parsed.jobs), ["verify", "distribution"]);
  for (const [name, job] of Object.entries(parsed.jobs)) {
    if (job.permissions !== undefined) {
      assertReadOnlyPermissions(job.permissions, `job ${name}`);
    }
  }
  assert.match(yaml, /^concurrency:\n  group: .+\n  cancel-in-progress: true$/m);

  const actionReferences = Object.values(parsed.jobs)
    .flatMap((job) => job.steps)
    .flatMap((step) => step.properties.uses === undefined ? [] : [step.properties.uses]);
  assert.equal(actionReferences.length, 4);
  for (const reference of actionReferences) {
    assert.match(reference, /^actions\/[a-z0-9_-]+@[0-9a-f]{40}$/);
  }
  assert.deepEqual(actionReferences, [
    "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
    "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
    "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
    "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
  ]);

  const verifyJob = parsed.jobs.verify as ParsedWorkflowJob;
  const distributionJob = parsed.jobs.distribution as ParsedWorkflowJob;
  assert.deepEqual(Object.keys(verifyJob.properties), [
    "name",
    "runs-on",
    "timeout-minutes",
    "strategy",
  ]);
  assert.deepEqual(Object.keys(distributionJob.properties), [
    "name",
    "runs-on",
    "timeout-minutes",
  ]);
  const matrixEntries = [...verifyJob.raw.matchAll(
    /^ {10}- os: ([a-z-]+)\n {12}node: "([0-9.]+)"$/gm,
  )].map((match) => ({ os: match[1], node: match[2] }));
  assert.deepEqual(matrixEntries, [
    { os: "ubuntu-latest", node: "24.9.0" },
    { os: "ubuntu-latest", node: "24.14.0" },
    { os: "macos-latest", node: "24.14.0" },
    { os: "windows-latest", node: "24.14.0" },
  ]);
  assert.doesNotMatch(verifyJob.raw, /^ {8}(?:os|node|exclude):/m);
  assert.equal(verifyJob.properties["runs-on"], "${{ matrix.os }}");
  assert.equal(verifyJob.properties["timeout-minutes"], "30");
  assert.match(
    distributionJob.raw,
    /^  distribution:\n    name: Distribution verification\n    runs-on: ubuntu-latest\n    timeout-minutes: [1-9][0-9]*$/m,
  );
  assert.equal(distributionJob.properties["runs-on"], "ubuntu-latest");
  assert.equal(distributionJob.properties["timeout-minutes"], "30");
  assert.match(distributionJob.raw, /^          node-version: "24\.14\.0"$/m);
  assert.equal([...yaml.matchAll(/^    timeout-minutes: [1-9][0-9]*$/gm)].length, 2);

  const requiredSteps = [
    ["Install dependencies without lifecycle scripts", "npm ci --ignore-scripts"],
    ["Run package tests", "npm test"],
    ["Typecheck", "npx tsc --noEmit"],
    ["Check syntax", "npm run check"],
  ] as const;
  for (const [name, command] of requiredSteps) {
    assert.equal(assertUnconditional(verifyJob, name).run, command);
  }
  assertUnconditional(verifyJob, "Check out repository");
  assertUnconditional(distributionJob, "Check out repository");
  const verifySetup = assertUnconditional(verifyJob, "Set up Node.js");
  const distributionSetup = assertUnconditional(distributionJob, "Set up Node.js");
  assert.match(
    verifySetup.raw,
    /^      - name: Set up Node\.js\n        uses: actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020\n        with:\n          node-version: \$\{\{ matrix\.node \}\}\n          cache: npm$/,
  );
  assert.match(
    distributionSetup.raw,
    /^      - name: Set up Node\.js\n        uses: actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020\n        with:\n          node-version: "24\.14\.0"\n          cache: npm$/,
  );
  assert.equal(
    assertUnconditional(distributionJob, "Install dependencies without lifecycle scripts").run,
    "npm ci --ignore-scripts --prefer-offline",
  );
  const examplesStep = assertUnconditional(
    distributionJob,
    "Run examples and package checks",
  );
  const examples = commandLines(examplesStep);
  assert.equal(examples[0], "set -euo pipefail");
  for (const command of [
    "npm run example",
    "npm run example:markdown",
    "npm run example:portable",
    "npm run example:host",
    'npm run example:teammem -- "$ledger"',
    'npm run example:teammem:durable -- --ledger "$ledger" --cognition-db "$cognition" --project ci-synthetic --from 2026-08-02T00:00:00.000Z --limit 1 --create',
    "npm run pack:check",
  ]) {
    assert.equal(examples.includes(command), true, `${command} must run in the examples step`);
  }
  assert.match(examplesStep.run ?? "", /CREATE TABLE events/);
  assert.match(examplesStep.run ?? "", /INSERT INTO events/);
  assert.match(examplesStep.run ?? "", /\n\s+"commit",\n/);
  assert.match(examplesStep.run ?? "", /example_root="\$\(mktemp -d\)"/);
  assert.match(examplesStep.run ?? "", /trap 'rm -rf "\$example_root"' EXIT/);
  assert.match(examplesStep.run ?? "", /ledger="\$example_root\/events\.db"/);
  assert.match(examplesStep.run ?? "", /cognition="\$example_root\/cognition\.db"/);
  assert.ok(
    examples.indexOf('LEDGER_PATH="$ledger" node --input-type=module <<\'NODE\'') <
      examples.indexOf("npm run example"),
  );
  assert.ok(
    examples.indexOf("npm run pack:check") > examples.indexOf(
      'npm run example:teammem:durable -- --ledger "$ledger" --cognition-db "$cognition" --project ci-synthetic --from 2026-08-02T00:00:00.000Z --limit 1 --create',
    ),
  );
  const distributionStep = assertUnconditional(
    distributionJob,
    "Verify deterministic distribution assets and clean installation",
  );
  const distributionRunLines = commandLines(distributionStep);
  assert.equal(distributionRunLines[0], "set -euo pipefail");
  assert.deepEqual(
    distributionRunLines.filter((line) => /^npm install\b/.test(line)),
    [
      'npm install --ignore-scripts --offline --no-audit --no-fund "$first/collective-cognition-sdk-0.6.0.tgz"',
    ],
  );
  assert.equal(
    distributionRunLines.filter(
      (line) => /node scripts\/build-github-prerelease\.mjs\b/.test(line),
    ).length,
    2,
  );
  assert.match(distributionStep.run ?? "", /\bcmp\b/);
  assert.match(distributionStep.run ?? "", /sha256sum -c SHA256SUMS/);
  assert.match(distributionStep.run ?? "", /JSON\.parse/);
  assert.match(distributionStep.run ?? "", /bomFormat/);
  assert.match(distributionStep.run ?? "", /release-manifest\.json/);

  for (const line of distributionRunLines) {
    if (/node scripts\/build-github-prerelease\.mjs\b/.test(line)) {
      assert.match(line, /npm_config_ignore_scripts=true/);
      assert.match(line, /npm_config_offline=true/);
      assert.match(line, /--output\s+"\$[A-Za-z_][A-Za-z0-9_]*"$/);
    }
    if (/^npm (?:install|pack)\b/.test(line)) {
      assert.match(line, /(?:^|\s)--ignore-scripts(?:\s|$)/);
      assert.match(line, /(?:^|\s)--offline(?:\s|$)/);
    }
  }
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
      if (block) {
        if (!trimmed) {
          continue;
        }
        if (indent > block.indent) {
          if (!trimmed.startsWith("#")) {
            parsed.push({ kind: block.kind, value: trimmed });
          }
          continue;
        }
        block = undefined;
      }
      if (trimmed.startsWith("#")) {
        continue;
      }
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
  const node = join(
    trustedBin,
    process.platform === "win32" ? "node.exe" : "node",
  );
  const npm = join(
    trustedBin,
    process.platform === "win32" ? "npm.cmd" : "npm",
  );
  const npmCli = join(root, "lib", "node_modules", "npm", "bin", "npm-cli.js");
  const shadowGit = join(
    shadowPath,
    process.platform === "win32" ? "git.exe" : "git",
  );

  try {
    assert.equal(node.endsWith(".exe"), process.platform === "win32");
    assert.equal(npm.endsWith(".cmd"), process.platform === "win32");
    assert.equal(shadowGit.endsWith(".exe"), process.platform === "win32");
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
    "run: |\n  echo checking\n\n  gh pr merge 42",
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

test("read-only CI verifies the exact supported matrix and distribution path", () => {
  assert.equal(existsSync(ciWorkflow), true, ".github/workflows/ci.yml must exist");
  const workflow = readFileSync(ciWorkflow, "utf8");
  const packageJson = readJson(join(repositoryRoot, "package.json")) as {
    readonly name: string;
    readonly exports: Readonly<Record<string, unknown>>;
    readonly scripts: Readonly<Record<string, string>>;
  };

  assertSafePackageScripts(packageJson.scripts);
  assertReadOnlyCiWorkflow(workflow);
  const distributionJob = parseCiWorkflow(workflow).jobs.distribution as ParsedWorkflowJob;

  for (const name of Object.keys(packageJson.scripts).filter(
    (script) => script === "example" || script.startsWith("example:"),
  )) {
    assert.match(
      distributionJob.raw,
      new RegExp(`^\\s+npm run ${name.replaceAll(":", "\\:")}(?: -- .+)?$`, "m"),
    );
  }
  for (const subpath of Object.keys(packageJson.exports)) {
    const specifier = subpath === "."
      ? packageJson.name
      : `${packageJson.name}${subpath.slice(1)}`;
    assert.equal(
      distributionJob.raw.includes(JSON.stringify(specifier)),
      true,
      `distribution verification must consume ${specifier}`,
    );
  }
  for (const executable of [
    "collective-cognition",
    "collective-cognition-teammem",
    "collective-cognition-markdown",
  ]) {
    assert.match(distributionJob.raw, new RegExp(`node_modules/\\.bin/${executable}\\b`));
  }
});

test("CI policy scanner rejects unsafe workflow and package mutations", () => {
  const workflow = readFileSync(ciWorkflow, "utf8");
  const unsafeWorkflows = [
    workflow.replace("    runs-on: ${{ matrix.os }}", "\truns-on: ${{ matrix.os }}"),
    `${workflow}\nunsafe: *shared-steps\n`,
    workflow.replace(
      "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
      "actions/checkout@${{ github.ref }}",
    ),
    `${workflow}\nunsafe:\n  uses: \${{ github.action }}\n`,
    `${workflow}\n# publication\nunsafe: npm publish\n`,
    `${workflow}\nunsafe: NODE_AUTH_TOKEN\n`,
    `${workflow}\nunsafe: echo token > ~/.npmrc\n`,
    workflow.replace("contents: read", "packages: write"),
    workflow.replace(
      "    name: Node ${{ matrix.node }} on ${{ matrix.os }}",
      "    permissions:\n      contents: write\n    name: Node ${{ matrix.node }} on ${{ matrix.os }}",
    ),
    workflow.replace(
      "      - name: Run package tests\n        run: npm test",
      "      - name: Run package tests\n        if: \${{ false }}\n        run: npm test",
    ),
    workflow.replace(
      "      - name: Verify deterministic distribution assets and clean installation\n        run: |",
      "      - name: Verify deterministic distribution assets and clean installation\n        continue-on-error: true\n        run: |",
    ),
    workflow.replace(
      "npm install --ignore-scripts --offline",
      "npm install --ignore-scripts",
    ),
    workflow.replace(
      "npm_config_ignore_scripts=true npm_config_offline=true node scripts/build-github-prerelease.mjs",
      "node scripts/build-github-prerelease.mjs",
    ),
  ];

  for (const [index, unsafeWorkflow] of unsafeWorkflows.entries()) {
    assert.throws(
      () => assertReadOnlyCiWorkflow(unsafeWorkflow),
      `unsafe workflow mutation ${index} must be rejected`,
    );
  }
  assert.throws(() => assertSafePackageScripts({ release: "npm publish" }));
  assert.throws(() => assertSafePackageScripts({ release: "NODE_AUTH_TOKEN=secret npm pack" }));
});
