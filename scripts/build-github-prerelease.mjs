import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, isAbsolute, join } from "node:path";

const EXPECTED = Object.freeze({
  repository: "xiongxhc/collective-cognition-sdk",
  packageName: "collective-cognition-sdk",
  packageVersion: "0.6.0",
  packageScriptsSha256: "574c12e5cc890227a58b16939ef1e0e861b9a011c4b8040f6df03ee4044534e3",
  tarballSha256: "b1cf79a9a1ec876bca2e7a6594d73ea99029eb4b2b90f25599db1318abb4a81f",
  tag: "v0.6.0",
  assets: Object.freeze([
    "SHA256SUMS",
    "collective-cognition-sdk-0.6.0.cdx.json",
    "collective-cognition-sdk-0.6.0.tgz",
    "release-manifest.json",
  ]),
});
const RUNTIME_DEPENDENCY_FIELDS = Object.freeze([
  "dependencies",
  "optionalDependencies",
  "peerDependencies",
  "bundleDependencies",
  "bundledDependencies",
]);
const FORBIDDEN_SCRIPT_TOKENS = /\b(?:NPM_TOKEN|NODE_AUTH_TOKEN|_authToken|authToken)\b/i;
const FORBIDDEN_NPM_VERBS = new Set([
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

class ReleaseError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function fail(code) {
  throw new ReleaseError(code);
}

function sorted(value) {
  if (Array.isArray(value)) {
    return value.map(sorted);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sorted(item)]),
    );
  }
  return value;
}

