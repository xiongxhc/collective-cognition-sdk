import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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
const packageLockUrl = new URL("../package-lock.json", import.meta.url);
const compatibilityBaselineUrl = new URL(
  "../spec/compatibility/0.2.0/baseline.json",
  import.meta.url,
);
const licenseUrl = new URL("../LICENSE", import.meta.url);
const noticeUrl = new URL("../NOTICE", import.meta.url);
const citationUrl = new URL("../CITATION.cff", import.meta.url);
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
  "PORTABLE_COGNITION_MAX_JSON_DEPTH",
  "PORTABLE_COGNITION_SCHEMA_VERSION",
  "SOURCE_RECORD_MAX_JSON_DEPTH",
  "SOURCE_RECORD_SCHEMA_VERSION",
  "canonicalizeJson",
  "createObject",
  "createPortableCognitionRecord",
  "createSourceRecord",
  "deserializeObject",
  "deserializePortableCognitionRecord",
  "deserializeSourceRecord",
  "evaluateAuthorization",
  "ingestAndPromoteEvidence",
  "ingestSourceRecordText",
  "ingestSourceRecords",
  "neutralEvidencePolicyV1",
  "promoteSourceRecordsToEvidence",
  "serializeObject",
  "serializePortableCognitionRecord",
  "serializeSourceRecord",
  "sourceRevisionKey",
  "transitionObject",
  "validatePortableCognitionRecord",
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
  const packageLock = JSON.parse(readFileSync(packageLockUrl, "utf8"));
  const baseline = JSON.parse(
    readFileSync(compatibilityBaselineUrl, "utf8"),
  );
  assert.equal(packageJson.version, "0.2.0");
  assert.equal(packageLock.version, "0.2.0");
  assert.equal(packageLock.packages[""].version, "0.2.0");
  assert.equal(
    packageJson.private,
    true,
    "publication guard must remain enabled",
  );
  assert.equal(packageJson.main, "./dist/index.js");
  assert.equal(packageJson.types, "./dist/index.d.ts");
  assert.equal(packageJson.license, "Apache-2.0");
  assert.deepEqual(packageJson.exports, {
    ".": {
      types: "./dist/index.d.ts",
      import: "./dist/index.js",
    },
    "./compatibility/0.1.0":
      "./spec/compatibility/0.1.0/baseline.json",
    "./compatibility/0.2.0":
      "./spec/compatibility/0.2.0/baseline.json",
    "./schemas/source-record/0.1.0":
      "./spec/schemas/0.1.0/source-record.schema.json",
    "./schemas/portable-cognition/0.1.0":
      "./spec/schemas/0.1.0/portable-cognition.schema.json",
    "./conformance/portable-cognition/0.1.0/valid":
      "./spec/conformance/0.1.0/portable-cognition/valid.jsonl",
    "./conformance/portable-cognition/0.1.0/invalid":
      "./spec/conformance/0.1.0/portable-cognition/invalid.jsonl",
    "./conformance/portable-cognition/0.1.0/cognitive-loop":
      "./spec/conformance/0.1.0/portable-cognition/cognitive-loop.jsonl",
    "./package.json": "./package.json",
  });
  assert.deepEqual(packageJson.files, [
    "CITATION.cff",
    "dist/",
    "LICENSE",
    "NOTICE",
    "README.md",
    "rfcs/README.md",
    "rfcs/0001-universal-source-record-ingestion.md",
    "rfcs/0002-compatibility-versioning-and-deprecation.md",
    "rfcs/0003-portable-cognition-contract.md",
    "spec/README.md",
    "spec/compatibility.md",
    "spec/compatibility/0.1.0/baseline.json",
    "spec/compatibility/0.1.0/change-cases.jsonl",
    "spec/compatibility/0.2.0/baseline.json",
    "spec/compatibility/0.2.0/change-cases.jsonl",
    "spec/source-record.md",
    "spec/portable-cognition.md",
    "spec/schemas/0.1.0/source-record.schema.json",
    "spec/schemas/0.1.0/portable-cognition.schema.json",
    "spec/conformance/0.1.0/source-record/valid.jsonl",
    "spec/conformance/0.1.0/source-record/invalid.jsonl",
    "spec/conformance/0.1.0/portable-cognition/valid.jsonl",
    "spec/conformance/0.1.0/portable-cognition/invalid.jsonl",
    "spec/conformance/0.1.0/portable-cognition/cognitive-loop.jsonl",
  ]);
  assert.deepEqual(packageJson.bin, {
    "collective-cognition": "./dist/cli.js",
  });
  const actualEmittedFiles = emittedFiles(distRoot)
    .map((path) => relative(repositoryRoot, path).replaceAll("\\", "/"))
    .sort();
  assert.deepEqual(
    actualEmittedFiles,
    baseline.package.emittedFiles,
    "dist/ contents must match the immutable baseline inventory",
  );

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
    "CITATION.cff",
    "LICENSE",
    "NOTICE",
    "README.md",
    ...baseline.package.emittedFiles,
    "package.json",
    "rfcs/0001-universal-source-record-ingestion.md",
    "rfcs/0002-compatibility-versioning-and-deprecation.md",
    "rfcs/0003-portable-cognition-contract.md",
    "rfcs/README.md",
    "spec/README.md",
    "spec/compatibility.md",
    "spec/compatibility/0.1.0/baseline.json",
    "spec/compatibility/0.1.0/change-cases.jsonl",
    "spec/compatibility/0.2.0/baseline.json",
    "spec/compatibility/0.2.0/change-cases.jsonl",
    "spec/conformance/0.1.0/portable-cognition/cognitive-loop.jsonl",
    "spec/conformance/0.1.0/portable-cognition/invalid.jsonl",
    "spec/conformance/0.1.0/portable-cognition/valid.jsonl",
    "spec/conformance/0.1.0/source-record/invalid.jsonl",
    "spec/conformance/0.1.0/source-record/valid.jsonl",
    "spec/portable-cognition.md",
    "spec/schemas/0.1.0/portable-cognition.schema.json",
    "spec/schemas/0.1.0/source-record.schema.json",
    "spec/source-record.md",
  ].sort();

  assert.deepEqual(paths, expectedPaths, "package contents must match allowlist");
  assert.equal(statSync(distRoot).isDirectory(), true);
});

