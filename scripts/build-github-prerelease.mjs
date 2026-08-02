import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";

const EXPECTED = Object.freeze({
  repository: "xiongxhc/collective-cognition-sdk",
  packageName: "collective-cognition-sdk",
  packageVersion: "0.6.0",
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
const FORBIDDEN_SCRIPT_TOKENS = /\b(?:npm\s+(?:publish|token|login|adduser|logout|whoami|profile)|NPM_TOKEN|NODE_AUTH_TOKEN|_authToken|authToken)\b/i;

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

function validateOutput(output) {
  let parent;
  let target;
  try {
    parent = lstatSync(dirname(output));
    target = lstatSync(output);
  } catch {
    fail("INVALID_OUTPUT_TARGET");
  }
  if (
    parent.isSymbolicLink() ||
    !parent.isDirectory() ||
    target.isSymbolicLink() ||
    !target.isDirectory() ||
    readdirSync(output).length !== 0
  ) {
    fail("INVALID_OUTPUT_TARGET");
  }
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
    typeof metadata.scripts !== "object"
  ) {
    fail("INVALID_PACKAGE");
  }
  for (const field of RUNTIME_DEPENDENCY_FIELDS) {
    if (field in metadata && Object.keys(metadata[field]).length !== 0) {
      fail("INVALID_PACKAGE");
    }
  }
  for (const script of Object.values(metadata.scripts)) {
    if (typeof script !== "string" || FORBIDDEN_SCRIPT_TOKENS.test(script)) {
      fail("INVALID_PACKAGE");
    }
  }
  return metadata;
}

function sanitizedEnvironment(cacheDirectory) {
  const nodeDirectory = dirname(process.execPath);
  return {
    HOME: process.env.HOME ?? "",
    PATH: `${nodeDirectory}${process.env.PATH ? `:${process.env.PATH}` : ""}`,
    TMPDIR: process.env.TMPDIR ?? "/tmp",
    npm_config_audit: "false",
    npm_config_cache: cacheDirectory,
    npm_config_fund: "false",
    npm_config_ignore_scripts: "true",
    npm_config_offline: "true",
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

function currentCommit(environment) {
  const commit = run("git", ["rev-parse", "HEAD"], "INVALID_GIT_COMMIT", environment).trim();
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    fail("INVALID_GIT_COMMIT");
  }
  return commit;
}

function pack(output, environment) {
  const stdout = run(
    "npm",
    [
      "pack",
      "--json",
      "--ignore-scripts",
      "--offline",
      "--pack-destination",
      output,
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
  const generatedName = result[0].filename;
  if (generatedName !== generatedName.split("/").at(-1)) {
    fail("PACK_FAILED");
  }
  const generatedPath = join(output, generatedName);
  let generated;
  try {
    generated = statSync(generatedPath);
  } catch {
    fail("PACK_FAILED");
  }
  if (!generated.isFile()) {
    fail("PACK_FAILED");
  }
  const expectedPath = join(output, "collective-cognition-sdk-0.6.0.tgz");
  if (generatedPath !== expectedPath) {
    renameSync(generatedPath, expectedPath);
  }
  return expectedPath;
}

function cleanup(paths) {
  for (const path of [...paths].reverse()) {
    rmSync(path, { force: true });
  }
}

function cleanupOutput(output) {
  try {
    for (const name of readdirSync(output)) {
      rmSync(join(output, name), { force: true, recursive: true });
    }
  } catch {}
}

function buildRelease(output, createdPaths) {
  readPackage();
  const cacheDirectory = mkdtempSync(join(tmpdir(), "collective-cognition-npm-cache-"));
  const environment = sanitizedEnvironment(cacheDirectory);
  try {
    const commit = currentCommit(environment);
    run("npm", ["run", "--ignore-scripts", "build"], "BUILD_FAILED", environment);

    const tarballPath = pack(output, environment);
    createdPaths.push(tarballPath);
    const sbomPath = join(output, "collective-cognition-sdk-0.6.0.cdx.json");
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
      return { name: path.split("/").at(-1), bytes: bytes.length, sha256: sha256(bytes) };
    });
    const manifestPath = join(output, "release-manifest.json");
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
    assets: payloads,
    };
    writeFileSync(manifestPath, jsonBuffer(manifest));
    createdPaths.push(manifestPath);

    const checksumPath = join(output, "SHA256SUMS");
    const checksums = [...payloads, {
      name: "release-manifest.json",
      bytes: readFileSync(manifestPath).length,
      sha256: sha256(readFileSync(manifestPath)),
    }]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(({ name, sha256: digest }) => `${digest}  ${name}`)
      .join("\n");
    writeFileSync(checksumPath, `${checksums}\n`);
    createdPaths.push(checksumPath);
  } finally {
    rmSync(cacheDirectory, { recursive: true, force: true });
  }
}

const args = Object.freeze(Array.from(process.argv.slice(2)));
const createdPaths = [];
let output;
let outputIsSafe = false;

try {
  output = parseOutput(args);
  validateOutput(output);
  outputIsSafe = true;
  buildRelease(output, createdPaths);
  process.stdout.write(JSON.stringify({ ok: true, tag: EXPECTED.tag, assets: EXPECTED.assets }) + "\n");
} catch (error) {
  if (outputIsSafe) {
    cleanupOutput(output);
  } else {
    cleanup(createdPaths);
  }
  const code = error instanceof ReleaseError ? error.code : "BUILD_FAILED";
  process.stderr.write(JSON.stringify({ ok: false, error: code }) + "\n");
  process.exitCode = 1;
}
