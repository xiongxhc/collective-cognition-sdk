import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
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
  "../spec/compatibility/0.4.0/baseline.json",
  import.meta.url,
);
const historicalCompatibilityBaselineUrl = new URL(
  "../spec/compatibility/0.3.0/baseline.json",
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
const hostIntegrationExampleUrl = new URL(
  "../examples/host-integration.ts",
  import.meta.url,
);

const expectedRuntimeExports = [
  "DomainError",
  "DomainErrorCode",
  "HOST_INTEGRATION_CONTRACT_VERSION",
  "HostFailureCode",
  "PORTABLE_COGNITION_MAX_JSON_DEPTH",
  "PORTABLE_COGNITION_SCHEMA_VERSION",
  "SOURCE_RECORD_MAX_JSON_DEPTH",
  "SOURCE_RECORD_SCHEMA_VERSION",
  "canonicalizeJson",
  "commitCognitionTransition",
  "commitInitialCognition",
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
const expectedHistoricalEmittedFiles030 = Object.freeze([
  "dist/authorization.d.ts",
  "dist/authorization.js",
  "dist/cli-contract.d.ts",
  "dist/cli-contract.js",
  "dist/cli.d.ts",
  "dist/cli.js",
  "dist/errors.d.ts",
  "dist/errors.js",
  "dist/events.d.ts",
  "dist/events.js",
  "dist/host-conformance.d.ts",
  "dist/host-conformance.js",
  "dist/host-integration.d.ts",
  "dist/host-integration.js",
  "dist/index.d.ts",
  "dist/index.js",
  "dist/ingestion.d.ts",
  "dist/ingestion.js",
  "dist/json-text.d.ts",
  "dist/json-text.js",
  "dist/objects.d.ts",
  "dist/objects.js",
  "dist/portable-cognition.d.ts",
  "dist/portable-cognition.js",
  "dist/promotion.d.ts",
  "dist/promotion.js",
  "dist/reference-host.d.ts",
  "dist/reference-host.js",
  "dist/source-records.d.ts",
  "dist/source-records.js",
  "dist/transitions.d.ts",
  "dist/transitions.js",
  "dist/types.d.ts",
  "dist/types.js",
]);
const expectedSqliteEmittedFiles040 = Object.freeze([
  "dist/stores/sqlite.d.ts",
  "dist/stores/sqlite.js",
]);
const expectedEmittedFiles040 = Object.freeze(
  [
    ...expectedHistoricalEmittedFiles030,
    ...expectedSqliteEmittedFiles040,
  ].sort(),
);
const productionDependencyFields = Object.freeze([
  "dependencies",
  "optionalDependencies",
  "peerDependencies",
]);

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

function declaredProductionDependencyFields(packageMetadata) {
  return productionDependencyFields.filter((field) =>
    Object.hasOwn(packageMetadata, field)
  );
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

test("host integration example uses public package entrypoints", () => {
  const example = readFileSync(hostIntegrationExampleUrl, "utf8");

  assert.match(example, /from "collective-cognition-sdk";/);
  assert.match(
    example,
    /from "collective-cognition-sdk\/reference-host\/0\.1\.0";/,
  );
  assert.doesNotMatch(example, /from "\.\.\/src\/(index|reference-host)\.ts";/);
});

test("host integration example builds and runs without a pre-existing dist", () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "ccsdk-host-example-"));
  const checkoutRoot = join(temporaryRoot, "checkout");
  const expectedOutput =
    '{"initial":"committed","firstTransition":"committed_but_unpublished",' +
    '"retryTransition":"committed","latestVersion":2,"storedEventCount":1,' +
    '"publishedEventCount":1}\n';

  try {
    cpSync(repositoryRoot, checkoutRoot, {
      recursive: true,
      filter(source) {
        const path = relative(repositoryRoot, source).replaceAll("\\", "/");
        return path !== ".git" && !path.startsWith(".git/") &&
          path !== "dist" && !path.startsWith("dist/") &&
          path !== "node_modules" && !path.startsWith("node_modules/");
      },
    });
    symlinkSync(
      join(repositoryRoot, "node_modules"),
      join(checkoutRoot, "node_modules"),
      process.platform === "win32" ? "junction" : "dir",
    );
    assert.equal(existsSync(join(checkoutRoot, "dist")), false);

    const result = spawnNpm(["run", "--silent", "example:host"], {
      cwd: checkoutRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        npm_config_cache: join(temporaryRoot, "npm-cache"),
      },
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout, expectedOutput);
    assert.equal(existsSync(join(checkoutRoot, "dist/index.js")), true);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
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
  const historicalBaseline = JSON.parse(
    readFileSync(historicalCompatibilityBaselineUrl, "utf8"),
  );
  assert.equal(packageJson.version, "0.4.0");
  assert.equal(packageLock.version, "0.4.0");
  assert.equal(packageLock.packages[""].version, "0.4.0");
  assert.deepEqual(packageJson.engines, {
    node: ">=24",
  });
  assert.deepEqual(packageLock.packages[""].engines, {
    node: ">=24",
  });
  assert.deepEqual(declaredProductionDependencyFields(packageJson), []);
  assert.deepEqual(
    declaredProductionDependencyFields(packageLock.packages[""]),
    [],
  );
  assert.equal(
    packageJson.scripts["test:schema"],
    "node --test tests/schema-conformance.test.mjs tests/portable-cognition-schema.test.mjs",
  );
  assert.match(packageJson.scripts["pack:check"], /npm run test:schema/);
  assert.match(packageJson.scripts.prepack, /npm run test:schema/);
  assert.equal(
    packageJson.scripts["example:host"],
    "npm run --silent build && node --disable-warning=ExperimentalWarning examples/host-integration.ts",
  );
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
    "./compatibility/0.3.0":
      "./spec/compatibility/0.3.0/baseline.json",
    "./compatibility/0.4.0":
      "./spec/compatibility/0.4.0/baseline.json",
    "./contracts/host-integration/0.1.0":
      "./spec/host-integration.md",
    "./host-conformance/0.1.0": {
      types: "./dist/host-conformance.d.ts",
      import: "./dist/host-conformance.js",
    },
    "./reference-host/0.1.0": {
      types: "./dist/reference-host.d.ts",
      import: "./dist/reference-host.js",
    },
    "./stores/sqlite/0.1.0": {
      types: "./dist/stores/sqlite.d.ts",
      import: "./dist/stores/sqlite.js",
    },
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
    "rfcs/0004-host-integration-contract.md",
    "rfcs/0005-sqlite-cognition-store.md",
    "spec/README.md",
    "spec/compatibility.md",
    "spec/compatibility/0.1.0/baseline.json",
    "spec/compatibility/0.1.0/change-cases.jsonl",
    "spec/compatibility/0.2.0/baseline.json",
    "spec/compatibility/0.2.0/change-cases.jsonl",
    "spec/compatibility/0.3.0/baseline.json",
    "spec/compatibility/0.3.0/change-cases.jsonl",
    "spec/compatibility/0.4.0/baseline.json",
    "spec/compatibility/0.4.0/change-cases.jsonl",
    "spec/host-integration.md",
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
    historicalBaseline.package.emittedFiles,
    expectedHistoricalEmittedFiles030,
    "package 0.3 emitted inventory must match its literal immutable allowlist",
  );
  assert.deepEqual(
    baseline.package.emittedFiles,
    expectedEmittedFiles040,
    "package 0.4 may add only the two approved SQLite emitted files",
  );
  assert.deepEqual(
    baseline.package.emittedFiles.filter(
      (path) => !expectedHistoricalEmittedFiles030.includes(path),
    ),
    expectedSqliteEmittedFiles040,
    "package 0.4 emitted additions must be exactly the SQLite entrypoint pair",
  );
  assert.deepEqual(
    actualEmittedFiles,
    expectedEmittedFiles040,
    "dist/ contents must match the independent package 0.4 allowlist",
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
    ...expectedEmittedFiles040,
    "package.json",
    "rfcs/0001-universal-source-record-ingestion.md",
    "rfcs/0002-compatibility-versioning-and-deprecation.md",
    "rfcs/0003-portable-cognition-contract.md",
    "rfcs/0004-host-integration-contract.md",
    "rfcs/0005-sqlite-cognition-store.md",
    "rfcs/README.md",
    "spec/README.md",
    "spec/compatibility.md",
    "spec/compatibility/0.1.0/baseline.json",
    "spec/compatibility/0.1.0/change-cases.jsonl",
    "spec/compatibility/0.2.0/baseline.json",
    "spec/compatibility/0.2.0/change-cases.jsonl",
    "spec/compatibility/0.3.0/baseline.json",
    "spec/compatibility/0.3.0/change-cases.jsonl",
    "spec/compatibility/0.4.0/baseline.json",
    "spec/compatibility/0.4.0/change-cases.jsonl",
    "spec/conformance/0.1.0/portable-cognition/cognitive-loop.jsonl",
    "spec/conformance/0.1.0/portable-cognition/invalid.jsonl",
    "spec/conformance/0.1.0/portable-cognition/valid.jsonl",
    "spec/conformance/0.1.0/source-record/invalid.jsonl",
    "spec/conformance/0.1.0/source-record/valid.jsonl",
    "spec/host-integration.md",
    "spec/portable-cognition.md",
    "spec/schemas/0.1.0/portable-cognition.schema.json",
    "spec/schemas/0.1.0/source-record.schema.json",
    "spec/source-record.md",
  ].sort();

  assert.deepEqual(
    baseline.package.packageFiles,
    expectedPaths,
    "compatibility package inventory must match the approved allowlist",
  );
  assert.deepEqual(paths, expectedPaths, "package contents must match allowlist");
  assert.ok(
    paths.every(
      (path) =>
        !/^(?:src|tests|examples|docs)\//.test(path) &&
        !/(?:adapter|connector|git-commit|team-memory|teammem)/i.test(path),
    ),
    "package must exclude source tests, design documents, connectors, and adapters",
  );
  assert.ok(
    paths.every((path) => !/\.db(?:-journal|-wal|-shm)?$/i.test(path)),
    "package must exclude SQLite database artifacts",
  );
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
  HOST_INTEGRATION_CONTRACT_VERSION,
  HostFailureCode,
  commitCognitionTransition,
  commitInitialCognition,
  createPortableCognitionRecord,
  deserializePortableCognitionRecord,
  serializePortableCognitionRecord,
  type CognitionEventPublisher,
  type CognitionHost,
  type CognitionPersistenceStatus,
  type CognitionPublicationStatus,
  type CognitionStore,
  type CognitionStoreCommitResult,
  type DomainErrorCode as DomainErrorCodeType,
  type HostConflict,
  type HostConflictCode,
  type HostFailure,
  type HostFailureCode as HostFailureCodeType,
  type InitialCognitionCommit,
  type InitialCommitOutcome,
  type PortableCognitionEventRecord,
  type PortableCognitionRecord,
  type PortableCognitiveObjectRecord,
  type PortableDomainError,
  type TransitionCognitionCommit,
  type TransitionCommitOutcome,
} from ${JSON.stringify(packageJson.name)};
import {
  InMemoryCognitionEventPublisher,
  InMemoryCognitionStore,
} from ${JSON.stringify(`${packageJson.name}/reference-host/0.1.0`)};
import {
  runCognitionHostConformance,
  type CognitionHostConformanceCaseResult,
  type CognitionHostConformanceFactory,
  type CognitionHostConformanceReport,
} from ${JSON.stringify(`${packageJson.name}/host-conformance/0.1.0`)};
import {
  SqliteCognitionStore,
  type SqliteCognitionStoreOptions,
} from ${JSON.stringify(`${packageJson.name}/stores/sqlite/0.1.0`)};

function roundTrip(record: PortableCognitionRecord) {
  return deserializePortableCognitionRecord(
    serializePortableCognitionRecord(
      createPortableCognitionRecord(record),
    ),
  );
}

declare const packageWideCode: DomainErrorCodeType;
type PortableDomainError020 = {
  readonly code: DomainErrorCodeType;
  readonly message: string;
  readonly details: PortableDomainError["details"];
};
const package020GenericAssignment: PortableDomainError020 = {
  code: packageWideCode,
  message: "Package-wide error.",
  details: {},
};
const oldGenericAssignment: PortableDomainError = {
  // @ts-expect-error Package 0.3.0 narrows the 0.2.0 generic assignment.
  code: packageWideCode,
  message: "Package-wide error.",
  details: {},
};
const portableDomainErrorCodes: readonly PortableDomainError["code"][] = [
  "INVALID_OBJECT",
  "INVALID_SOURCE_RECORD",
  "INVALID_RELATIONSHIP",
  "INVALID_TRANSITION",
  "CONFIRMATION_REQUIRED",
  "AUTHORIZATION_DENIED",
  "SERIALIZATION_ERROR",
  "SOURCE_REVISION_COLLISION",
  "INGESTION_LIMIT_EXCEEDED",
  "PROMOTION_FAILED",
  "INVALID_PORTABLE_COGNITION_RECORD",
];
function isPortableDomainErrorCode(
  code: DomainErrorCodeType,
): code is PortableDomainError["code"] {
  return portableDomainErrorCodes.includes(
    code as PortableDomainError["code"],
  );
}
if (isPortableDomainErrorCode(packageWideCode)) {
  const migratedAssignment: PortableDomainError = {
    code: packageWideCode,
    message: "Portable error.",
    details: {},
  };
  void migratedAssignment;
}

type HostTypes =
  | CognitionEventPublisher
  | CognitionHost
  | CognitionPersistenceStatus
  | CognitionPublicationStatus
  | CognitionStore
  | CognitionStoreCommitResult
  | HostConflict
  | HostConflictCode
  | HostFailure
  | HostFailureCodeType
  | InitialCognitionCommit
  | InitialCommitOutcome
  | PortableCognitionEventRecord
  | PortableCognitiveObjectRecord
  | TransitionCognitionCommit
  | TransitionCommitOutcome
  | CognitionHostConformanceCaseResult
  | CognitionHostConformanceFactory
  | CognitionHostConformanceReport
  | SqliteCognitionStoreOptions;

void roundTrip;
void package020GenericAssignment;
void oldGenericAssignment;
void (undefined as unknown as HostTypes);
void HOST_INTEGRATION_CONTRACT_VERSION;
void HostFailureCode;
void commitCognitionTransition;
void commitInitialCognition;
void InMemoryCognitionEventPublisher;
void InMemoryCognitionStore;
void runCognitionHostConformance;
void SqliteCognitionStore;
`,
    "utf8",
  );
  writeFileSync(
    `${consumerRoot}/consumer.mjs`,
    `import {
  HOST_INTEGRATION_CONTRACT_VERSION,
  HostFailureCode,
  commitCognitionTransition,
  commitInitialCognition,
  createPortableCognitionRecord,
  deserializePortableCognitionRecord,
  serializePortableCognitionRecord,
} from ${JSON.stringify(packageJson.name)};
import {
  InMemoryCognitionEventPublisher,
  InMemoryCognitionStore,
} from ${JSON.stringify(`${packageJson.name}/reference-host/0.1.0`)};
import {
  runCognitionHostConformance,
} from ${JSON.stringify(`${packageJson.name}/host-conformance/0.1.0`)};
import {
  SqliteCognitionStore,
} from ${JSON.stringify(`${packageJson.name}/stores/sqlite/0.1.0`)};
import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const contractUrl = import.meta.resolve(
  ${JSON.stringify(`${packageJson.name}/contracts/host-integration/0.1.0`)},
);
const schemaUrl = import.meta.resolve(
  ${JSON.stringify(`${packageJson.name}/schemas/portable-cognition/0.1.0`)},
);
const fixturesUrl = import.meta.resolve(
  ${JSON.stringify(`${packageJson.name}/conformance/portable-cognition/0.1.0/valid`)},
);
const portableSchema = JSON.parse(readFileSync(new URL(schemaUrl), "utf8"));
const hostContract = readFileSync(new URL(contractUrl), "utf8");
const validRecords = readFileSync(new URL(fixturesUrl), "utf8")
  .trim()
  .split("\\n")
  .map((line) => JSON.parse(line));

const record = createPortableCognitionRecord(validRecords[0]);
const restored = deserializePortableCognitionRecord(
  serializePortableCognitionRecord(record),
);
const sqliteRoot = mkdtempSync(join(tmpdir(), "ccsdk-sqlite-consumer-"));
const databasePath = join(sqliteRoot, "cognition.db");
let reopened = false;
try {
  const createdStore = new SqliteCognitionStore({
    databasePath,
    createIfMissing: true,
  });
  createdStore.close();
  const reopenedStore = new SqliteCognitionStore({ databasePath });
  reopenedStore.close();
  reopened = true;
} finally {
  rmSync(sqliteRoot, { recursive: true, force: true });
}
console.log(JSON.stringify({
  schemaId: portableSchema.$id,
  recordType: restored.recordType,
  contractVersion: HOST_INTEGRATION_CONTRACT_VERSION,
  commitFailure: HostFailureCode.COMMIT_FAILED,
  contractReadable:
    hostContract.includes("# Host Integration Contract 0.1.0") &&
    hostContract.includes("HIC-016"),
  runtimeTypes: [
    typeof commitCognitionTransition,
    typeof commitInitialCognition,
    typeof InMemoryCognitionEventPublisher,
    typeof InMemoryCognitionStore,
    typeof runCognitionHostConformance,
    typeof SqliteCognitionStore,
  ],
  sqliteReopened: reopened,
}));
`,
    "utf8",
  );
  writeFileSync(
    `${consumerRoot}/unsupported-runtime.mjs`,
    `import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const sqliteRoot = mkdtempSync(join(tmpdir(), "ccsdk-unsupported-sqlite-"));
const databasePath = join(sqliteRoot, "cognition.db");
const prototype = DatabaseSync.prototype;
const descriptor = Object.getOwnPropertyDescriptor(
  prototype,
  "enableDefensive",
);
assert.ok(descriptor);
assert.equal(typeof descriptor.value, "function");
Object.defineProperty(prototype, "enableDefensive", {
  ...descriptor,
  value: undefined,
});

let openedStore;
try {
  const rootApi = await import(${JSON.stringify(packageJson.name)});
  const { SqliteCognitionStore } = await import(
    ${JSON.stringify(`${packageJson.name}/stores/sqlite/0.1.0`)}
  );
  assert.equal(typeof rootApi.createObject, "function");
  assert.equal(typeof SqliteCognitionStore, "function");
  assert.throws(
    () => {
      openedStore = new SqliteCognitionStore({
        databasePath,
        createIfMissing: true,
      });
    },
    /node:sqlite with enforced defensive mode/,
  );
  assert.equal(existsSync(databasePath), false);
  assert.deepEqual(readdirSync(sqliteRoot), []);
  console.log(JSON.stringify({
    rootImported: true,
    sqliteImportable: true,
    sqliteRejected: true,
    targetMutated: false,
  }));
} finally {
  openedStore?.close();
  Object.defineProperty(prototype, "enableDefensive", descriptor);
  rmSync(sqliteRoot, { recursive: true, force: true });
}
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
    assert.deepEqual(JSON.parse(consumed.stdout.trim()), {
      schemaId:
        "urn:collective-cognition:schema:portable-cognition:0.1.0",
      recordType: "cognitive-object",
      contractVersion: "0.1.0",
      commitFailure: "HOST_COMMIT_FAILED",
      contractReadable: true,
      runtimeTypes: [
        "function",
        "function",
        "function",
        "function",
        "function",
        "function",
      ],
      sqliteReopened: true,
    });

    const unsupportedConsumed = spawnSync(
      process.execPath,
      [
        "--disable-warning=ExperimentalWarning",
        `${consumerRoot}/unsupported-runtime.mjs`,
      ],
      {
        cwd: consumerRoot,
        encoding: "utf8",
      },
    );
    assert.equal(
      unsupportedConsumed.status,
      0,
      unsupportedConsumed.stderr || unsupportedConsumed.stdout,
    );
    assert.equal(unsupportedConsumed.stderr, "");
    assert.deepEqual(JSON.parse(unsupportedConsumed.stdout.trim()), {
      rootImported: true,
      sqliteImportable: true,
      sqliteRejected: true,
      targetMutated: false,
    });

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
const baselineUrl = import.meta.resolve(${JSON.stringify(`${packageJson.name}/compatibility/0.4.0`)});
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
        baselineVersion: "0.4.0",
        classifications: ["additive"],
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
