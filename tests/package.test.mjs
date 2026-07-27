import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const distRoot = fileURLToPath(new URL("../dist/", import.meta.url));
const distIndexUrl = new URL("../dist/index.js", import.meta.url);
const distTypesUrl = new URL("../dist/index.d.ts", import.meta.url);
const distCliUrl = new URL("../dist/cli.js", import.meta.url);
const packageJsonUrl = new URL("../package.json", import.meta.url);
const typescriptCli = fileURLToPath(
  new URL("../node_modules/typescript/bin/tsc", import.meta.url),
);
const validFixturesUrl = new URL(
  "../spec/conformance/0.1.0/source-record/valid.jsonl",
  import.meta.url,
);

const expectedRuntimeExports = [
  "DomainError",
  "DomainErrorCode",
  "SOURCE_RECORD_MAX_JSON_DEPTH",
  "SOURCE_RECORD_SCHEMA_VERSION",
  "canonicalizeJson",
  "createObject",
  "createSourceRecord",
  "deserializeObject",
  "deserializeSourceRecord",
  "evaluateAuthorization",
  "ingestAndPromoteEvidence",
  "ingestSourceRecordText",
  "ingestSourceRecords",
  "neutralEvidencePolicyV1",
  "promoteSourceRecordsToEvidence",
  "serializeObject",
  "serializeSourceRecord",
  "sourceRevisionKey",
  "transitionObject",
  "validateSourceRecord",
].sort();

function emittedFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? emittedFiles(path) : [path];
  });
}

function spawnNpm(args, options) {
  return spawnSync("npm", args, {
    ...options,
    shell: process.platform === "win32",
  });
}

test("built package exposes only the source-neutral runtime API", async () => {
  assert.equal(
    existsSync(distIndexUrl),
    true,
    "dist/index.js must exist; run npm run build",
  );
  assert.equal(
    existsSync(distTypesUrl),
    true,
    "dist/index.d.ts must exist; run npm run build",
  );
  assert.equal(
    existsSync(distCliUrl),
    true,
    "dist/cli.js must exist; run npm run build",
  );

  const builtApi = await import(distIndexUrl.href);
  assert.deepEqual(Object.keys(builtApi).sort(), expectedRuntimeExports);
});

test("emitted modules contain no relative TypeScript import specifiers", () => {
  assert.equal(
    existsSync(distRoot),
    true,
    "dist/ must exist; run npm run build",
  );
  const emittedModules = emittedFiles(distRoot).filter(
    (path) => path.endsWith(".js") || path.endsWith(".d.ts"),
  );
  assert.ok(emittedModules.length > 0, "dist/ must contain emitted modules");

  for (const path of emittedModules) {
    const text = readFileSync(path, "utf8");
    assert.doesNotMatch(
      text,
      /(?:from\s+|import\s*\()["'][.]{1,2}\/[^"']+\.ts["']/,
      `${path} contains a relative .ts module specifier`,
    );
  }
});

test("built CLI executable validates canonical SourceRecord input", () => {
  const validRecord = readFileSync(validFixturesUrl, "utf8")
    .split("\n")
    .find((line) => line.trim().length > 0);
  assert.ok(validRecord, "valid SourceRecord fixture must not be empty");

  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(distCliUrl),
      "validate",
      "--input",
      "-",
      "--format",
      "jsonl",
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      input: `${validRecord}\n`,
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  const output = JSON.parse(result.stdout.trim());
  assert.equal(output.status, "accepted");
});

test("npm package manifest and tarball expose only approved artifacts", () => {
  const packageJson = JSON.parse(readFileSync(packageJsonUrl, "utf8"));
  assert.equal(
    packageJson.private,
    true,
    "publication guard must remain enabled",
  );
  assert.equal(packageJson.main, "./dist/index.js");
  assert.equal(packageJson.types, "./dist/index.d.ts");
  assert.deepEqual(packageJson.exports, {
    ".": {
      types: "./dist/index.d.ts",
      import: "./dist/index.js",
    },
    "./schemas/source-record/0.1.0":
      "./spec/schemas/0.1.0/source-record.schema.json",
    "./package.json": "./package.json",
  });
  assert.deepEqual(packageJson.bin, {
    "collective-cognition": "./dist/cli.js",
  });

  const npmCache = mkdtempSync(join(tmpdir(), "ccsdk-npm-cache-"));
  let packed;
  try {
    packed = spawnNpm(
      ["pack", "--dry-run", "--json", "--ignore-scripts"],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          npm_config_cache: npmCache,
        },
      },
    );
  } finally {
    rmSync(npmCache, { recursive: true, force: true });
  }
  assert.equal(packed.status, 0, packed.stderr);
  const packResults = JSON.parse(packed.stdout);
  assert.equal(packResults.length, 1);
  const paths = packResults[0].files.map((file) => file.path).sort();
  const expectedPaths = [
    "README.md",
    ...emittedFiles(distRoot).map((path) =>
      relative(repositoryRoot, path).replaceAll("\\", "/"),
    ),
    "package.json",
    "rfcs/0001-universal-source-record-ingestion.md",
    "rfcs/README.md",
    "spec/README.md",
    "spec/conformance/0.1.0/source-record/invalid.jsonl",
    "spec/conformance/0.1.0/source-record/valid.jsonl",
    "spec/schemas/0.1.0/source-record.schema.json",
    "spec/source-record.md",
  ].sort();

  assert.deepEqual(paths, expectedPaths, "package contents must match allowlist");
  assert.equal(statSync(distRoot).isDirectory(), true);
});

