import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

const ARCHIVE_ROOT = "package";
const ALWAYS_INCLUDED_PATHS = ["package.json", "README.md", "LICENSE", "NOTICE"];
const ALLOWED_DIRECTORY_EXTENSIONS = new Set([".js", ".d.ts"]);
const EXECUTABLE_MODE = 0o755;
const VERSION_PATTERN =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?$/;
const PRIVATE_PATH_PATTERNS = [
  /(?:^|\/)\.[^/]+$/,
  /(?:^|\/)node_modules(?:\/|$)/,
  /(?:^|\/)private(?:\/|$)/,
  /^(?:src|tests|examples)\//,
  /^docs\/superpowers\//,
];
// Package inspection must find no credentials and no local absolute paths. A
// match is reported as `credential_pattern_detected` without echoing the
// matched text.
const INSPECTION_PATTERNS = [
  /npm_[A-Za-z0-9]{36}/,
  /gh[pousr]_[A-Za-z0-9]{36}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/,
  /(?:_authToken|NPM_TOKEN|NODE_AUTH_TOKEN)\s*[=:]\s*\S/,
  /(?:\/Users|\/home)\/[^/\s]+\//,
];

function failure(code) {
  return { ok: false, error: code };
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    ...options,
    env: { ...process.env, NODE_NO_WARNINGS: "1", ...options.env },
    shell: process.platform === "win32",
  });
}

function archiveMembers(archivePath) {
  const listed = run("tar", ["-tzf", archivePath]);
  if (listed.status !== 0) {
    return null;
  }
  return listed.stdout
    .split("\n")
    .map((member) => member.trim())
    .filter((member) => member.length > 0);
}

function packagedFiles(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(root, entry.name);
    return entry.isDirectory() ? packagedFiles(entryPath) : [entryPath];
  });
}

function packageRelativeExtension(path) {
  return path.endsWith(".d.ts") ? ".d.ts" : extname(path);
}

function packageRelativeTarget(target) {
  return target.startsWith("./") ? target.slice(2) : target;
}

function exportTargets(exports) {
  return Object.values(exports).flatMap((value) =>
    typeof value === "string" ? [value] : Object.values(value),
  );
}

function isValidManifest(manifest) {
  return (
    typeof manifest === "object" &&
    manifest !== null &&
    typeof manifest.name === "string" &&
    typeof manifest.version === "string" &&
    Array.isArray(manifest.files) &&
    typeof manifest.exports === "object" &&
    manifest.exports !== null &&
    typeof manifest.bin === "object" &&
    manifest.bin !== null
  );
}

function declaredPaths(manifest) {
  const required = new Set(ALWAYS_INCLUDED_PATHS);
  const directoryPrefixes = [];

  for (const entry of manifest.files) {
    if (typeof entry !== "string") {
      return null;
    }
    if (entry.endsWith("/")) {
      directoryPrefixes.push(entry);
    } else {
      required.add(packageRelativeTarget(entry));
    }
  }

  for (const target of [
    ...exportTargets(manifest.exports),
    ...Object.values(manifest.bin),
  ]) {
    if (typeof target !== "string") {
      return null;
    }
    required.add(packageRelativeTarget(target));
  }

  return { required, directoryPrefixes };
}

function subpathsByType(manifest) {
  const modules = [];
  const json = [];
  const jsonl = [];
  const text = [];

  for (const [subpath, target] of Object.entries(manifest.exports)) {
    const specifier =
      subpath === "." ? manifest.name : `${manifest.name}${subpath.slice(1)}`;
    if (typeof target !== "string") {
      modules.push(specifier);
      continue;
    }
    if (target.endsWith(".json")) {
      json.push(specifier);
    } else if (target.endsWith(".jsonl")) {
      jsonl.push(specifier);
    } else if (target.endsWith(".js")) {
      modules.push(specifier);
    } else {
      text.push(specifier);
    }
  }

  return { modules, json, jsonl, text };
}