function jsonBuffer(value) {
  return Buffer.from(`${JSON.stringify(sorted(value), null, 2)}\n`);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function shellTokens(value) {
  const tokens = [];
  let token = "";
  let quote;
  const pushToken = () => {
    if (token) {
      tokens.push(token);
      token = "";
    }
  };
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
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

function hasForbiddenNpmInvocation(value) {
  let npmInvocation = false;
  for (const token of shellTokens(value)) {
    if (token === undefined) {
      npmInvocation = false;
      continue;
    }
    const executable = token.split(/[\\/]/).at(-1).toLowerCase();
    if (!npmInvocation) {
      npmInvocation = executable === "npm" || executable === "npm.cmd" || executable === "npm.exe";
    } else if (FORBIDDEN_NPM_VERBS.has(token.toLowerCase())) {
      return true;
    }
  }
  return false;
}

function parseOutput(args) {
  if (
    args.length !== 2 ||
    args[0] !== "--output" ||
    typeof args[1] !== "string" ||
    !isAbsolute(args[1])
  ) {
    fail("INVALID_OUTPUT_TARGET");
  }
  return args[1];
}

function directoryIdentity(path) {
  let entry;
  try {
    entry = lstatSync(path, { bigint: true });
  } catch {
    fail("INVALID_OUTPUT_TARGET");
  }
  if (entry.isSymbolicLink() || !entry.isDirectory()) {
    fail("INVALID_OUTPUT_TARGET");
  }
  return { dev: entry.dev, ino: entry.ino };
}

function matchesDirectoryIdentity(path, expected) {
  try {
    const entry = lstatSync(path, { bigint: true });
    return (
      !entry.isSymbolicLink() &&
      entry.isDirectory() &&
      entry.dev === expected.dev &&
      entry.ino === expected.ino
    );
  } catch {
    return false;
  }
}

function validateOutput(output) {
  const parent = directoryIdentity(dirname(output));
  const target = directoryIdentity(output);
  if (readdirSync(output).length !== 0) {
    fail("INVALID_OUTPUT_TARGET");
  }
  return { parent, target };
}

function readPackage() {
  let metadata;
  try {
    metadata = JSON.parse(readFileSync("package.json", "utf8"));
  } catch {
    fail("INVALID_PACKAGE");
  }
  if (
    metadata.name !== EXPECTED.packageName ||
    metadata.version !== EXPECTED.packageVersion ||
    metadata.private !== true ||
    !metadata.scripts ||
    typeof metadata.scripts !== "object" ||
    Array.isArray(metadata.scripts)
  ) {
    fail("INVALID_PACKAGE");
  }
  for (const field of RUNTIME_DEPENDENCY_FIELDS) {
    if (field in metadata && Object.keys(metadata[field]).length !== 0) {
      fail("INVALID_PACKAGE");
    }
  }
  const scriptEntries = Object.keys(metadata.scripts)
    .sort()
    .map((name) => [name, metadata.scripts[name]]);
  if (
    scriptEntries.some(([, script]) => typeof script !== "string") ||
    sha256(Buffer.from(JSON.stringify(scriptEntries))) !== EXPECTED.packageScriptsSha256
  ) {
    fail("INVALID_PACKAGE");
  }
  for (const [, script] of scriptEntries) {
    if (
      FORBIDDEN_SCRIPT_TOKENS.test(script) ||
      hasForbiddenNpmInvocation(script)
    ) {
      fail("INVALID_PACKAGE");
    }
  }
}

function trustedOwnershipAndMode(entry, code) {
  if (process.platform === "win32" || typeof process.getuid !== "function") {
    return;
  }
  const currentUser = process.getuid();
  if ((entry.uid !== 0 && entry.uid !== currentUser) || (entry.mode & 0o022) !== 0) {
    fail(code);
  }
}

function trustedFile(path, code, optional = false) {
  try {
    const resolved = realpathSync(path);
    const entry = statSync(resolved);
    if (!entry.isFile()) {
      fail(code);
    }
    trustedOwnershipAndMode(entry, code);
    return resolved;
  } catch (error) {
    if (error instanceof ReleaseError) {
      throw error;
    }
    if (optional && (error?.code === "ENOENT" || error?.code === "ENOTDIR")) {
      return undefined;
    }
    fail(code);
  }
}

function trustedDirectory(path, code) {
  try {
    const resolved = realpathSync(path);
    const entry = statSync(resolved);
    if (!entry.isDirectory()) {
      fail(code);
    }
    trustedOwnershipAndMode(entry, code);
    return resolved;
  } catch (error) {
    if (error instanceof ReleaseError) {
      throw error;
    }
    fail(code);
  }
}

function trustedNpm(path) {
  const npmCli = trustedFile(path, "NPM_UNAVAILABLE", true);
  if (!npmCli) {
    return undefined;
  }
  const binDirectory = trustedDirectory(dirname(npmCli), "NPM_UNAVAILABLE");
  const packageDirectory = trustedDirectory(dirname(binDirectory), "NPM_UNAVAILABLE");
  if (
    basename(npmCli) !== "npm-cli.js" ||
    basename(binDirectory) !== "bin" ||
    basename(packageDirectory) !== "npm"
  ) {
    fail("NPM_UNAVAILABLE");
  }
  const packagePath = trustedFile(
    join(packageDirectory, "package.json"),
    "NPM_UNAVAILABLE",
  );
  let metadata;
  try {
    metadata = JSON.parse(readFileSync(packagePath, "utf8"));
  } catch {
    fail("NPM_UNAVAILABLE");
  }
  if (
    metadata.name !== "npm" ||
    typeof metadata.version !== "string" ||
    !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(metadata.version) ||
    !metadata.bin ||
    typeof metadata.bin !== "object" ||
    metadata.bin.npm !== "bin/npm-cli.js"
  ) {
    fail("NPM_UNAVAILABLE");
  }
  let declaredCli;
  try {
    declaredCli = realpathSync(join(packageDirectory, metadata.bin.npm));
  } catch {
    fail("NPM_UNAVAILABLE");
  }
  if (declaredCli !== npmCli) {
    fail("NPM_UNAVAILABLE");
  }
  return { npmCli, npmVersion: metadata.version };
}

function trustedExecutables() {
  const node = trustedFile(realpathSync(process.execPath), "NODE_UNAVAILABLE");
  const nodeDirectory = dirname(node);
  const npmCliCandidates = [
    join(nodeDirectory, "node_modules", "npm", "bin", "npm-cli.js"),
    join(dirname(nodeDirectory), "lib", "node_modules", "npm", "bin", "npm-cli.js"),
    join(
      dirname(nodeDirectory),
      "libexec",
      "lib",
      "node_modules",
      "npm",
      "bin",
      "npm-cli.js",
    ),
    ...(process.platform === "win32"
      ? []
      : [
          join(nodeDirectory, "npm"),
          "/usr/local/lib/node_modules/npm/bin/npm-cli.js",
          "/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js",
          "/usr/lib/node_modules/npm/bin/npm-cli.js",
        ]),
  ];
  let npm;
  for (const candidate of npmCliCandidates) {
    npm = trustedNpm(candidate);
    if (npm) {
      break;
    }
  }
  if (!npm) {
    fail("NPM_UNAVAILABLE");
  }
  const gitCandidates = process.platform === "win32"
    ? [
        "C:\\Program Files\\Git\\cmd\\git.exe",
        "C:\\Program Files\\Git\\bin\\git.exe",
      ]
    : ["/usr/bin/git", "/bin/git"];
  let git;
  for (const candidate of gitCandidates) {
    try {
      git = trustedFile(candidate, "GIT_UNAVAILABLE");
      break;
    } catch (error) {
      if (!(error instanceof ReleaseError) || error.code !== "GIT_UNAVAILABLE") {
        throw error;
      }
    }
  }
  if (!git) {
    fail("GIT_UNAVAILABLE");
  }
  return { git, node, nodeDirectory, ...npm };
}

function isolatedEnvironment(runtimeDirectory, nodeDirectory) {
  const home = join(runtimeDirectory, "home");
  const cache = join(runtimeDirectory, "cache");
  const config = join(runtimeDirectory, "config");
  const prefix = join(runtimeDirectory, "prefix");
  const globalConfig = join(runtimeDirectory, "npm-globalrc");
  const userConfig = join(runtimeDirectory, "npmrc");
  const gitConfig = join(runtimeDirectory, "gitconfig");
  mkdirSync(home, { mode: 0o700 });
  mkdirSync(cache, { mode: 0o700 });
  mkdirSync(config, { mode: 0o700 });
  mkdirSync(prefix, { mode: 0o700 });
  writeFileSync(globalConfig, "");
  writeFileSync(userConfig, "");
  writeFileSync(gitConfig, "");
  const trustedPath = process.platform === "win32"
    ? [nodeDirectory, "C:\\Windows\\System32"].join(delimiter)
    : [nodeDirectory, "/usr/bin", "/bin"].join(delimiter);
  return {
    env: {
      GIT_CONFIG_GLOBAL: gitConfig,
      GIT_CONFIG_NOSYSTEM: "1",
      HOME: home,
      PATH: trustedPath,
      USERPROFILE: home,
      XDG_CONFIG_HOME: config,
      npm_config_audit: "false",
      npm_config_cache: cache,
      npm_config_fund: "false",
      npm_config_globalconfig: globalConfig,
      npm_config_ignore_scripts: "true",
      npm_config_offline: "true",
      npm_config_prefix: prefix,
      npm_config_userconfig: userConfig,
    },
  };
}

function run(command, args, errorCode, environment) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: environment,
  });
  if (result.error || result.status !== 0) {
    fail(errorCode);
  }
  return result.stdout;
}

