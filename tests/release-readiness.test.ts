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
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const builder = fileURLToPath(
  new URL("../scripts/build-github-prerelease.mjs", import.meta.url),
);
const ciWorkflow = fileURLToPath(
  new URL("../.github/workflows/ci.yml", import.meta.url),
);
const githubPrereleaseWorkflow = fileURLToPath(
  new URL("../.github/workflows/github-prerelease.yml", import.meta.url),
);
const githubReleaseConfig = fileURLToPath(
  new URL("../.github/release.yml", import.meta.url),
);
const gitAttributes = fileURLToPath(new URL("../.gitattributes", import.meta.url));
const expectedAssets = [
  "SHA256SUMS",
  "collective-cognition-sdk-0.6.0.cdx.json",
  "collective-cognition-sdk-0.6.0.tgz",
  "release-manifest.json",
];
const expectedChecksumAssets = expectedAssets.slice(1);
const expectedPackageScriptsSha256 = "7a2d3e4caf6dda279b46cf4d33788b11ba57f18fea285abc176914b70400d268";
const expectedCiWorkflowSha256 = "1ef227da1df92f8452c16a3bc5afe03732cd5c553941feb10e439dfa587d395b";
const expectedGitHubPrereleaseWorkflowSha256 = "b628e8e07829bd115a01133595d4f3424e0634e7479f9f00c35bc4e5c9a8508f";
const expectedTarballSha256 = "3b50ebaa83e0a025ba49aaf81099e8de805e35e2c177a76beb4b985b575a9efe";
const expectedReleaseCommit = "76f289b7f1514f4bc490d0de6dbffbb61a4c9f0e";
const releasedPackageName = "collective-cognition-sdk";
const releasedPackageExports = [
  ".",
  "./compatibility/0.1.0",
  "./compatibility/0.2.0",
  "./compatibility/0.3.0",
  "./compatibility/0.4.0",
  "./compatibility/0.5.0",
  "./compatibility/0.6.0",
  "./adapters/markdown/0.1.0",
  "./connector-conformance/0.1.0",
  "./connectors/team-memory/0.1.0",
  "./contracts/host-integration/0.1.0",
  "./host-conformance/0.1.0",
  "./reference-host/0.1.0",
  "./stores/sqlite/0.1.0",
  "./schemas/source-record/0.1.0",
  "./schemas/portable-cognition/0.1.0",
  "./conformance/portable-cognition/0.1.0/valid",
  "./conformance/portable-cognition/0.1.0/invalid",
  "./conformance/portable-cognition/0.1.0/cognitive-loop",
  "./package.json",
] as const;
const expectedCommit = runGit(["rev-parse", "HEAD"]);
const expectedNpmVersion = readNpmVersion();
const releaseArtifactTest =
  process.platform === "linux" &&
    process.version === "v24.14.0" &&
    expectedCommit === expectedReleaseCommit
    ? test
    : test.skip;
const publicationWrapperMutations = [
  "sh -c 'npm --silent publish'",
  "bash -c 'npm --silent publish'",
  "zsh -c 'npm --silent publish'",
  "env -i bash --noprofile -c 'npm --silent publish'",
  "eval 'npm --silent publish'",
  "sh -c 'npm \"$@\"' -- --silent publish",
];