function resolveEveryExport(consumerRoot, manifest) {
  const subpaths = subpathsByType(manifest);
  const probePath = join(consumerRoot, "resolve-exports.mjs");
  writeFileSync(
    probePath,
    `import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const subpaths = ${JSON.stringify(subpaths, null, 2)};

const readResolved = (specifier) =>
  readFileSync(fileURLToPath(import.meta.resolve(specifier)), "utf8");

for (const specifier of subpaths.modules) {
  const resolved = await import(specifier);
  if (Object.keys(resolved).length === 0) {
    throw new Error(\`empty module: \${specifier}\`);
  }
}

for (const specifier of subpaths.json) {
  const value = JSON.parse(readResolved(specifier));
  if (typeof value !== "object" || value === null) {
    throw new Error(\`invalid json: \${specifier}\`);
  }
}

for (const specifier of subpaths.jsonl) {
  const lines = readResolved(specifier)
    .split("\\n")
    .filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    throw new Error(\`empty jsonl: \${specifier}\`);
  }
  for (const line of lines) {
    JSON.parse(line);
  }
}

for (const specifier of subpaths.text) {
  if (readResolved(specifier).trim().length === 0) {
    throw new Error(\`empty text: \${specifier}\`);
  }
}

process.stdout.write("resolved\\n");
`,
  );

  return run(process.execPath, [probePath], { cwd: consumerRoot }).status === 0;
}

function installedExecutable(consumerRoot, name) {
  return join(
    consumerRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? `${name}.cmd` : name,
  );
}

function firstFixtureLine(installedPackageRoot, ...segments) {
  return readFileSync(join(installedPackageRoot, ...segments), "utf8")
    .split("\n")
    .find((line) => line.trim().length > 0);
}