function currentCommit(git, environment) {
  const commit = run(git, ["rev-parse", "HEAD"], "INVALID_GIT_COMMIT", environment).trim();
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    fail("INVALID_GIT_COMMIT");
  }
  return commit;
}

function runNpm(node, npmCli, args, errorCode, environment) {
  return run(node, [npmCli, ...args], errorCode, environment);
}

function pack(node, npmCli, stage, environment) {
  const stdout = runNpm(
    node,
    npmCli,
    [
      "pack",
      "--json",
      "--ignore-scripts",
      "--offline",
      "--pack-destination",
      stage,
    ],
    "PACK_FAILED",
    environment,
  );
  let result;
  try {
    result = JSON.parse(stdout);
  } catch {
    fail("PACK_FAILED");
  }
  if (!Array.isArray(result) || result.length !== 1 || typeof result[0]?.filename !== "string") {
    fail("PACK_FAILED");
  }
  const reportedName = result[0].filename;
  const generatedName = basename(reportedName);
  if (
    generatedName !== reportedName ||
    reportedName.includes("/") ||
    reportedName.includes("\\")
  ) {
    fail("PACK_FAILED");
  }
  const generatedPath = join(stage, generatedName);
  let generated;
  try {
    generated = statSync(generatedPath);
  } catch {
    fail("PACK_FAILED");
  }
  if (!generated.isFile()) {
    fail("PACK_FAILED");
  }
  const expectedPath = join(stage, "collective-cognition-sdk-0.6.0.tgz");
  if (generatedPath !== expectedPath) {
    renameSync(generatedPath, expectedPath);
  }
  if (sha256(readFileSync(expectedPath)) !== EXPECTED.tarballSha256) {
    fail("PACKAGE_ARTIFACT_DRIFT");
  }
  return expectedPath;
}

function cleanupStage(stage, identity, createdPaths) {
  if (!stage || !identity || !matchesDirectoryIdentity(stage, identity)) {
    return;
  }
  for (const path of [...createdPaths].reverse()) {
    try {
      if (lstatSync(path).isFile()) {
        unlinkSync(path);
      }
    } catch {}
  }
  try {
    rmdirSync(stage);
  } catch {}
}