function runGit(args: readonly string[]): string {
  const result = spawnSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function readNpmVersion(): string {
  const executable = realpathSync(process.execPath);
  const executableDirectory = dirname(executable);
  const candidates = [
    process.env.npm_execpath,
    join(executableDirectory, "node_modules", "npm", "bin", "npm-cli.js"),
    join(dirname(executableDirectory), "lib", "node_modules", "npm", "bin", "npm-cli.js"),
    join(
      dirname(executableDirectory),
      "libexec",
      "lib",
      "node_modules",
      "npm",
      "bin",
      "npm-cli.js",
    ),
    "/usr/local/lib/node_modules/npm/bin/npm-cli.js",
    "/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js",
    "/usr/lib/node_modules/npm/bin/npm-cli.js",
  ];
  const npmCli = candidates.find((candidate) =>
    typeof candidate === "string" && isAbsolute(candidate) && existsSync(candidate)
  );
  assert.ok(npmCli, "a closed npm CLI layout must be available to the release tests");
  const result = spawnSync(executable, [npmCli, "--version"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout.trim(), /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/);
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

function readReviewedWorkflow(path: string, expectedSha256: string): string {
  const bytes = readFileSync(path);
  assert.equal(sha256(bytes), expectedSha256);
  const workflow = bytes.toString("utf8");
  assert.deepEqual(Buffer.from(workflow), bytes);
  return workflow;
}

function gitFilteredHash(path: string, bytes: Buffer): string {
  const result = spawnSync("git", ["hash-object", "--stdin", `--path=${path}`], {
    cwd: repositoryRoot,
    encoding: "utf8",
    input: bytes,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function checksumNamesDeclaration(
  names: readonly string[] = expectedChecksumAssets,
  indentation = "",
): string {
  return [
    `${indentation}const checksumNames = [`,
    ...names.map((name) => `${indentation}  ${JSON.stringify(name)},`),
    `${indentation}];`,
  ].join("\n");
}

function checksumInventoryMutations(document: string, indentation = ""): readonly string[] {
  const original = checksumNamesDeclaration(expectedChecksumAssets, indentation);
  const variants = [
    expectedChecksumAssets.slice(1),
    [
      expectedChecksumAssets[1] as string,
      expectedChecksumAssets[0] as string,
      expectedChecksumAssets[2] as string,
    ],
    [...expectedChecksumAssets, "../../etc/passwd"],
  ];
  return variants.map((names) => document.replace(
    original,
    checksumNamesDeclaration(names, indentation),
  ));
}

function assertCanonicalChecksumVerifier(value: string): void {
  assert.equal(value.includes(checksumNamesDeclaration()), true);
  for (const fragment of [
    'const checksumBytes = readFileSync(join(releaseDirectory, "SHA256SUMS"));',
    'const checksumText = checksumBytes.toString("utf8");',
    'assert.deepEqual(Buffer.from(checksumText, "utf8"), checksumBytes);',
    'const checksumLines = checksumText.split("\\n");',
    'assert.equal(checksumLines.pop(), "");',
    "assert.equal(checksumLines.length, checksumNames.length);",
    'const match = line.match(/^([0-9a-f]{64})  (.+)$/);',
    "assert.ok(match);",
    "return { sha256: match[1], name: match[2] };",
    "assert.deepEqual(checksumEntries.map(({ name }) => name), checksumNames);",
    "const bytes = readFileSync(join(releaseDirectory, entry.name));",
    'assert.equal(entry.sha256, createHash("sha256").update(bytes).digest("hex"));',
  ]) {
    assert.equal(value.includes(fragment), true, `missing checksum verifier fragment: ${fragment}`);
  }
}

const forbiddenAuthentication =
  /\b(?:NPM_TOKEN|NODE_AUTH_TOKEN|npm_[A-Za-z0-9_]*token|_auth|_authToken|authToken)\b/i;
const forbiddenNpmVerbs = new Set([
  "publish",
  "dist-tag",
  "deprecate",
  "unpublish",
  "access",
  "owner",
  "team",
  "org",
  "hook",
  "star",
  "unstar",
  "profile",
  "token",
  "login",
  "adduser",
  "logout",
  "whoami",
]);
const forbiddenRegistryConfiguration =
  /(?:\bnpm\s+(?:(?:config\s+)?(?:set|delete|unset))\b|\bnpm_config_(?:registry|userconfig|globalconfig|always_auth|_?auth(?:token)?)\b|(?:^|\s)--(?:registry|userconfig|globalconfig|always-auth|_auth(?:Token)?)(?:=|\s+)\S+|(?:^|[\s'"])(?:(?:@[^\s:=]+:)?registry|always-auth|_auth(?:Token)?)\s*=\s*\S+|\.npmrc\b)/i;

function shellTokens(value: string): readonly (string | undefined)[] {
  const tokens: (string | undefined)[] = [];
  let token = "";
  let quote: string | undefined;
  const pushToken = (): void => {
    if (token) {
      tokens.push(token);
      token = "";
    }
  };
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] as string;
    if (quote) {
      if (character === quote) {
        quote = undefined;
      } else if (character === "\\" && quote === '"' && index + 1 < value.length) {
        index += 1;
        token += value[index];
      } else {
        token += character;
      }
    } else if (character === "'" || character === '"') {
      quote = character;
    } else if (character === "\\" && index + 1 < value.length) {
      index += 1;
      token += value[index];
    } else if (character === "\n" || ";|&()".includes(character)) {
      pushToken();
      tokens.push(undefined);
    } else if (/\s/.test(character)) {
      pushToken();
    } else {
      token += character;
    }
  }
  pushToken();
  return tokens;
}

function hasForbiddenNpmInvocation(value: string): boolean {
  let npmInvocation = false;
  for (const token of shellTokens(value)) {
    if (token === undefined) {
      npmInvocation = false;
      continue;
    }
    const executable = token.split(/[\\/]/).at(-1)?.toLowerCase();
    if (!npmInvocation) {
      npmInvocation = executable === "npm" || executable === "npm.cmd" || executable === "npm.exe";
    } else if (forbiddenNpmVerbs.has(token.toLowerCase())) {
      return true;
    }
  }
  return false;
}

function assertNoForbiddenNpmInvocations(value: string, scope: string): void {
  assert.equal(
    hasForbiddenNpmInvocation(value),
    false,
    `${scope} must not execute an npm publication or authentication verb`,
  );
}

function assertSafePackageScripts(scripts: Readonly<Record<string, string>>): void {
  for (const [name, script] of Object.entries(scripts)) {
    assertNoForbiddenNpmInvocations(script, `package script ${name}`);
    assert.doesNotMatch(script, forbiddenAuthentication);
    assert.doesNotMatch(
      script,
      forbiddenRegistryConfiguration,
      `package script ${name} must not reconfigure npm registry or authentication`,
    );
  }
}

function assertReviewedPackageScripts(scripts: Readonly<Record<string, string>>): void {
  const canonical = JSON.stringify(
    Object.keys(scripts).sort().map((name) => [name, scripts[name]]),
  );
  assert.equal(sha256(Buffer.from(canonical)), expectedPackageScriptsSha256);
  assertSafePackageScripts(scripts);
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
      "      - main",
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

function assertUnconditional(
  job: ParsedWorkflowJob,
  name: string,
  allowedStepProperties?: readonly string[],
): ParsedWorkflowStep {
  assert.equal(job.properties.if, undefined, "required jobs must not use if");
  assert.equal(
    job.properties["continue-on-error"],
    undefined,
    "required jobs must propagate failures",
  );
  const step = requiredStep(job, name);
  const allowedProperties = new Set(allowedStepProperties ?? (
    step.properties.uses === undefined
      ? ["name", "run"]
      : ["name", "uses", "with"]
  ));
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

function shellControlLines(step: ParsedWorkflowStep): string[] {
  const lines: string[] = [];
  let heredoc: string | undefined;
  for (const line of (step.run ?? "").split("\n")) {
    const trimmed = line.trim();
    if (heredoc !== undefined) {
      if (trimmed === heredoc) {
        heredoc = undefined;
      }
      continue;
    }
    lines.push(trimmed);
    const delimiter = line.match(/<<['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?\s*$/)?.[1];
    if (delimiter !== undefined) {
      heredoc = delimiter;
    }
  }
  return lines.filter(Boolean);
}

function normalizedVerificationBody(step: ParsedWorkflowStep): string {
  return (step.run ?? "")
    .split("\n")
    .filter((line) => !/^\s*(?:rm -rf "\$(?:example|release)_root"|mkdir(?: -p)? "\$(?:example_root|first)"(?: "\$second")?|trap 'rm -rf "\$release_root"' EXIT)\s*$/.test(line))
    .map((line) => line.replace(
      /^(\s*)(example_root|release_root)=".*"$/,
      "$1$2=\"<temporary-root>\"",
    ))
    .join("\n");
}

function assertReadOnlyCiWorkflow(workflow: string): void {
  assert.equal(sha256(Buffer.from(workflow)), expectedCiWorkflowSha256);
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
  assertNoForbiddenNpmInvocations(yaml, "CI workflow");
  assert.doesNotMatch(yaml, forbiddenAuthentication);
  assert.doesNotMatch(yaml, forbiddenRegistryConfiguration);
  assert.doesNotMatch(yaml, /\.npmrc\b/i);
  assert.doesNotMatch(yaml, /^\s*packages:\s*['"]?write['"]?\s*$/mi);
  const parsed = parseCiWorkflow(yaml);
  assert.deepEqual(parsed.triggers, {
    pullRequest: true,
    pushBranches: ["main"],
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
    { os: "ubuntu-latest", node: "24.19.0" },
    { os: "macos-latest", node: "24.14.0" },
    { os: "macos-latest", node: "24.19.0" },
    { os: "windows-latest", node: "24.14.0" },
    { os: "windows-latest", node: "24.19.0" },
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
  const releasedArtifactStep = requiredStep(
    distributionJob,
    "Verify deterministic distribution assets and clean installation",
  );
  assert.deepEqual(Object.keys(releasedArtifactStep.properties), ["name", "if", "run"]);
  assert.equal(
    releasedArtifactStep.properties.if,
    `\${{ github.sha == '${expectedReleaseCommit}' }}`,
  );
  assert.equal(releasedArtifactStep.properties["continue-on-error"], undefined);
  assert.equal(
    commandLines(releasedArtifactStep).filter(
      (line) => /node scripts\/build-github-prerelease\.mjs\b/.test(line),
    ).length,
    2,
  );
  assert.match(releasedArtifactStep.run ?? "", /sha256sum -c SHA256SUMS/);
}

function assertGitHubPrereleaseWorkflow(workflow: string): void {
  assert.equal(
    sha256(Buffer.from(workflow)),
    expectedGitHubPrereleaseWorkflowSha256,
  );
  const yaml = workflow
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");
  const lines = yaml.split("\n");
  const topLevelKeys = lines.flatMap((line) => {
    if (indentation(line) !== 0 || !line.trim()) {
      return [];
    }
    const entry = line.match(/^([a-z0-9_-]+):/);
    return entry ? [entry[1] as string] : [];
  });

  assert.deepEqual(topLevelKeys, ["name", "on", "permissions", "jobs"]);
  assert.doesNotMatch(workflow, /\t/, "workflow indentation must not use tabs");
  assert.doesNotMatch(yaml, /(?:^|[\s:[{,])\*[A-Za-z_][A-Za-z0-9_-]*/m);
  assertNoForbiddenNpmInvocations(yaml, "GitHub prerelease workflow");
  assert.doesNotMatch(yaml, forbiddenAuthentication);
  assert.doesNotMatch(yaml, forbiddenRegistryConfiguration);
  assert.doesNotMatch(yaml, /\.npmrc\b/i);
  assert.doesNotMatch(yaml, /^\s*packages:\s*['"]?write['"]?\s*$/mi);
  assert.doesNotMatch(yaml, /\bworkflow_dispatch\b/);
  assert.doesNotMatch(yaml, /--latest\b|make_latest\s*:/i);
  assert.doesNotMatch(yaml, /\bmktemp\b/);
  assert.doesNotMatch(yaml, /\bgit\s+(?:tag|push)\b|\/git\/refs\b/i);

  const onIndex = lines.indexOf("on:");
  const permissionsIndex = lines.indexOf("permissions:");
  const jobsIndex = lines.indexOf("jobs:");
  assert.notEqual(onIndex, -1);
  assert.notEqual(permissionsIndex, -1);
  assert.notEqual(jobsIndex, -1);
  assert.deepEqual(
    lines.slice(onIndex + 1, permissionsIndex).filter((line) => line.trim()),
    [
      "  push:",
      "    tags:",
      '      - "v*"',
    ],
  );
  assertReadOnlyPermissions(nestedMapping(lines, permissionsIndex, 2), "workflow");

  const jobHeaders = lines.flatMap((line, index) => {
    if (index <= jobsIndex) {
      return [];
    }
    const match = line.match(/^ {2}([a-z0-9_-]+):$/);
    return match ? [{ index, name: match[1] as string }] : [];
  });
  assert.deepEqual(jobHeaders.map(({ name }) => name), ["verify", "publish"]);
  const parseJob = (position: number): ParsedWorkflowJob => {
    const header = jobHeaders[position] as { readonly index: number; readonly name: string };
    const end = jobHeaders[position + 1]?.index ?? lines.length;
    const jobLines = lines.slice(header.index, end);
    const properties: Record<string, string> = {};
    let permissions: Readonly<Record<string, string>> | string | undefined;
    let steps: ParsedWorkflowStep[] = [];
    for (let index = 1; index < jobLines.length; index += 1) {
      const line = jobLines[index] as string;
      if (indentation(line) !== 4 || !line.trim()) {
        continue;
      }
      const property = line.match(/^ {4}([a-z0-9_-]+):\s*(.*?)\s*$/);
      assert.ok(property, `unsupported ${header.name} job property: ${line}`);
      if (property[1] === "steps") {
        steps = parseWorkflowSteps(jobLines, index, jobLines.length);
      } else if (property[1] === "permissions") {
        permissions = nestedMapping(jobLines, index, 6);
      } else {
        properties[property[1] as string] = yamlScalar(property[2] as string);
      }
    }
    return {
      properties,
      ...(permissions === undefined ? {} : { permissions }),
      steps,
      raw: jobLines.join("\n"),
    };
  };
  const job = parseJob(0);
  const publishJob = parseJob(1);
  const steps = job.steps;
  const publishSteps = publishJob.steps;
  assert.deepEqual(job.properties, {
    name: "Read-only release verification",
    "runs-on": "ubuntu-latest",
    "timeout-minutes": "30",
  });
  assertReadOnlyPermissions(job.permissions as Readonly<Record<string, string>>, "verify job");
  assert.deepEqual(publishJob.properties, {
    name: "Attest and publish GitHub prerelease",
    needs: "verify",
    "runs-on": "ubuntu-latest",
    "timeout-minutes": "15",
  });
  assert.deepEqual(publishJob.permissions, {
    contents: "write",
    "id-token": "write",
    attestations: "write",
  });

  const actionReferences = [...steps, ...publishSteps].flatMap((step) =>
    step.properties.uses === undefined ? [] : [step.properties.uses]
  );
  assert.deepEqual(actionReferences, [
    "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
    "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
    "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
    "actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c",
    "actions/attest-build-provenance@4d101475d8b20a2381f78447822ac1eab6504dd8",
  ]);
  for (const reference of actionReferences) {
    assert.match(reference, /^actions\/[a-z0-9_-]+@[0-9a-f]{40}$/);
  }
  assert.doesNotMatch(publishJob.raw, /actions\/checkout|actions\/setup-node/);
  assert.doesNotMatch(
    publishJob.raw,
    /(?:^|\s)(?:npm|npx)\b|node_modules|package\.json|scripts\/|git\s/m,
  );

  const ci = parseCiWorkflow(readFileSync(ciWorkflow, "utf8"));
  const ciVerifyJob = ci.jobs.verify as ParsedWorkflowJob;
  const ciDistributionJob = ci.jobs.distribution as ParsedWorkflowJob;

  const checkout = assertUnconditional(job, "Check out immutable tag");
  assert.match(checkout.raw, /^ {10}fetch-depth: 0$/m);
  assert.match(checkout.raw, /^ {10}persist-credentials: false$/m);
  const setup = assertUnconditional(job, "Set up Node.js");
  assert.match(setup.raw, /^ {10}node-version: "24\.14\.0"$/m);
  assert.match(setup.raw, /^ {10}cache: npm$/m);

  const validate = assertUnconditional(job, "Validate tag and package identity");
  const install = assertUnconditional(job, "Install dependencies without lifecycle scripts");
  assert.ok(steps.indexOf(validate) < steps.indexOf(install));
  assert.equal(install.run, "npm ci --ignore-scripts --prefer-offline");
  assert.match(validate.run ?? "", /^set -euo pipefail$/m);
  assert.match(validate.run ?? "", /^git fetch --no-tags origin main$/m);
  assert.match(validate.run ?? "", /^test "\$GITHUB_REF_TYPE" = "tag"$/m);
  assert.match(
    validate.run ?? "",
    /^package_version="\$\(node -p "require\('\.\/package\.json'\)\.version"\)"$/m,
  );
  assert.match(
    validate.run ?? "",
    /^package_private="\$\(node -p "require\('\.\/package\.json'\)\.private"\)"$/m,
  );
  assert.match(
    validate.run ?? "",
    /^test "\$GITHUB_REF_NAME" = "v\$package_version"$/m,
  );
  assert.match(validate.run ?? "", /^test "\$package_private" = "true"$/m);
  assert.match(
    validate.run ?? "",
    /^test "\$\(git cat-file -t "refs\/tags\/\$GITHUB_REF_NAME"\)" = "tag"$/m,
  );
  assert.match(
    validate.run ?? "",
    /^tag_commit="\$\(git rev-parse "refs\/tags\/\$GITHUB_REF_NAME\^\{\}"\)"$/m,
  );
  assert.match(validate.run ?? "", /^test "\$tag_commit" = "\$GITHUB_SHA"$/m);
  assert.match(
    validate.run ?? "",
    /^test "\$tag_commit" = "\$\(git rev-parse origin\/main\)"$/m,
  );
  assert.match(
    validate.run ?? "",
    /^test "\$GITHUB_SHA" = "\$\(git rev-parse origin\/main\)"$/m,
  );
  assert.ok(
    (validate.run ?? "").indexOf("git fetch --no-tags origin main") <
      (validate.run ?? "").indexOf("git cat-file -t"),
  );
  assert.deepEqual(shellControlLines(validate), [
    "set -euo pipefail",
    'test "$GITHUB_REF_TYPE" = "tag"',
    'package_version="$(node -p "require(\'./package.json\').version")"',
    'package_private="$(node -p "require(\'./package.json\').private")"',
    'test "$GITHUB_REF_NAME" = "v$package_version"',
    'test "$package_private" = "true"',
    "git fetch --no-tags origin main",
    'test "$(git cat-file -t "refs/tags/$GITHUB_REF_NAME")" = "tag"',
    'tag_commit="$(git rev-parse "refs/tags/$GITHUB_REF_NAME^{}")"',
    'test "$tag_commit" = "$GITHUB_SHA"',
    'test "$tag_commit" = "$(git rev-parse origin/main)"',
    'test "$GITHUB_SHA" = "$(git rev-parse origin/main)"',
  ]);

  const fullVerification = assertUnconditional(job, "Run full SDK verification");
  assert.ok(steps.indexOf(install) < steps.indexOf(fullVerification));
  assert.deepEqual(commandLines(fullVerification), [
    "set -euo pipefail",
    "npm test",
    "npx tsc --noEmit",
    "npm run check",
  ]);
  assert.deepEqual(
    commandLines(fullVerification).slice(1),
    [
      assertUnconditional(ciVerifyJob, "Run package tests").run,
      assertUnconditional(ciVerifyJob, "Typecheck").run,
      assertUnconditional(ciVerifyJob, "Check syntax").run,
    ],
  );

  const examples = assertUnconditional(job, "Run examples and package checks");
  const currentExamples = assertUnconditional(
    ciDistributionJob,
    "Run examples and package checks",
  );
  assert.ok(steps.indexOf(fullVerification) < steps.indexOf(examples));
  assert.match(currentExamples.run ?? "", /^\s*npm run example:workflow$/m);
  assert.doesNotMatch(
    examples.run ?? "",
    /^\s*npm run example:workflow$/m,
    "the immutable v0.6.0 prerelease workflow must not acquire later examples",
  );
  assert.equal(
    normalizedVerificationBody(examples),
    normalizedVerificationBody(currentExamples)
      .split("\n")
      .filter((line) => line.trim() !== "npm run example:workflow")
      .join("\n"),
  );
  assert.match(examples.run ?? "", /\$\{\{ runner\.temp \}\}\/release-examples/);

  const distribution = assertUnconditional(
    job,
    "Verify deterministic distribution assets and clean installation",
  );
  assert.ok(steps.indexOf(examples) < steps.indexOf(distribution));
  assert.equal(
    normalizedVerificationBody(distribution),
    normalizedVerificationBody(requiredStep(
      ciDistributionJob,
      "Verify deterministic distribution assets and clean installation",
    )),
  );
  assert.match(distribution.run ?? "", /\$\{\{ runner\.temp \}\}\/github-prerelease/);

  const upload = assertUnconditional(job, "Upload verified release assets");
  assert.ok(steps.indexOf(distribution) < steps.indexOf(upload));
  assert.match(upload.raw, /^ {10}name: github-prerelease-assets$/m);
  assert.match(upload.raw, /^ {10}if-no-files-found: error$/m);
  assert.match(upload.raw, /^ {10}overwrite: true$/m);
  assert.match(upload.raw, /^ {10}retention-days: 1$/m);
  for (const asset of expectedAssets) {
    assert.match(
      upload.raw,
      new RegExp(`^ {12}\\$\\{\\{ runner\\.temp \\}\\}/github-prerelease/first/${asset.replaceAll(".", "\\.")}$`, "m"),
    );
  }

  const download = assertUnconditional(publishJob, "Download verified release assets");
  assert.match(download.raw, /^ {10}name: github-prerelease-assets$/m);
  assert.match(
    download.raw,
    /^ {10}path: \$\{\{ runner\.temp \}\}\/github-prerelease-assets$/m,
  );
  const transferred = assertUnconditional(publishJob, "Verify transferred release assets");
  assert.ok(publishSteps.indexOf(download) < publishSteps.indexOf(transferred));
  assert.match(transferred.run ?? "", /sha256sum -c SHA256SUMS/);
  assert.match(transferred.run ?? "", /manifest\.commit, process\.env\.GITHUB_SHA/);
  assert.match(transferred.run ?? "", /manifest\.npmVersion/);
  assert.match(transferred.run ?? "", new RegExp(expectedTarballSha256));
  assert.match(transferred.run ?? "", /asset\.bytes, bytes\.length/);
  assert.match(
    transferred.run ?? "",
    /assert\.equal\(\s*asset\.sha256,\s*createHash\("sha256"\)\.update\(bytes\)\.digest\("hex"\),\s*\);/,
  );
  assert.match(transferred.run ?? "", /assert\.deepEqual\(sbom,/);
  assertCanonicalChecksumVerifier(transferred.run ?? "");

  const attest = assertUnconditional(publishJob, "Attest release assets");
  assert.ok(publishSteps.indexOf(transferred) < publishSteps.indexOf(attest));
  assert.equal(attest.run, undefined);
  const subjectPaths = [...attest.raw.matchAll(/^ {12}([^\s].*)$/gm)].map(
    (match) => match[1],
  );
  assert.deepEqual(subjectPaths, expectedAssets.map(
    (asset) => `\${{ runner.temp }}/github-prerelease-assets/${asset}`,
  ));

  const release = assertUnconditional(
    publishJob,
    "Create or update GitHub prerelease",
    ["name", "env", "run"],
  );
  assert.ok(publishSteps.indexOf(attest) < publishSteps.indexOf(release));
  assert.deepEqual(Object.keys(release.properties), ["name", "env", "run"]);
  assert.match(
    release.raw,
    /^ {10}GH_TOKEN: \$\{\{ github\.token \}\}$/m,
  );
  assert.match(
    release.raw,
    /^ {10}GH_REPO: \$\{\{ github\.repository \}\}$/m,
  );
  assert.deepEqual(shellControlLines(release), [
    "set -euo pipefail",
    'release_dir="${{ runner.temp }}/github-prerelease-assets"',
    "assets=(",
    '"$release_dir/SHA256SUMS"',
    '"$release_dir/collective-cognition-sdk-0.6.0.cdx.json"',
    '"$release_dir/collective-cognition-sdk-0.6.0.tgz"',
    '"$release_dir/release-manifest.json"',
    ")",
    "verify_existing_release() {",
    'local release_json="$1"',
    'RELEASE_JSON="$release_json" node --input-type=module <<\'NODE\'',
    "}",
    'if release_json="$(gh release view "$GITHUB_REF_NAME" --json isPrerelease,isDraft,assets)"; then',
    'verify_existing_release "$release_json"',
    "else",
    'gh release create "$GITHUB_REF_NAME" --prerelease --verify-tag --generate-notes',
    "fi",
    'gh release upload "$GITHUB_REF_NAME" --clobber "${assets[@]}"',
  ]);
  assert.equal(
    [...(release.run ?? "").matchAll(
      /gh release view "\$GITHUB_REF_NAME" --json isPrerelease,isDraft,assets/g,
    )].length,
    1,
  );
  assert.match(release.run ?? "", /^verify_existing_release\(\) \{$/m);
  assert.match(release.run ?? "", /assert\.equal\(release\.isPrerelease, true\);/);
  assert.match(release.run ?? "", /assert\.equal\(release\.isDraft, false\);/);
  assert.match(release.run ?? "", /assert\.equal\(new Set\(names\)\.size, names\.length\);/);
  assert.match(release.run ?? "", /assert\.equal\(expectedNames\.includes\(name\), true\);/);
  assert.match(release.run ?? "", /^\s*verify_existing_release "\$release_json"$/m);
  assert.match(
    release.run ?? "",
    /gh release create "\$GITHUB_REF_NAME" --prerelease --verify-tag --generate-notes/,
  );
  assert.match(
    release.run ?? "",
    /^gh release upload "\$GITHUB_REF_NAME" --clobber "\$\{assets\[@\]\}"$/m,
  );
  const uploadAssets = (release.run ?? "").match(/^assets=\(\n([\s\S]*?)^\)$/m);
  assert.ok(uploadAssets);
  assert.deepEqual(
    (uploadAssets[1] as string).split("\n").map((line) => line.trim()).filter(Boolean),
    expectedAssets.map((asset) => `"$release_dir/${asset}"`),
  );

  const inventory = assertUnconditional(
    publishJob,
    "Verify exact GitHub release inventory",
    ["name", "env", "run"],
  );
  assert.ok(publishSteps.indexOf(release) < publishSteps.indexOf(inventory));
  assert.deepEqual(Object.keys(inventory.properties), ["name", "env", "run"]);
  assert.match(inventory.raw, /^ {10}GH_TOKEN: \$\{\{ github\.token \}\}$/m);
  assert.match(inventory.raw, /^ {10}GH_REPO: \$\{\{ github\.repository \}\}$/m);
  assert.deepEqual(
    publishSteps.filter((step) => /GH_TOKEN/.test(step.raw)).map((step) => step.properties.name),
    ["Create or update GitHub prerelease", "Verify exact GitHub release inventory"],
  );
  assert.deepEqual(
    publishSteps.filter((step) => /GH_REPO/.test(step.raw)).map((step) => step.properties.name),
    ["Create or update GitHub prerelease", "Verify exact GitHub release inventory"],
  );
  assert.deepEqual(shellControlLines(inventory), [
    "set -euo pipefail",
    'release_json="$(gh release view "$GITHUB_REF_NAME" --json isPrerelease,isDraft,assets)"',
    'RELEASE_JSON="$release_json" node --input-type=module <<\'NODE\'',
  ]);
  assert.match(inventory.run ?? "", /assert\.equal\(release\.isPrerelease, true\);/);
  assert.match(inventory.run ?? "", /assert\.equal\(release\.isDraft, false\);/);
  assert.match(inventory.run ?? "", /assert\.equal\(Array\.isArray\(release\.assets\), true\);/);
  assert.match(inventory.run ?? "", /assert\.equal\(new Set\(names\)\.size, names\.length\);/);
  assert.match(inventory.run ?? "", /assert\.deepEqual\(\[\.\.\.names\]\.sort\(\), expectedNames\);/);
}

function assertGitHubReleaseConfig(config: string): void {
  assert.doesNotMatch(config, /exclude:/i);
  assert.doesNotMatch(config, /contributors?:|authors?:/i);
  const categories = [...config.matchAll(/^ {4}- title: (.+)$/gm)].map(
    (match) => yamlScalar(match[1] as string),
  );
  assert.deepEqual(categories, [
    "Features",
    "Fixes",
    "Documentation",
    "Dependencies",
    "Other Changes",
  ]);
  assert.match(config, /labels:\n {8}- enhancement\n {8}- feature/);
  assert.match(config, /labels:\n {8}- bug\n {8}- fix/);
  assert.match(config, /labels:\n {8}- documentation\n {8}- docs/);
  assert.match(config, /labels:\n {8}- dependencies/);
  assert.match(config, /labels:\n {8}- "\*"/);
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

releaseArtifactTest("release builder creates the exact deterministic asset set", () => {
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

releaseArtifactTest("release manifest, checksums, and SBOM are exact", () => {
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
    assert.equal(sha256(tarball), expectedTarballSha256);
    const sbom = readJson(
      join(output, "collective-cognition-sdk-0.6.0.cdx.json"),
    );
    const manifest = readJson(join(output, "release-manifest.json")) as {
      readonly repository: string;
      readonly tag: string;
      readonly commit: string;
      readonly package: { readonly name: string; readonly version: string; readonly private: boolean };
      readonly nodeVersion: string;
      readonly npmVersion: string;
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
      npmVersion: expectedNpmVersion,
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

releaseArtifactTest("release builder runs tools without a shell and preserves literal metacharacters", () => {
  const root = mkdtempSync(join(tmpdir(), "cc-release-shell-free-"));
  const output = createOutput(root, "output;literal&value");
  const shadowPath = createOutput(root, "shadow-path");
  const shadowMarker = join(root, "shadow-npm-ran");
  const shadowNpm = join(
    shadowPath,
    process.platform === "win32" ? "npm.cmd" : "npm",
  );

  try {
    writeFileSync(
      shadowNpm,
      process.platform === "win32"
        ? `@echo off\r\necho hostile>"${shadowMarker}"\r\nexit /b 1\r\n`
        : `#!${process.execPath}\nimport { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(shadowMarker)}, "hostile\\n");\nprocess.exit(1);\n`,
    );
    chmodSync(shadowNpm, 0o755);
    assert.doesNotMatch(readFileSync(builder, "utf8"), /\bshell\s*:/);
    const result = runBuilder(["--output", output], { PATH: shadowPath });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(readdirSync(output).sort(), expectedAssets);
    assert.equal(existsSync(shadowMarker), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

releaseArtifactTest("release builder rejects forged npm identity version and POSIX mode", () => {
  const root = mkdtempSync(join(tmpdir(), "cc-release-npm-trust-"));
  const cases = [
    {
      name: "identity",
      metadata: { name: "not-npm", version: "9.6.7", bin: { npm: "bin/npm-cli.js" } },
      reportedVersion: "9.6.7",
      invokesCli: false,
      writableMode: false,
    },
    {
      name: "metadata-version",
      metadata: { name: "npm", version: "latest", bin: { npm: "bin/npm-cli.js" } },
      reportedVersion: "9.6.7",
      invokesCli: false,
      writableMode: false,
    },
    {
      name: "reported-version",
      metadata: { name: "npm", version: "9.6.7", bin: { npm: "bin/npm-cli.js" } },
      reportedVersion: "9.6.8",
      invokesCli: true,
      writableMode: false,
    },
    ...(process.platform === "win32"
      ? []
      : [{
          name: "writable-mode",
          metadata: { name: "npm", version: "9.6.7", bin: { npm: "bin/npm-cli.js" } },
          reportedVersion: "9.6.7",
          invokesCli: false,
          writableMode: true,
        }]),
  ];

  try {
    for (const npmCase of cases) {
      const caseRoot = createOutput(root, npmCase.name);
      const output = createOutput(caseRoot, "output");
      const trustedBin = createOutput(caseRoot, "trusted-bin");
      const node = join(
        trustedBin,
        process.platform === "win32" ? "node.exe" : "node",
      );
      const npmCli = join(trustedBin, "node_modules", "npm", "bin", "npm-cli.js");
      const marker = join(caseRoot, "npm-cli-invoked");
      copyFileSync(process.execPath, node);
      chmodSync(node, 0o755);
      mkdirSync(dirname(npmCli), { recursive: true });
      writeFileSync(
        join(dirname(dirname(npmCli)), "package.json"),
        `${JSON.stringify(npmCase.metadata)}\n`,
      );
      writeFileSync(
        npmCli,
        `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(marker)}, "invoked\\n");\nif (process.argv[2] === "--version") { process.stdout.write(${JSON.stringify(`${npmCase.reportedVersion}\n`)}); process.exit(0); }\nprocess.exit(1);\n`,
      );
      if (npmCase.writableMode) {
        chmodSync(npmCli, 0o666);
      }

      const result = runBuilder(["--output", output], {}, node);
      assert.notEqual(result.status, 0, npmCase.name);
      assert.deepEqual(JSON.parse(result.stderr), {
        ok: false,
        error: "NPM_UNAVAILABLE",
      });
      assert.equal(existsSync(marker), npmCase.invokesCli);
      assert.deepEqual(readdirSync(output), []);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

releaseArtifactTest("release builder isolates failing subprocesses and preserves swapped output", () => {
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
      join(dirname(dirname(npmCli)), "package.json"),
      `${JSON.stringify({
        name: "npm",
        version: "9.6.7",
        bin: { npm: "bin/npm-cli.js", npx: "bin/npx-cli.js" },
      })}\n`,
    );
    writeFileSync(
      npmCli,
      `import { rmSync, symlinkSync, writeFileSync } from "node:fs";\nif (process.argv[2] === "--version") { process.stdout.write("9.6.7\\n"); process.exit(0); }\nwriteFileSync(${JSON.stringify(observedEnvironment)}, JSON.stringify({ home: process.env.HOME, path: process.env.PATH, userconfig: process.env.npm_config_userconfig, globalconfig: process.env.npm_config_globalconfig }));\nrmSync(${JSON.stringify(output)}, { recursive: true, force: true });\nsymlinkSync(${JSON.stringify(external)}, ${JSON.stringify(output)});\nprocess.stderr.write(${JSON.stringify(`${secret} ${root}\n`)});\nprocess.exit(1);\n`,
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

releaseArtifactTest("release cleanup failures preserve diagnostics and block publication", () => {
  if (process.platform === "win32") {
    return;
  }
  const root = mkdtempSync(join(tmpdir(), "cc-release-cleanup-"));
  const sourceOutput = createOutput(root, "source-output");
  const fixtureTarball = join(sourceOutput, "collective-cognition-sdk-0.6.0.tgz");
  const secret = "cleanup-failure-secret-must-not-leak";

  const runCase = (name: string, failBuild: boolean) => {
    const caseRoot = createOutput(root, name);
    const output = createOutput(caseRoot, "output");
    const trustedBin = createOutput(caseRoot, "trusted-bin");
    const runtimeRoot = createOutput(caseRoot, "runtime-root");
    const node = join(trustedBin, "node");
    const npmCli = join(caseRoot, "lib", "node_modules", "npm", "bin", "npm-cli.js");
    copyFileSync(process.execPath, node);
    chmodSync(node, 0o755);
    mkdirSync(dirname(npmCli), { recursive: true });
    writeFileSync(
      join(dirname(dirname(npmCli)), "package.json"),
      `${JSON.stringify({
        name: "npm",
        version: "9.6.7",
        bin: { npm: "bin/npm-cli.js", npx: "bin/npx-cli.js" },
      })}\n`,
    );
    writeFileSync(
      npmCli,
      `import { chmodSync, copyFileSync, mkdirSync, writeFileSync } from "node:fs";\nimport { dirname, join } from "node:path";\nconst args = process.argv.slice(2);\nconst blockCleanup = () => { const blocked = join(dirname(process.env.HOME), "blocked"); mkdirSync(blocked); writeFileSync(join(blocked, "sentinel"), "locked\\n"); chmodSync(blocked, 0o000); };\nif (args[0] === "--version") { process.stdout.write("9.6.7\\n"); process.exit(0); }\nif (args[0] === "run") { ${failBuild ? `blockCleanup(); process.stderr.write(${JSON.stringify(`${secret} ${caseRoot}\n`)}); process.exit(1);` : "process.exit(0);"} }\nif (args[0] === "pack") { const destination = args[args.indexOf("--pack-destination") + 1]; copyFileSync(${JSON.stringify(fixtureTarball)}, join(destination, "collective-cognition-sdk-0.6.0.tgz")); blockCleanup(); process.stdout.write(JSON.stringify([{ filename: "collective-cognition-sdk-0.6.0.tgz" }])); process.exit(0); }\nprocess.exit(1);\n`,
    );

    const result = runBuilder(
      ["--output", output],
      { TMPDIR: runtimeRoot, RELEASE_TEST_SECRET: secret },
      node,
    );
    const runtimeDirectories = readdirSync(runtimeRoot).map((entry) =>
      join(runtimeRoot, entry)
    );
    try {
      assert.notEqual(result.status, 0);
      assert.equal(result.stdout, "");
      assert.deepEqual(JSON.parse(result.stderr), {
        ok: false,
        error: failBuild ? "BUILD_FAILED" : "CLEANUP_FAILED",
      });
      assert.deepEqual(readdirSync(output), []);
      for (const value of [secret, caseRoot, repositoryRoot]) {
        assert.doesNotMatch(
          result.stderr,
          new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        );
      }
    } finally {
      for (const runtimeDirectory of runtimeDirectories) {
        const blocked = join(runtimeDirectory, "blocked");
        if (existsSync(blocked)) {
          chmodSync(blocked, 0o700);
        }
        rmSync(runtimeDirectory, { recursive: true, force: true });
      }
    }
  };

  try {
    const fixtureResult = runBuilder(["--output", sourceOutput]);
    assert.equal(fixtureResult.status, 0, fixtureResult.stderr);
    runCase("primary-failure", true);
    runCase("cleanup-changes-outcome", false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

releaseArtifactTest("release builder rejects npm publication verbs after global options", () => {
  const packagePath = join(repositoryRoot, "package.json");
  const original = readFileSync(packagePath, "utf8");
  const root = mkdtempSync(join(tmpdir(), "cc-release-package-mutations-"));
  const commands = [
    "npm --silent publish",
    "npm --workspace package-a publish",
    "npm --workspace=package-a publish",
    "npm -w package-a publish",
    "npm --prefix /tmp/package-a publish",
    ...publicationWrapperMutations,
  ];

  try {
    for (const [index, command] of commands.entries()) {
      const metadata = JSON.parse(original) as {
        scripts: Record<string, string>;
      };
      metadata.scripts.releaseMutation = command;
      writeFileSync(packagePath, `${JSON.stringify(metadata, null, 2)}\n`);
      const output = createOutput(root, `output-${index}`);
      const result = runBuilder(["--output", output]);
      assert.notEqual(result.status, 0, command);
      assert.deepEqual(JSON.parse(result.stderr), {
        ok: false,
        error: "INVALID_PACKAGE",
      });
      assert.equal(result.stdout, "");
      assert.deepEqual(readdirSync(output), []);
    }
  } finally {
    writeFileSync(packagePath, original);
    rmSync(root, { recursive: true, force: true });
  }
});

releaseArtifactTest("release builder rejects package script map drift before script execution", () => {
  const packagePath = join(repositoryRoot, "package.json");
  const original = readFileSync(packagePath, "utf8");
  const root = mkdtempSync(join(tmpdir(), "cc-release-script-contract-"));
  const output = createOutput(root, "output");
  const marker = join(root, "unreviewed-script-executed");

  try {
    const metadata = JSON.parse(original) as {
      scripts: Record<string, string>;
    };
    const markerProgram = `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(marker)}, "executed");`;
    metadata.scripts.build = `node --input-type=module --eval ${JSON.stringify(markerProgram)}`;
    writeFileSync(packagePath, `${JSON.stringify(metadata, null, 2)}\n`);

    const result = runBuilder(["--output", output]);
    assert.notEqual(result.status, 0);
    assert.deepEqual(JSON.parse(result.stderr), {
      ok: false,
      error: "INVALID_PACKAGE",
    });
    assert.equal(result.stdout, "");
    assert.equal(existsSync(marker), false);
    assert.deepEqual(readdirSync(output), []);
  } finally {
    writeFileSync(packagePath, original);
    rmSync(root, { recursive: true, force: true });
  }
});

releaseArtifactTest("release builder rejects drift from the finalized package artifact", () => {
  const readmePath = join(repositoryRoot, "README.md");
  const original = readFileSync(readmePath, "utf8");
  const root = mkdtempSync(join(tmpdir(), "cc-release-tarball-drift-"));
  const output = createOutput(root, "output");

  try {
    writeFileSync(readmePath, `${original}\nUnreviewed packaged byte drift.\n`);
    const result = runBuilder(["--output", output]);
    assert.notEqual(result.status, 0);
    assert.deepEqual(JSON.parse(result.stderr), {
      ok: false,
      error: "PACKAGE_ARTIFACT_DRIFT",
    });
    assert.equal(result.stdout, "");
    assert.deepEqual(readdirSync(output), []);
  } finally {
    writeFileSync(readmePath, original);
    rmSync(root, { recursive: true, force: true });
  }
});

test("reviewed release text uses repository-enforced LF normalization", () => {
  assert.equal(existsSync(gitAttributes), true, ".gitattributes must be tracked");
  const rules = readFileSync(gitAttributes, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  for (const rule of [
    ".gitattributes text eol=lf",
    ".github/workflows/*.yml text eol=lf",
    "package.json text eol=lf",
    "*.md text eol=lf",
    "*.json text eol=lf",
    "*.jsonl text eol=lf",
    "*.ts text eol=lf",
    "*.mjs text eol=lf",
    "*.js text eol=lf",
    "*.yml text eol=lf",
    "*.yaml text eol=lf",
    "*.sh text eol=lf",
    "*.bash text eol=lf",
    "*.zsh text eol=lf",
    "*.cff text eol=lf",
    "LICENSE text eol=lf",
    "NOTICE text eol=lf",
  ]) {
    assert.equal(rules.includes(rule), true, `missing LF rule: ${rule}`);
  }
  assert.equal(rules.some((rule) => /^\*\s+.*\btext\b/.test(rule)), false);

  const reviewedTextPaths = [
    ".gitattributes",
    ".github/workflows/ci.yml",
    ".github/workflows/github-prerelease.yml",
    "package.json",
    "README.md",
    "docs/durable-cognition-workflow-guide.md",
    "docs/github-prerelease.md",
    "docs/public-api.md",
    "docs/ROADMAP.md",
    "rfcs/README.md",
    "rfcs/0010-durable-cognition-workflow.md",
    "spec/README.md",
    "spec/compatibility.md",
    "spec/compatibility/0.9.0/baseline.json",
    "spec/compatibility/0.9.0/change-cases.jsonl",
    "scripts/build-github-prerelease.mjs",
    "src/index.ts",
    "tests/release-readiness.test.ts",
    "tests/package.test.mjs",
    "spec/compatibility/0.6.0/baseline.json",
    "spec/compatibility/0.6.0/change-cases.jsonl",
    "scripts/release.sh",
    "CITATION.cff",
    "LICENSE",
    "NOTICE",
  ];
  const lf = Buffer.from("first\nsecond\n");
  const crlf = Buffer.from("first\r\nsecond\r\n");
  for (const path of reviewedTextPaths) {
    const attributes = runGit(["check-attr", "text", "eol", "--", path]);
    assert.match(attributes, new RegExp(`^${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: text: set$`, "m"));
    assert.match(attributes, new RegExp(`^${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: eol: lf$`, "m"));
    assert.equal(gitFilteredHash(path, lf), gitFilteredHash(path, crlf));
    const trackedPath = join(repositoryRoot, path);
    if (existsSync(trackedPath)) {
      assert.equal(readFileSync(trackedPath).includes(0x0d), false, `${path} must contain LF bytes`);
    }
  }

  for (const path of ["assets/image.png", "artifacts/release.tgz", "fixtures/state.db"]) {
    const attributes = runGit(["check-attr", "text", "eol", "--", path]);
    assert.match(attributes, /: text: unset$/m);
    assert.match(attributes, /: eol: unspecified$/m);
    assert.notEqual(gitFilteredHash(path, lf), gitFilteredHash(path, crlf));
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
  assert.match(support, /no production support|not provide production support/i);
  assert.match(support, /no (?:long-term support|LTS)|not (?:an? )?LTS/i);
  assert.match(changelog, /0\.6\.0/);
  assert.match(changelog, /private|unpublished/i);
  assert.match(
    changelog,
    /https:\/\/github\.com\/xiongxhc\/collective-cognition-sdk\/releases\/tag\/v0\.6\.0/,
  );
  assert.doesNotMatch(changelog, /\bit is distributed\b/i);
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
  const workflow = readReviewedWorkflow(ciWorkflow, expectedCiWorkflowSha256);
  const packageJson = readJson(join(repositoryRoot, "package.json")) as {
    readonly scripts: Readonly<Record<string, string>>;
  };

  assertReviewedPackageScripts(packageJson.scripts);
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
  for (const subpath of releasedPackageExports) {
    const specifier = subpath === "."
      ? releasedPackageName
      : `${releasedPackageName}${subpath.slice(1)}`;
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
  const workflow = readReviewedWorkflow(ciWorkflow, expectedCiWorkflowSha256);
  const packageScripts = (readJson(join(repositoryRoot, "package.json")) as {
    readonly scripts: Readonly<Record<string, string>>;
  }).scripts;
  const unsafeWorkflows = [
    workflow.replace("    runs-on: ${{ matrix.os }}", "\truns-on: ${{ matrix.os }}"),
    `${workflow}\nunsafe: *shared-steps\n`,
    workflow.replace(
      "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
      "actions/checkout@${{ github.ref }}",
    ),
    `${workflow}\nunsafe:\n  uses: \${{ github.action }}\n`,
    `${workflow}\n# publication\nunsafe: npm publish\n`,
    `${workflow}\nunsafe: npm --silent publish\n`,
    `${workflow}\nunsafe: npm --workspace package-a publish\n`,
    `${workflow}\nunsafe: npm --workspace=package-a publish\n`,
    `${workflow}\nunsafe: npm -w package-a publish\n`,
    `${workflow}\nunsafe: npm --prefix /tmp/package-a publish\n`,
    ...[
      "npm --silent publish",
      "npm --workspace package-a publish",
      "npm --workspace=package-a publish",
      "npm -w package-a publish",
      "npm --prefix /tmp/package-a publish",
      ...publicationWrapperMutations,
    ].map((command) => workflow.replace(
      "          npm run pack:check\n",
      `          npm run pack:check\n          ${command}\n`,
    )),
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
      `        if: \${{ github.sha == '${expectedReleaseCommit}' }}`,
      "        if: ${{ true }}",
    ),
    workflow.replace(
      "npm ci --ignore-scripts --prefer-offline",
      "npm ci --ignore-scripts",
    ),
  ];

  for (const [index, unsafeWorkflow] of unsafeWorkflows.entries()) {
    assert.notEqual(sha256(Buffer.from(unsafeWorkflow)), expectedCiWorkflowSha256);
    assert.throws(
      () => assertReadOnlyCiWorkflow(unsafeWorkflow),
      `unsafe workflow mutation ${index} must be rejected`,
    );
  }
  assert.throws(() => assertSafePackageScripts({ release: "npm publish" }));
  for (const command of [
    "npm --silent publish",
    "npm --workspace package-a publish",
    "npm --workspace=package-a publish",
    "npm -w package-a publish",
    "npm --prefix /tmp/package-a publish",
  ]) {
    assert.throws(
      () => assertSafePackageScripts({ release: command }),
      `package script publication mutation must be rejected: ${command}`,
    );
  }
  for (const command of publicationWrapperMutations) {
    assert.throws(
      () => assertReviewedPackageScripts({
        ...packageScripts,
        releaseMutation: command,
      }),
      `closed package script contract must reject wrapper mutation: ${command}`,
    );
  }
  assert.throws(() => assertSafePackageScripts({ release: "NODE_AUTH_TOKEN=secret npm pack" }));
});

test("prerelease workflow isolates privileged publication from repository code", () => {
  const workflow = readReviewedWorkflow(
    githubPrereleaseWorkflow,
    expectedGitHubPrereleaseWorkflowSha256,
  );
  const verifyIndex = workflow.indexOf("  verify:\n");
  const publishIndex = workflow.indexOf("  publish:\n");
  assert.notEqual(verifyIndex, -1);
  assert.ok(publishIndex > verifyIndex);
  const verifyJob = workflow.slice(verifyIndex, publishIndex);
  const publishJob = workflow.slice(publishIndex);

  assert.match(workflow, /^permissions:\n  contents: read$/m);
  assert.match(verifyJob, /^    permissions:\n      contents: read$/m);
  assert.match(verifyJob, /^          persist-credentials: false$/m);
  assert.match(
    verifyJob,
    /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/,
  );
  assert.match(publishJob, /^    needs: verify$/m);
  assert.match(
    publishJob,
    /^    permissions:\n      contents: write\n      id-token: write\n      attestations: write$/m,
  );
  assert.match(
    publishJob,
    /actions\/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c/,
  );
  assert.match(
    publishJob,
    /actions\/attest-build-provenance@4d101475d8b20a2381f78447822ac1eab6504dd8/,
  );
  assert.doesNotMatch(publishJob, /actions\/checkout|actions\/setup-node/);
  assert.doesNotMatch(
    publishJob,
    /(?:^|\s)(?:npm|npx)\b|node_modules|package\.json|scripts\/|git\s/m,
  );
  assert.match(publishJob, /Verify transferred release assets/);
  assert.match(publishJob, /manifest\.npmVersion/);
});

test("tag-only workflow creates an exact-main attested GitHub prerelease", () => {
  assert.equal(
    existsSync(githubPrereleaseWorkflow),
    true,
    ".github/workflows/github-prerelease.yml must exist",
  );
  assert.equal(existsSync(githubReleaseConfig), true, ".github/release.yml must exist");

  assertGitHubPrereleaseWorkflow(readReviewedWorkflow(
    githubPrereleaseWorkflow,
    expectedGitHubPrereleaseWorkflowSha256,
  ));
  assertGitHubReleaseConfig(readFileSync(githubReleaseConfig, "utf8"));
});

test("prerelease policy rejects unsafe workflow and release mutations", () => {
  const workflow = readReviewedWorkflow(
    githubPrereleaseWorkflow,
    expectedGitHubPrereleaseWorkflowSha256,
  );
  const packageScripts = (readJson(join(repositoryRoot, "package.json")) as {
    readonly scripts: Readonly<Record<string, string>>;
  }).scripts;
  const addStepControl = (name: string, control: string): string => workflow.replace(
    `      - name: ${name}\n`,
    `      - name: ${name}\n        ${control}\n`,
  );
  const wrapStepRun = (name: string, opener: string, closer: string): string => {
    const headerIndex = workflow.indexOf(`      - name: ${name}\n`);
    assert.notEqual(headerIndex, -1);
    const runMarker = "        run: |\n";
    const runIndex = workflow.indexOf(runMarker, headerIndex);
    assert.notEqual(runIndex, -1);
    const bodyIndex = runIndex + runMarker.length;
    const nextStep = workflow.indexOf("\n      - name: ", bodyIndex);
    const bodyEnd = nextStep === -1 ? workflow.length : nextStep + 1;
    return `${workflow.slice(0, bodyIndex)}          ${opener}\n${workflow.slice(bodyIndex, bodyEnd)}          ${closer}\n${workflow.slice(bodyEnd)}`;
  };
  const controlledSteps = [
    "Validate tag and package identity",
    "Run full SDK verification",
    "Run examples and package checks",
    "Verify deterministic distribution assets and clean installation",
    "Upload verified release assets",
    "Download verified release assets",
    "Verify transferred release assets",
    "Attest release assets",
    "Create or update GitHub prerelease",
    "Verify exact GitHub release inventory",
  ];
  const registryMutations = [
    "--silent publish",
    "--workspace package-a publish",
    "--workspace=package-a publish",
    "-w package-a publish",
    "--prefix /tmp/package-a publish",
    "dist-tag add collective-cognition-sdk@0.6.0 latest",
    "deprecate collective-cognition-sdk@0.6.0 unsafe",
    "unpublish collective-cognition-sdk@0.6.0",
    "access set status=public collective-cognition-sdk",
    "owner add person collective-cognition-sdk",
    "team add org:team collective-cognition-sdk",
    "org set org person developer",
    "hook add pkg https://example.invalid/hook secret",
    "star collective-cognition-sdk",
    "unstar collective-cognition-sdk",
    "profile set password",
    "token create",
    "login",
    "adduser",
    "logout",
    "whoami",
  ];
  const registryConfigurationMutations = [
    "npm config set registry https://example.invalid/",
    "npm config delete registry",
    "npm set registry https://example.invalid/",
    "npm config set @scope:registry https://example.invalid/",
    "npm config set //example.invalid/:_authToken synthetic",
    "npm config set always-auth true",
    "npm_config_registry=https://example.invalid/ npm ci",
    "NPM_CONFIG_REGISTRY=https://example.invalid/ npm ci",
    "npm_config_userconfig=/tmp/npmrc npm ci",
    "npm_config__auth=synthetic npm ci",
    "npm_config_always_auth=true npm ci",
    "npm ci --registry=https://example.invalid/",
    "npm ci --userconfig=/tmp/npmrc",
    "registry=https://example.invalid/",
    "printf registry=https://example.invalid/ > .npmrc",
  ];
  const unsafeWorkflows = [
    workflow.replace('      - "v*"', '      - "release-*"'),
    workflow.replace("permissions:\n", "on:\n  workflow_dispatch:\n\npermissions:\n"),
    workflow.replace("permissions:\n  contents: read", "permissions:\n  contents: write"),
    workflow.replace(
      "    permissions:\n      contents: read\n    steps:",
      "    permissions:\n      contents: write\n    steps:",
    ),
    workflow.replace("        fetch-depth: 0", "        fetch-depth: 1"),
    workflow.replace("          persist-credentials: false", "          persist-credentials: true"),
    workflow.replace("          persist-credentials: false\n", ""),
    workflow.replace("contents: write", "contents: read"),
    workflow.replace("attestations: write", "packages: write"),
    workflow.replace("    needs: verify", "    needs: missing"),
    workflow.replace('node-version: "24.14.0"', 'node-version: "24"'),
    workflow.replace("actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1", "actions/checkout@v4"),
    workflow.replace(
      "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
      "actions/upload-artifact@v4",
    ),
    workflow.replace(
      "actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c",
      "actions/download-artifact@v4",
    ),
    workflow.replace("          overwrite: true\n", ""),
    workflow.replace(
      'package_version="$(node -p "require(\'./package.json\').version")"',
      'package_version="0.6.0"',
    ),
    workflow.replace(
      'package_private="$(node -p "require(\'./package.json\').private")"',
      'package_private="true"',
    ),
    workflow.replace('test "$package_private" = "true"', 'test "$package_private" = "false"'),
    workflow.replace(
      'test "$(git cat-file -t "refs/tags/$GITHUB_REF_NAME")" = "tag"',
      'test "$(git cat-file -t "refs/tags/$GITHUB_REF_NAME")" = "commit"',
    ),
    workflow.replace(
      'tag_commit="$(git rev-parse "refs/tags/$GITHUB_REF_NAME^{}")"',
      'tag_commit="$GITHUB_SHA"',
    ),
    workflow.replace('test "$tag_commit" = "$GITHUB_SHA"', "true"),
    workflow.replace(
      'test "$tag_commit" = "$(git rev-parse origin/main)"',
      "true",
    ),
    workflow.replace(
      'test "$GITHUB_SHA" = "$(git rev-parse origin/main)"',
      'test "$GITHUB_SHA" != "$(git rev-parse origin/main)"',
    ),
    workflow.replace(
      "      - name: Validate tag and package identity",
      "      - name: Install dependencies without lifecycle scripts",
    ).replace(
      "      - name: Install dependencies without lifecycle scripts\n        run: npm ci --ignore-scripts --prefer-offline\n",
      "      - name: Validate tag and package identity\n        run: npm ci --ignore-scripts --prefer-offline\n",
    ),
    workflow.replace(
      "          ${{ runner.temp }}/github-prerelease/first/SHA256SUMS\n",
      "",
    ),
    workflow.replace(
      "          ${{ runner.temp }}/github-prerelease/first/SHA256SUMS",
      "          ${{ runner.temp }}/github-prerelease/first/*",
    ),
    workflow.replace("          npm test\n", ""),
    workflow.replace("          npx tsc --noEmit\n", ""),
    workflow.replace("          npm run check\n", ""),
    workflow.replace(
      "          npm run pack:check\n",
      "          npm run pack:check\n          npm --silent publish\n",
    ),
    ...[
      "npm --workspace package-a publish",
      "npm --workspace=package-a publish",
      "npm -w package-a publish",
      "npm --prefix /tmp/package-a publish",
      ...publicationWrapperMutations,
    ].map((command) => workflow.replace(
      "          npm run pack:check\n",
      `          npm run pack:check\n          ${command}\n`,
    )),
    ...checksumInventoryMutations(workflow, "          "),
    workflow.replace('            "collective-cognition-sdk/compatibility/0.4.0",\n', ""),
    workflow.replace(
      '            "$release_dir/release-manifest.json"\n',
      '            "$release_dir/release-manifest.json"\n            "/etc/hosts"\n',
    ),
    workflow.replace(
      'gh release upload "$GITHUB_REF_NAME" --clobber "${assets[@]}"',
      'gh release upload "$GITHUB_REF_NAME" --clobber "${assets[@]}" /etc/hosts',
    ),
    workflow.replace("--json isPrerelease,isDraft,assets", "--json isPrerelease,assets"),
    workflow.replace("          assert.equal(release.isDraft, false);\n", ""),
    workflow.replace("          assert.equal(new Set(names).size, names.length);\n", ""),
    workflow.replace(
      "            assert.equal(expectedNames.includes(name), true);\n",
      "",
    ),
    workflow.replace(
      "          assert.deepEqual([...names].sort(), expectedNames);\n",
      "",
    ),
    workflow.replace(
      "          assert.equal(manifest.commit, process.env.GITHUB_SHA);\n",
      "",
    ),
    workflow.replace(
      "          assert.match(manifest.npmVersion, /^\\d+\\.\\d+\\.\\d+(?:[-+][0-9A-Za-z.-]+)?$/);\n",
      "",
    ),
    workflow.replace(expectedTarballSha256, "0".repeat(64)),
    workflow.replace("            assert.equal(asset.bytes, bytes.length);\n", ""),
    workflow.replace(
      '              createHash("sha256").update(bytes).digest("hex"),\n',
      '              "0".repeat(64),\n',
    ),
    workflow.replace(
      "      - name: Download verified release assets\n",
      "      - name: Check out repository\n        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1\n      - name: Download verified release assets\n",
    ),
    workflow.replace(
      "      - name: Verify transferred release assets\n",
      "      - name: Run repository package\n        run: npm test\n      - name: Verify transferred release assets\n",
    ),
    workflow.replace("--prerelease --verify-tag --generate-notes", "--verify-tag --generate-notes"),
    workflow.replace("--prerelease --verify-tag --generate-notes", "--prerelease --generate-notes"),
    workflow.replace("--prerelease --verify-tag --generate-notes", "--prerelease --verify-tag"),
    workflow.replace("--clobber", ""),
    workflow.replace("--clobber", "--clobber --latest"),
    `${workflow}\nunsafe: git tag --force v0.6.0\n`,
    `${workflow}\nNPM_TOKEN: forbidden\n`,
    workflow.replace(
      '            verify_existing_release "$release_json"\n',
      '            if false; then\n              verify_existing_release "$release_json"\n            fi\n',
    ),
    workflow.replace(
      '          gh release upload "$GITHUB_REF_NAME" --clobber "${assets[@]}"\n',
      '          if false; then\n            gh release upload "$GITHUB_REF_NAME" --clobber "${assets[@]}"\n          fi\n',
    ),
    wrapStepRun("Validate tag and package identity", "if false; then", "fi"),
    wrapStepRun("Verify exact GitHub release inventory", "if false; then", "fi"),
    wrapStepRun("Run full SDK verification", "case never in match)", ";; esac"),
    wrapStepRun("Run full SDK verification", "for item in; do", "done"),
    wrapStepRun("Run full SDK verification", "until true; do", "done"),
    wrapStepRun("Verify deterministic distribution assets and clean installation", "while false; do", "done"),
    wrapStepRun("Validate tag and package identity", "(", ")"),
    wrapStepRun("Create or update GitHub prerelease", "case never in match)", ";; esac"),
    wrapStepRun("Create or update GitHub prerelease", "for item in; do", "done"),
    wrapStepRun("Create or update GitHub prerelease", "while false; do", "done"),
    wrapStepRun("Create or update GitHub prerelease", "until true; do", "done"),
    wrapStepRun("Create or update GitHub prerelease", "(", ")"),
    workflow.replace(
      "          set -euo pipefail\n          npm test\n",
      "          set -euo pipefail\n          eval 'exit 0'\n          npm test\n",
    ),
    workflow.replace(
      '          release_dir="${{ runner.temp }}/github-prerelease-assets"\n',
      '          eval \'exit 0\'\n          release_dir="${{ runner.temp }}/github-prerelease-assets"\n',
    ),
    ...controlledSteps.flatMap((name) => [
      addStepControl(name, "if: ${{ false }}"),
      addStepControl(name, "continue-on-error: true"),
    ]),
    ...registryMutations.map((command) => `${workflow}\nunsafe: npm ${command}\n`),
    ...registryConfigurationMutations.map((command) => `${workflow}\nunsafe: ${command}\n`),
  ];

  for (const [index, unsafeWorkflow] of unsafeWorkflows.entries()) {
    assert.notEqual(unsafeWorkflow, workflow, `mutation ${index} must change the workflow`);
    assert.notEqual(
      sha256(Buffer.from(unsafeWorkflow)),
      expectedGitHubPrereleaseWorkflowSha256,
    );
    const mutationEvidence = unsafeWorkflow
      .split("\n")
      .find((line) => !workflow.includes(line)) ?? "deletion-only mutation";
    assert.throws(
      () => assertGitHubPrereleaseWorkflow(unsafeWorkflow),
      `unsafe prerelease workflow mutation ${index} must be rejected: ${mutationEvidence}`,
    );
  }

  const releaseConfig = readFileSync(githubReleaseConfig, "utf8");
  for (const [index, unsafeConfig] of [
    releaseConfig.replace("    - title: Fixes", "    - title: Repairs"),
    `${releaseConfig}\nexclude:\n  authors:\n    - dependabot[bot]\n`,
  ].entries()) {
    assert.throws(
      () => assertGitHubReleaseConfig(unsafeConfig),
      `unsafe release config mutation ${index} must be rejected`,
    );
  }

  for (const command of registryConfigurationMutations) {
    assert.throws(
      () => assertSafePackageScripts({ release: command }),
      `package script registry reconfiguration must be rejected: ${command}`,
    );
  }
  for (const command of publicationWrapperMutations) {
    assert.throws(
      () => assertReviewedPackageScripts({
        ...packageScripts,
        releaseMutation: command,
      }),
      `closed package script contract must reject wrapper mutation: ${command}`,
    );
  }
});

test("public documentation records the observed GitHub prerelease boundary", () => {
  const readDocumentation = (path: string): string => {
    const file = join(repositoryRoot, path);
    assert.equal(existsSync(file), true, `${path} must exist`);
    return readFileSync(file, "utf8");
  };
  const readme = readDocumentation("README.md");
  const roadmap = readDocumentation("docs/ROADMAP.md");
  const rfcIndex = readDocumentation("rfcs/README.md");
  const runbook = readDocumentation("docs/github-prerelease.md");
  const changelog = readDocumentation("CHANGELOG.md");
  const documentation = [readme, roadmap, rfcIndex, runbook, changelog].join("\n");

  assert.match(readme, /^## GitHub Prerelease$/m);
  for (const asset of expectedAssets) {
    assert.match(documentation, new RegExp(`\\b${asset.replaceAll(".", "\\.")}\\b`));
  }
  for (const runtime of [
    "Ubuntu with Node.js `24.9.0`",
    "Ubuntu with Node.js `24.14.0`",
    "Ubuntu with Node.js `24.19.0`",
    "macOS with Node.js `24.14.0`",
    "macOS with Node.js `24.19.0`",
    "Windows with Node.js `24.14.0`",
    "Windows with Node.js `24.19.0`",
  ]) {
    assert.equal(documentation.includes(runtime), true, `document ${runtime}`);
  }

  assert.match(readme, /https:\/\/github\.com\/xiongxhc\/collective-cognition-sdk\/releases\/download\//);
  assert.match(readme, /https:\/\/github\.com\/xiongxhc\/collective-cognition-sdk\/releases\/tag\/v0\.6\.0/);
  assert.doesNotMatch(readme, /no public release evidence|not evidence that a release already exists/i);
  assert.doesNotMatch(readme, /Not implemented yet:[\s\S]*observed GitHub prerelease evidence/i);
  assert.match(readme, /npm install --ignore-scripts --offline \.\/collective-cognition-sdk-0\.6\.0\.tgz/);
  assert.match(readme, /shasum -a 256 -c SHA256SUMS/);
  assert.match(readme, /gh attestation verify "\$asset"/);
  assert.match(readme, /--repo xiongxhc\/collective-cognition-sdk/);
  assert.match(
    readme,
    /--signer-workflow xiongxhc\/collective-cognition-sdk\/\.github\/workflows\/github-prerelease\.yml/,
  );
  assert.match(readme, /--source-ref "refs\/tags\/\$TAG"/);
  assert.match(readme, /collective-cognition --help/);
  assert.match(readme, /collective-cognition-teammem --help/);
  assert.match(readme, /collective-cognition-markdown --help/);
  assert.match(readme, /"private": true.*npm publication.*GitHub.*tarball/s);
  assert.match(readme, /temporary vaults only/i);
  assert.match(readme, /SQLite.*reference adapter/i);

  assert.match(roadmap, /## Phase 3: Specification and Package Stabilization/);
  assert.match(roadmap, /GitHub prerelease distribution readiness/i);
  assert.match(roadmap, /## Phase 4: Adapter Ecosystem Foundations/);
  assert.match(roadmap, /GitHub prerelease.*observed and verified/i);
  assert.match(roadmap, /## Phase 5: Cross-Connector Interoperability\n\n\*\*Status:\*\* Next SDK development slice\./);
  assert.match(roadmap, /Release execution checklist/i);
  assert.match(roadmap, /30766556678/);
  assert.match(roadmap, /30766660796/);
  assert.match(roadmap, /76f289b7f1514f4bc490d0de6dbffbb61a4c9f0e/);
  assert.match(roadmap, /4b93ec6df71e47196b55b5ca7325c07b0612673f/);
  assert.match(roadmap, /attestations\/38461049/);
  assert.match(roadmap, /publication step then failed.*lacked GitHub CLI repository context/s);
  assert.match(roadmap, /exact transferred, checksummed, and attested artifact.*published without moving the tag/s);
  assert.match(roadmap, /remains npm-unpublished/i);
  assert.match(rfcIndex, /RFC 0007: Markdown Cognition Adapter.*final-review verified/s);

  assert.match(runbook, /node --disable-warning=ExperimentalWarning --test tests\/release-readiness\.test\.ts/);
  assert.match(runbook, /node scripts\/build-github-prerelease\.mjs --output/);
  assert.match(runbook, /cmp "\$first\/\$asset" "\$second\/\$asset"/);
  assert.match(runbook, /gh api --method PUT repos\/xiongxhc\/collective-cognition-sdk\/private-vulnerability-reporting/);
  assert.match(runbook, /gh api repos\/xiongxhc\/collective-cognition-sdk\/private-vulnerability-reporting --jq '\.enabled'/);
  assert.match(runbook, /gh pr create --base main --head feature\/public-prerelease-readiness/);
  assert.match(runbook, /gh pr merge "\$PR_NUMBER" --squash --delete-branch/);
  assert.match(runbook, /git tag -a v0\.6\.0 -m "Collective Cognition SDK 0\.6\.0 prerelease"/);
  assert.match(runbook, /git push origin v0\.6\.0/);
  assert.match(runbook, /gh run watch/);
  assert.match(runbook, /gh release download "\$TAG" --dir "\$release_dir"/);
  assert.match(runbook, /gh api repos\/xiongxhc\/collective-cognition-sdk\/releases\/tags\/\$TAG/);
  assert.match(runbook, /gh api --include repos\/xiongxhc\/collective-cognition-sdk\/releases\/latest/);
  assert.match(runbook, /git rev-parse "refs\/tags\/\$TAG\^\{\}"/);
  assert.match(runbook, /shasum -a 256 -c SHA256SUMS/);
  assert.match(runbook, /gh attestation verify "\$release_dir\/\$asset"/);
  assert.match(runbook, /manifest\.commit, tagSha/);
  assert.match(runbook, /manifest\.npmVersion/);
  assert.match(runbook, new RegExp(expectedTarballSha256));
  assert.match(runbook, /asset\.bytes, bytes\.length/);
  assert.match(runbook, /createHash\("sha256"\)/);
  assert.match(runbook, /assert\.deepEqual\(sbom,/);
  assert.match(
    runbook,
    /https:\/\/registry\.npmjs\.org\/collective-cognition-sdk\/0\.6\.0/,
  );
  assert.match(runbook, /request\.getHeader\("authorization"\), undefined/);
  assert.match(runbook, /request\.setTimeout\(/);
  assert.match(runbook, /assert\.equal\(statusCode, 404\)/);
  assert.match(runbook, /assert\.equal\(registryPayload, "Not Found"\)/);
  assert.match(runbook, /GH_REPO.*github\.repository/s);
  assert.match(runbook, /original no-checkout\s+publication step lacked explicit GitHub CLI repository context/s);
  assert.match(runbook, /new prerelease version rather than moving or retagging `v0\.6\.0`/i);

  assert.doesNotMatch(documentation, /\b(?:is|are|was|were)\s+(?:production[- ]ready|npm published|live vault accepted)\b/i);
});

test("prerelease documentation keeps verification fixtures and release predicates fail closed", () => {
  const readDocumentation = (path: string): string => readFileSync(
    join(repositoryRoot, path),
    "utf8",
  );
  const readme = readDocumentation("README.md");
  const roadmap = readDocumentation("docs/ROADMAP.md");
  const runbook = readDocumentation("docs/github-prerelease.md");
  const manifestPackageCheck = `assert.deepEqual(manifest.package, {
  name: "collective-cognition-sdk",
  version: "0.6.0",
  private: true,
});`;
  const expectedRuntimes = [
    "Ubuntu with Node.js `24.9.0`",
    "Ubuntu with Node.js `24.14.0`",
    "Ubuntu with Node.js `24.19.0`",
    "macOS with Node.js `24.14.0`",
    "macOS with Node.js `24.19.0`",
    "Windows with Node.js `24.14.0`",
    "Windows with Node.js `24.19.0`",
  ];
  const assertRuntimeBoundary = (documentation: string): void => {
    const runtimes = [...documentation.matchAll(
      /(?:Ubuntu|macOS|Windows) with Node\.js `\d+\.\d+\.\d+`/g,
    )].map((match) => match[0]);
    assert.deepEqual([...new Set(runtimes)].sort(), [...expectedRuntimes].sort());
    assert.match(readme, /core verification matrix.*npm test.*npx tsc.*npm run check/s);
    assert.match(readme, /distribution verification environment is Ubuntu with Node\.js `24\.14\.0`\s+only/s);
    assert.match(
      readme,
      /examples, durable SQLite, deterministic assets, clean tarball\s+installation, imports, and installed CLIs/s,
    );
    assert.match(roadmap, /core verification runs `npm test`, `npx tsc --noEmit`, and\s+`npm run check` on Ubuntu/s);
    assert.match(roadmap, /Ubuntu with Node\.js `24\.14\.0` is the distribution verification\s+environment for examples, durable SQLite, deterministic assets, clean\s+tarball installation, imports, and installed CLI checks only/s);
    assert.match(runbook, /core verification matrix runs only `npm test`, `npx tsc --noEmit`, and\s+`npm run check` on Ubuntu/s);
    assert.match(runbook, /distribution verification environment is Ubuntu with Node\.js `24\.14\.0`\s+only/s);
  };
  const assertRunbook = (candidate: string): void => {
    assert.match(candidate, /example_root="\$\(mktemp -d\)"/);
    assert.match(candidate, /trap 'rm -rf "\$example_root"' EXIT/);
    assert.match(candidate, /LEDGER_PATH="\$ledger" node --input-type=module/);
    assert.match(candidate, /new DatabaseSync\(ledgerPath\)/);
    assert.match(candidate, /npm run example:teammem -- "\$ledger"/);
    assert.match(candidate, /npm run example:teammem:durable -- --ledger "\$ledger" --cognition-db "\$cognition" --project prerelease-synthetic --from 2026-08-02T00:00:00\.000Z --limit 1 --create/);
    assert.match(candidate, /gh run list --repo xiongxhc\/collective-cognition-sdk --workflow github-prerelease\.yml --branch "\$TAG" --event push --limit 20 --json databaseId,headSha,headBranch,event/);
    assert.match(candidate, /assert\.equal\(runs\.length, 1\)/);
    assert.match(candidate, /assert\.equal\(run\.headBranch, tag\)/);
    assert.match(candidate, /assert\.equal\(run\.headSha, tagSha\)/);
    assert.match(candidate, /assert\.equal\(run\.event, "push"\)/);
    assert.match(candidate, /gh run watch "\$RUN_ID" --exit-status/);
    assert.match(candidate, /release_json="\$\(gh api repos\/xiongxhc\/collective-cognition-sdk\/releases\/tags\/\$TAG\)"/);
    assert.match(candidate, /assert\.equal\(release\.prerelease, true\)/);
    assert.match(candidate, /assert\.equal\(release\.draft, false\)/);
    assert.match(candidate, /assert\.equal\(release\.tag_name, tag\)/);
    assert.match(candidate, /assert\.equal\(new Set\(names\)\.size, names\.length\)/);
    assert.match(candidate, /assert\.deepEqual\(\[\.\.\.names\]\.sort\(\), expectedAssets\)/);
    assert.match(candidate, /gh api --include repos\/xiongxhc\/collective-cognition-sdk\/releases\/latest/);
    assert.match(candidate, /assert\.equal\(statusCode, 200\)/);
    assert.match(candidate, /assert\.notEqual\(latest\.tag_name, tag\)/);
    assert.match(candidate, /assert\.equal\(exitCode, 1\)/);
    assert.equal(
      [...candidate.matchAll(/assert\.equal\(statusCode, 404\)/g)].length,
      2,
    );
    assertCanonicalChecksumVerifier(candidate);
    assert.equal([...candidate.matchAll(/gh attestation verify /g)].length, 1);
    assert.match(candidate, /gh attestation verify "\$release_dir\/\$asset"/);
    assert.doesNotMatch(candidate, /gh attestation verify "\$asset"/);
    assert.match(candidate, /assert\.equal\(manifest\.commit, tagSha\)/);
    assert.equal(candidate.includes(manifestPackageCheck), true);
    assert.match(candidate, /assert\.equal\(manifest\.nodeVersion, "v24\.14\.0"\)/);
    assert.match(candidate, /assert\.match\(manifest\.npmVersion,/);
    assert.match(candidate, new RegExp(expectedTarballSha256));
    assert.match(candidate, /assert\.equal\(asset\.bytes, bytes\.length\)/);
    assert.match(candidate, /createHash\("sha256"\)\.update\(bytes\)\.digest\("hex"\)/);
    const sbomCheck = candidate.match(/assert\.deepEqual\(sbom, \{[\s\S]*?\n\}\);/);
    assert.ok(sbomCheck);
    for (const fragment of [
      'bomFormat: "CycloneDX"',
      'specVersion: "1.6"',
      'purl: "pkg:npm/collective-cognition-sdk@0.6.0"',
      "components: []",
      "dependencies: [{",
      "dependsOn: []",
    ]) {
      assert.equal(sbomCheck[0].includes(fragment), true, `runbook SBOM must include ${fragment}`);
    }
    assert.match(candidate, /request\.getHeader\("authorization"\), undefined/);
    assert.match(candidate, /request\.setTimeout\(/);
    assert.match(candidate, /const registryPayload = JSON\.parse\(body\)/);
    assert.equal(
      candidate.includes('assert.match(contentType ?? "", /^application\\/json\\b/i);'),
      true,
    );
    assert.match(candidate, /assert\.equal\(registryPayload, "Not Found"\)/);
    for (const subpath of releasedPackageExports) {
      const specifier = subpath === "."
        ? releasedPackageName
        : `${releasedPackageName}${subpath.slice(1)}`;
      assert.equal(
        candidate.includes(JSON.stringify(specifier)),
        true,
        `runbook must verify downloaded subpath ${specifier}`,
      );
    }
  };

  assertRuntimeBoundary([readme, roadmap, runbook].join("\n"));
  assertRunbook(runbook);

  for (const [index, unsafeRunbook] of [
    runbook.replace('npm run example:teammem -- "$ledger"', "npm run example:teammem"),
    runbook.replace(' --cognition-db "$cognition"', ""),
    runbook.replace("--workflow github-prerelease.yml", "--workflow ci.yml"),
    runbook.replace('gh run watch "$RUN_ID" --exit-status', 'gh run watch "$RUN_ID"'),
    runbook.replace("assert.equal(release.prerelease, true)", "assert.equal(release.prerelease, false)"),
    runbook.replace("assert.equal(exitCode, 1)", "assert.equal(exitCode, 2)"),
    runbook.replace("assert.equal(manifest.commit, tagSha)", "assert.notEqual(manifest.commit, tagSha)"),
    runbook.replace(
      manifestPackageCheck,
      manifestPackageCheck.replace("private: true", "private: false"),
    ),
    runbook.replace(
      'assert.equal(manifest.nodeVersion, "v24.14.0")',
      'assert.equal(manifest.nodeVersion, "v24")',
    ),
    runbook.replace("assert.match(manifest.npmVersion", "assert.doesNotMatch(manifest.npmVersion"),
    runbook.replace(expectedTarballSha256, "0".repeat(64)),
    runbook.replace("assert.equal(asset.bytes, bytes.length)", "assert.notEqual(asset.bytes, bytes.length)"),
    runbook.replace('createHash("sha256").update(bytes).digest("hex")', '"0".repeat(64)'),
    runbook.replace("assert.deepEqual(sbom, {", "assert.notDeepEqual(sbom, {"),
    runbook.replace('specVersion: "1.6"', 'specVersion: "1.5"'),
    runbook.replace('"collective-cognition-sdk/adapters/markdown/0.1.0",\n', ""),
    runbook.replace('"collective-cognition-sdk/compatibility/0.4.0",\n', ""),
    runbook.replace('"collective-cognition-sdk/contracts/host-integration/0.1.0",\n', ""),
    ...checksumInventoryMutations(runbook),
    runbook.replace(
      'gh attestation verify "$release_dir/$asset"',
      'gh attestation verify "$asset"',
    ),
    runbook.replace('assert.equal(request.getHeader("authorization"), undefined);\n', ""),
    runbook.replace('request.setTimeout(15_000, () => request.destroy(new Error("Registry request timed out.")));\n', ""),
    runbook.replace("const registryPayload = JSON.parse(body)", "const registryPayload = body"),
    runbook.replace(
      'assert.match(contentType ?? "", /^application\\/json\\b/i)',
      'assert.match(contentType ?? "", /^text\\/plain\\b/i)',
    ),
    runbook.replace("assert.equal(statusCode, 404)", "assert.equal(statusCode, 200)"),
    runbook.replace('assert.equal(registryPayload, "Not Found")', 'assert.ok(registryPayload)'),
  ].entries()) {
    assert.notEqual(unsafeRunbook, runbook, `runbook mutation ${index} must change the document`);
    const mutationEvidence = unsafeRunbook
      .split("\n")
      .find((line) => !runbook.includes(line)) ?? "deletion-only mutation";
    assert.throws(
      () => assertRunbook(unsafeRunbook),
      `unsafe runbook mutation ${index} must be rejected: ${mutationEvidence}`,
    );
  }
  assert.throws(() => assertRuntimeBoundary(`${readme}\n- Ubuntu with Node.js \`25.0.0\``));
});