function firstJsonLine(text) {
  const line = text.split("\n").find((candidate) => candidate.startsWith("{"));
  if (line === undefined) {
    return null;
  }
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function executeInstalledExecutables(consumerRoot, manifest) {
  const installedPackageRoot = join(consumerRoot, "node_modules", manifest.name);

  const sourceRecord = firstFixtureLine(
    installedPackageRoot,
    "spec",
    "conformance",
    "0.1.0",
    "source-record",
    "valid.jsonl",
  );
  if (sourceRecord === undefined) {
    return false;
  }
  const validated = run(
    installedExecutable(consumerRoot, "collective-cognition"),
    ["validate", "--input", "-", "--format", "jsonl"],
    { cwd: consumerRoot, input: `${sourceRecord}\n` },
  );
  if (validated.status !== 0 || firstJsonLine(validated.stdout)?.status !== "accepted") {
    return false;
  }

  const teamMemoryHelp = run(
    installedExecutable(consumerRoot, "collective-cognition-teammem"),
    ["--help"],
    { cwd: consumerRoot },
  );
  if (
    teamMemoryHelp.status !== 0 ||
    !teamMemoryHelp.stdout.includes("collective-cognition-teammem export")
  ) {
    return false;
  }

  const markdownTarget = join(consumerRoot, "markdown-target");
  const markdownInput = join(consumerRoot, "markdown-input.jsonl");
  const portableRecord = firstFixtureLine(
    installedPackageRoot,
    "spec",
    "conformance",
    "0.1.0",
    "portable-cognition",
    "valid.jsonl",
  );
  if (portableRecord === undefined) {
    return false;
  }
  writeFileSync(markdownInput, `${portableRecord}\n`);
  const markdownExecutable = installedExecutable(
    consumerRoot,
    "collective-cognition-markdown",
  );
  const markdownSteps = [
    ["init", "--target", markdownTarget],
    ["project", "--input", markdownInput, "--target", markdownTarget],
    ["verify", "--target", markdownTarget],
  ];
  let markdownVerification;
  for (const args of markdownSteps) {
    markdownVerification = run(markdownExecutable, args, { cwd: consumerRoot });
    if (markdownVerification.status !== 0) {
      return false;
    }
  }
  if (firstJsonLine(markdownVerification.stdout)?.status !== "passed") {
    return false;
  }

  const workflowRejection = run(
    installedExecutable(consumerRoot, "collective-cognition-workflow"),
    [],
    { cwd: consumerRoot },
  );
  return (
    workflowRejection.status !== 0 &&
    firstJsonLine(workflowRejection.stderr)?.code === "WORKFLOW_INVALID_ARGUMENTS"
  );
}

function inspectArchive(workspace, archivePath, expectedVersion) {
  const members = archiveMembers(archivePath);
  if (members === null) {
    return failure("archive_unreadable");
  }
  if (
    !members.every(
      (member) =>
        member === `${ARCHIVE_ROOT}/` ||
        (member.startsWith(`${ARCHIVE_ROOT}/`) &&
          !member.split("/").includes("..")),
    )
  ) {
    return failure("unexpected_package_path");
  }

  const extractRoot = join(workspace, "archive");
  mkdirSync(extractRoot, { recursive: true });
  if (run("tar", ["-xpzf", archivePath, "-C", extractRoot]).status !== 0) {
    return failure("archive_unreadable");
  }

  const packageRoot = join(extractRoot, ARCHIVE_ROOT);
  const files = packagedFiles(packageRoot)
    .map((path) => relative(packageRoot, path).split(sep).join("/"))
    .sort();

  if (
    files.some((path) => PRIVATE_PATH_PATTERNS.some((pattern) => pattern.test(path)))
  ) {
    return failure("private_path_detected");
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  } catch {
    return failure("manifest_invalid");
  }
  if (!isValidManifest(manifest)) {
    return failure("manifest_invalid");
  }
  if (manifest.version !== expectedVersion) {
    return failure("version_mismatch");
  }

  const declared = declaredPaths(manifest);
  if (declared === null) {
    return failure("manifest_invalid");
  }
  const present = new Set(files);
  for (const requiredPath of declared.required) {
    if (!present.has(requiredPath)) {
      return failure("missing_required_path");
    }
  }
  for (const path of files) {
    if (declared.required.has(path)) {
      continue;
    }
    const inDeclaredDirectory = declared.directoryPrefixes.some((prefix) =>
      path.startsWith(prefix),
    );
    if (
      !inDeclaredDirectory ||
      !ALLOWED_DIRECTORY_EXTENSIONS.has(packageRelativeExtension(path))
    ) {
      return failure("unexpected_package_path");
    }
  }

  for (const target of Object.values(manifest.bin)) {
    const executablePath = join(packageRoot, packageRelativeTarget(target));
    if ((statSync(executablePath).mode & 0o777) !== EXECUTABLE_MODE) {
      return failure("executable_mode_invalid");
    }
  }

  for (const path of files) {
    const content = readFileSync(join(packageRoot, path), "utf8");
    if (INSPECTION_PATTERNS.some((pattern) => pattern.test(content))) {
      return failure("credential_pattern_detected");
    }
  }

  const consumerRoot = join(workspace, "consumer");
  mkdirSync(consumerRoot, { recursive: true });
  writeFileSync(
    join(consumerRoot, "package.json"),
    `${JSON.stringify(
      {
        name: "collective-cognition-archive-consumer",
        version: "0.0.0",
        private: true,
        type: "module",
      },
      null,
      2,
    )}\n`,
  );
  const installed = run(
    npmCommand(),
    [
      "install",
      archivePath,
      "--ignore-scripts",
      "--offline",
      "--no-audit",
      "--no-fund",
    ],
    {
      cwd: consumerRoot,
      env: { npm_config_cache: join(workspace, "npm-cache") },
    },
  );
  if (installed.status !== 0) {
    return failure("install_failed");
  }

  if (!resolveEveryExport(consumerRoot, manifest)) {
    return failure("export_resolution_failed");
  }
  if (!executeInstalledExecutables(consumerRoot, manifest)) {
    return failure("executable_failed");
  }

  return { ok: true, packageVersion: manifest.version };
}

export async function verifyPackageArchive({ archivePath, expectedVersion }) {
  if (
    typeof archivePath !== "string" ||
    archivePath.length === 0 ||
    typeof expectedVersion !== "string" ||
    !VERSION_PATTERN.test(expectedVersion)
  ) {
    return failure("invalid_arguments");
  }

  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "ccsdk-verify-archive-")));
  try {
    return inspectArchive(workspace, archivePath, expectedVersion);
  } catch {
    return failure("archive_unreadable");
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

function parseArguments(argv) {
  const flags = ["--archive", "--expected-version"];
  if (argv.length !== flags.length * 2) {
    return null;
  }
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      !flags.includes(flag) ||
      values.has(flag) ||
      typeof value !== "string" ||
      value.length === 0
    ) {
      return null;
    }
    values.set(flag, value);
  }
  return {
    archivePath: values.get("--archive"),
    expectedVersion: values.get("--expected-version"),
  };
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const parsed = parseArguments(process.argv.slice(2));
  const result =
    parsed === null ? failure("invalid_arguments") : await verifyPackageArchive(parsed);
  if (result.ok) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else {
    process.stderr.write(`${JSON.stringify(result)}\n`);
    process.exitCode = 1;
  }
}