function cleanupRuntime(runtimeDirectory, identity) {
  if (!runtimeDirectory && !identity) {
    return true;
  }
  if (!runtimeDirectory || !identity || !matchesDirectoryIdentity(runtimeDirectory, identity)) {
    return false;
  }
  try {
    rmSync(runtimeDirectory, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

function publishStage(stage, stageIdentity, output, outputIdentity) {
  if (
    !matchesDirectoryIdentity(stage, stageIdentity) ||
    !matchesDirectoryIdentity(dirname(output), outputIdentity.parent) ||
    !matchesDirectoryIdentity(output, outputIdentity.target) ||
    readdirSync(output).length !== 0
  ) {
    fail("INVALID_OUTPUT_TARGET");
  }
  const backup = mkdtempSync(
    join(dirname(output), ".collective-cognition-release-backup-"),
  );
  rmdirSync(backup);
  let movedOutput = false;
  try {
    renameSync(output, backup);
    movedOutput = true;
    if (!matchesDirectoryIdentity(backup, outputIdentity.target)) {
      renameSync(backup, output);
      movedOutput = false;
      fail("INVALID_OUTPUT_TARGET");
    }
    renameSync(stage, output);
    movedOutput = false;
    try {
      rmdirSync(backup);
    } catch {}
  } catch (error) {
    if (movedOutput) {
      try {
        renameSync(backup, output);
      } catch {}
    }
    throw error;
  }
}

function buildRelease(stage, runtimeDirectory, createdPaths) {
  readPackage();
  const executables = trustedExecutables();
  const { env } = isolatedEnvironment(runtimeDirectory, executables.nodeDirectory);
  const npmVersion = runNpm(
    executables.node,
    executables.npmCli,
    ["--version"],
    "NPM_UNAVAILABLE",
    env,
  ).trim();
  if (npmVersion !== executables.npmVersion) {
    fail("NPM_UNAVAILABLE");
  }
  const commit = currentCommit(executables.git, env);
  runNpm(
    executables.node,
    executables.npmCli,
    ["run", "--ignore-scripts", "build"],
    "BUILD_FAILED",
    env,
  );

  const tarballPath = pack(executables.node, executables.npmCli, stage, env);
  createdPaths.push(tarballPath);
  const sbomPath = join(stage, "collective-cognition-sdk-0.6.0.cdx.json");
  const sbom = {
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
    dependencies: [{
      ref: "pkg:npm/collective-cognition-sdk@0.6.0",
      dependsOn: [],
    }],
  };
  writeFileSync(sbomPath, jsonBuffer(sbom));
  createdPaths.push(sbomPath);

  const payloads = [tarballPath, sbomPath].map((path) => {
    const bytes = readFileSync(path);
    return { name: basename(path), bytes: bytes.length, sha256: sha256(bytes) };
  });
  const manifestPath = join(stage, "release-manifest.json");
  const manifest = {
    repository: EXPECTED.repository,
    tag: EXPECTED.tag,
    commit,
    package: {
      name: EXPECTED.packageName,
      version: EXPECTED.packageVersion,
      private: true,
    },
    nodeVersion: process.version,
    npmVersion,
    assets: payloads,
  };
  writeFileSync(manifestPath, jsonBuffer(manifest));
  createdPaths.push(manifestPath);

  const checksumPath = join(stage, "SHA256SUMS");
  const checksums = [...payloads, {
    name: "release-manifest.json",
    sha256: sha256(readFileSync(manifestPath)),
  }]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(({ name, sha256: digest }) => `${digest}  ${name}`)
    .join("\n");
  writeFileSync(checksumPath, `${checksums}\n`);
  createdPaths.push(checksumPath);

}

const args = Object.freeze(Array.from(process.argv.slice(2)));
const createdPaths = [];
let stage;
let stageIdentity;
let runtimeDirectory;
let runtimeIdentity;

try {
  const output = parseOutput(args);
  const outputIdentity = validateOutput(output);
  stage = mkdtempSync(join(dirname(output), ".collective-cognition-release-"));
  stageIdentity = directoryIdentity(stage);
  runtimeDirectory = mkdtempSync(join(tmpdir(), "collective-cognition-release-"));
  runtimeIdentity = directoryIdentity(runtimeDirectory);
  buildRelease(stage, runtimeDirectory, createdPaths);
  if (!cleanupRuntime(runtimeDirectory, runtimeIdentity)) {
    fail("CLEANUP_FAILED");
  }
  runtimeDirectory = undefined;
  runtimeIdentity = undefined;
  publishStage(stage, stageIdentity, output, outputIdentity);
  process.stdout.write(JSON.stringify({ ok: true, tag: EXPECTED.tag, assets: EXPECTED.assets }) + "\n");
} catch (error) {
  const code = error instanceof ReleaseError ? error.code : "BUILD_FAILED";
  cleanupStage(stage, stageIdentity, createdPaths);
  cleanupRuntime(runtimeDirectory, runtimeIdentity);
  process.stderr.write(JSON.stringify({ ok: false, error: code }) + "\n");
  process.exitCode = 1;
}