test("packed artifact installs, typechecks, imports, and exposes its executable", () => {
  const packageJson = JSON.parse(readFileSync(packageJsonUrl, "utf8"));
  const temporaryRoot = mkdtempSync(join(tmpdir(), "ccsdk-consumer-"));
  const npmCache = `${temporaryRoot}/npm-cache`;
  const packageOutput = `${temporaryRoot}/package`;
  const consumerRoot = `${temporaryRoot}/consumer`;
  mkdirSync(packageOutput);
  mkdirSync(consumerRoot);
  writeFileSync(
    `${consumerRoot}/package.json`,
    JSON.stringify({ name: "ccsdk-consumer", private: true, type: "module" }),
    "utf8",
  );
  writeFileSync(
    `${consumerRoot}/tsconfig.json`,
    JSON.stringify({
      compilerOptions: {
        target: "ES2024",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        resolveJsonModule: true,
        strict: true,
        skipLibCheck: false,
        noEmit: true,
      },
      include: ["index.ts"],
    }),
    "utf8",
  );
  writeFileSync(
    `${consumerRoot}/index.ts`,
    `import { createObject, type GoalData } from ${JSON.stringify(packageJson.name)};
import sourceRecordSchema from ${JSON.stringify(`${packageJson.name}/schemas/source-record/0.1.0`)}
  with { type: "json" };

if (
  sourceRecordSchema.$id !==
  "urn:collective-cognition:schema:source-record:0.1.0"
) {
  throw new Error("installed SourceRecord schema is not discoverable");
}

const data: GoalData = { objective: "Verify package declarations." };
createObject({
  id: "goal:consumer",
  type: "goal",
  version: 1,
  state: "draft",
  title: "Consumer compile",
  data,
  createdAt: "2026-07-27T00:00:00.000Z",
  updatedAt: "2026-07-27T00:00:00.000Z",
  attribution: {
    initiatorId: "human:consumer",
    executorId: "human:consumer",
    accountableId: "human:consumer"
  },
  provenance: [{
    source: "consumer-test",
    sourceId: "source:1",
    capturedAt: "2026-07-27T00:00:00.000Z"
  }],
  contextId: "organization:consumer",
  relationships: []
});
`,
    "utf8",
  );

  const environment = {
    ...process.env,
    npm_config_cache: npmCache,
  };

  try {
    const packed = spawnNpm(
      [
        "pack",
        "--json",
        "--ignore-scripts",
        "--pack-destination",
        packageOutput,
      ],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: environment,
      },
    );
    assert.equal(packed.status, 0, packed.stderr);
    const packResults = JSON.parse(packed.stdout);
    assert.equal(packResults.length, 1);
    const tarballPath = `${packageOutput}/${packResults[0].filename}`;

    const installed = spawnNpm(
      [
        "install",
        tarballPath,
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
      ],
      {
        cwd: consumerRoot,
        encoding: "utf8",
        env: environment,
      },
    );
    assert.equal(installed.status, 0, installed.stderr);

    const typechecked = spawnSync(
      process.execPath,
      [typescriptCli, "--project", `${consumerRoot}/tsconfig.json`],
      {
        cwd: consumerRoot,
        encoding: "utf8",
      },
    );
    assert.equal(typechecked.status, 0, typechecked.stderr || typechecked.stdout);

    const imported = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `import * as sdk from ${JSON.stringify(packageJson.name)}; console.log(JSON.stringify(Object.keys(sdk).sort()));`,
      ],
      {
        cwd: consumerRoot,
        encoding: "utf8",
      },
    );
    assert.equal(imported.status, 0, imported.stderr);
    assert.deepEqual(
      JSON.parse(imported.stdout.trim()),
      expectedRuntimeExports,
    );

    const importedSchema = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `import schema from ${JSON.stringify(`${packageJson.name}/schemas/source-record/0.1.0`)} with { type: "json" }; console.log(schema.$id);`,
      ],
      {
        cwd: consumerRoot,
        encoding: "utf8",
      },
    );
    assert.equal(importedSchema.status, 0, importedSchema.stderr);
    assert.equal(
      importedSchema.stdout.trim(),
      "urn:collective-cognition:schema:source-record:0.1.0",
    );

    const executableName =
      process.platform === "win32"
        ? "collective-cognition.cmd"
        : "collective-cognition";
    const executable = `${consumerRoot}/node_modules/.bin/${executableName}`;
    assert.equal(
      existsSync(executable),
      true,
      "installed collective-cognition executable is missing",
    );
    const validRecord = readFileSync(validFixturesUrl, "utf8")
      .split("\n")
      .find((line) => line.trim().length > 0);
    assert.ok(validRecord, "valid SourceRecord fixture must not be empty");
    const executed = spawnSync(
      executable,
      ["validate", "--input", "-", "--format", "jsonl"],
      {
        cwd: consumerRoot,
        encoding: "utf8",
        input: `${validRecord}\n`,
        shell: process.platform === "win32",
      },
    );
    assert.equal(executed.status, 0, executed.stderr);
    assert.equal(JSON.parse(executed.stdout.trim()).status, "accepted");
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