test("license, attribution, and citation metadata remain distributable", () => {
  const license = readFileSync(licenseUrl, "utf8");
  const notice = readFileSync(noticeUrl, "utf8");
  const citation = readFileSync(citationUrl, "utf8");

  assert.equal(
    createHash("sha256").update(license).digest("hex"),
    "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30",
  );
  assert.match(license, /Apache License\n\s+Version 2\.0, January 2004/);
  assert.match(notice, /^Collective Cognition SDK$/m);
  assert.match(notice, /^Copyright 2026 Chris Xiong$/m);
  assert.match(citation, /^cff-version: 1\.2\.0$/m);
  assert.match(citation, /^license: Apache-2\.0$/m);
  assert.match(
    citation,
    /^repository-code: "https:\/\/github\.com\/xiongxhc\/collective-cognition-sdk"$/m,
  );
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
    `import {
  createPortableCognitionRecord,
  deserializePortableCognitionRecord,
  serializePortableCognitionRecord,
  type PortableCognitionRecord,
} from ${JSON.stringify(packageJson.name)};

function roundTrip(record: PortableCognitionRecord) {
  return deserializePortableCognitionRecord(
    serializePortableCognitionRecord(
      createPortableCognitionRecord(record),
    ),
  );
}

void roundTrip;
`,
    "utf8",
  );
  writeFileSync(
    `${consumerRoot}/consumer.mjs`,
    `import {
  createPortableCognitionRecord,
  deserializePortableCognitionRecord,
  serializePortableCognitionRecord,
} from ${JSON.stringify(packageJson.name)};
import { readFileSync } from "node:fs";

const schemaUrl = import.meta.resolve(
  ${JSON.stringify(`${packageJson.name}/schemas/portable-cognition/0.1.0`)},
);
const fixturesUrl = import.meta.resolve(
  ${JSON.stringify(`${packageJson.name}/conformance/portable-cognition/0.1.0/valid`)},
);
const portableSchema = JSON.parse(readFileSync(new URL(schemaUrl), "utf8"));
const validRecords = readFileSync(new URL(fixturesUrl), "utf8")
  .trim()
  .split("\\n")
  .map((line) => JSON.parse(line));

const record = createPortableCognitionRecord(validRecords[0]);
const restored = deserializePortableCognitionRecord(
  serializePortableCognitionRecord(record),
);
console.log(portableSchema.$id, restored.recordType);
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

    const consumed = spawnSync(
      process.execPath,
      [`${consumerRoot}/consumer.mjs`],
      {
        cwd: consumerRoot,
        encoding: "utf8",
      },
    );
    assert.equal(consumed.status, 0, consumed.stderr);
    assert.equal(
      consumed.stdout.trim(),
      "urn:collective-cognition:schema:portable-cognition:0.1.0 cognitive-object",
    );

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

    const importedCompatibility = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `import { readFile } from "node:fs/promises";
const baselineUrl = import.meta.resolve(${JSON.stringify(`${packageJson.name}/compatibility/0.1.0`)});
const baseline = JSON.parse(await readFile(new URL(baselineUrl), "utf8"));
const changeCases = (await readFile(new URL("./change-cases.jsonl", baselineUrl), "utf8"))
  .trim()
  .split("\\n")
  .map((line) => JSON.parse(line));
console.log(JSON.stringify({
  baselineVersion: baseline.baselineVersion,
  classifications: changeCases.map((changeCase) => changeCase.classification),
}));`,
      ],
      {
        cwd: consumerRoot,
        encoding: "utf8",
      },
    );
    assert.equal(importedCompatibility.status, 0, importedCompatibility.stderr);
    assert.deepEqual(JSON.parse(importedCompatibility.stdout.trim()), {
      baselineVersion: "0.1.0",
      classifications: ["additive", "breaking"],
    });

    const importedCurrentCompatibility = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `import { readFile } from "node:fs/promises";
const baselineUrl = import.meta.resolve(${JSON.stringify(`${packageJson.name}/compatibility/0.2.0`)});
const baseline = JSON.parse(await readFile(new URL(baselineUrl), "utf8"));
const changeCases = (await readFile(new URL("./change-cases.jsonl", baselineUrl), "utf8"))
  .trim()
  .split("\\n")
  .map((line) => JSON.parse(line));
console.log(JSON.stringify({
  baselineVersion: baseline.baselineVersion,
  classifications: changeCases.map((changeCase) => changeCase.classification),
}));`,
      ],
      {
        cwd: consumerRoot,
        encoding: "utf8",
      },
    );
    assert.equal(
      importedCurrentCompatibility.status,
      0,
      importedCurrentCompatibility.stderr,
    );
    assert.deepEqual(
      JSON.parse(importedCurrentCompatibility.stdout.trim()),
      {
        baselineVersion: "0.2.0",
        classifications: ["additive", "breaking"],
      },
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
