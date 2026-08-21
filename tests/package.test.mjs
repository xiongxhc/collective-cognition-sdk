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
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const distRoot = fileURLToPath(new URL("../dist/", import.meta.url));
const distIndexUrl = new URL("../dist/index.js", import.meta.url);
const distTypesUrl = new URL("../dist/index.d.ts", import.meta.url);
const distCliUrl = new URL("../dist/cli.js", import.meta.url);
const distTeamMemoryCliUrl = new URL(
  "../dist/team-memory-cli.js",
  import.meta.url,
);
const distMarkdownCognitionUrl = new URL(
  "../dist/markdown-cognition.js",
  import.meta.url,
);
const distMarkdownCognitionCliUrl = new URL(
  "../dist/markdown-cognition-cli.js",
  import.meta.url,
);
const distWorkflowCliUrl = new URL(
  "../dist/workflow-cli.js",
  import.meta.url,
);
const packageJsonUrl = new URL("../package.json", import.meta.url);
const packageLockUrl = new URL("../package-lock.json", import.meta.url);
const gitAttributesUrl = new URL("../.gitattributes", import.meta.url);
const compatibilityBaselineUrl = new URL(
  "../spec/compatibility/0.9.0/baseline.json",
  import.meta.url,
);
const historicalCompatibilityBaselineUrl = new URL(
  "../spec/compatibility/0.5.0/baseline.json",
  import.meta.url,
);
const previousCompatibilityBaselineUrl = new URL(
  "../spec/compatibility/0.8.0/baseline.json",
  import.meta.url,
);
const licenseUrl = new URL("../LICENSE", import.meta.url);
const noticeUrl = new URL("../NOTICE", import.meta.url);
const citationUrl = new URL("../CITATION.cff", import.meta.url);
const readmeUrl = new URL("../README.md", import.meta.url);
const connectorAuthorGuideUrl = new URL(
  "../docs/connector-author-guide.md",
  import.meta.url,
);
const durableWorkflowGuideUrl = new URL(
  "../docs/durable-cognition-workflow-guide.md",
  import.meta.url,
);
const roadmapUrl = new URL("../docs/ROADMAP.md", import.meta.url);
const connectorRfcUrl = new URL(
  "../rfcs/0006-maintained-source-connectors.md",
  import.meta.url,
);
const runtimeSecurityRfcUrl = new URL(
  "../rfcs/0008-runtime-security-profile.md",
  import.meta.url,
);
const durableWorkflowRfcUrl = new URL(
  "../rfcs/0010-durable-cognition-workflow.md",
  import.meta.url,
);
const rfcIndexUrl = new URL("../rfcs/README.md", import.meta.url);
const specificationIndexUrl = new URL("../spec/README.md", import.meta.url);
const compatibilityPolicyUrl = new URL(
  "../spec/compatibility.md",
  import.meta.url,
);
const runtimeSecurityProfileUrl = new URL(
  "../spec/runtime-security.md",
  import.meta.url,
);
const typescriptCli = fileURLToPath(
  new URL("../node_modules/typescript/bin/tsc", import.meta.url),
);
const validFixturesUrl = new URL(
  "../spec/conformance/0.1.0/source-record/valid.jsonl",
  import.meta.url,
);
const portableCognitionValidFixturesUrl = new URL(
  "../spec/conformance/0.1.0/portable-cognition/valid.jsonl",
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
const expectedDurableWorkflowRuntimeExports = [
  "DURABLE_COGNITION_WORKFLOW_VERSION",
  "prepareDurableCognitionWorkflow",
  "runDurableCognitionWorkflow",
  "runDurableWorkflowStoreConformance",
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
const expectedConnectorEmittedFiles050 = Object.freeze([
  "dist/connector-conformance.d.ts",
  "dist/connector-conformance.js",
  "dist/connectors/team-memory.d.ts",
  "dist/connectors/team-memory.js",
  "dist/team-memory-cli.d.ts",
  "dist/team-memory-cli.js",
]);
const expectedEmittedFiles050 = Object.freeze(
  [
    ...expectedEmittedFiles040,
    ...expectedConnectorEmittedFiles050,
  ].sort(),
);
const expectedMarkdownEmittedFiles060 = Object.freeze([
  "dist/markdown-cognition-cli.d.ts",
  "dist/markdown-cognition-cli.js",
  "dist/markdown-cognition-profile.d.ts",
  "dist/markdown-cognition-profile.js",
  "dist/markdown-cognition-projection.d.ts",
  "dist/markdown-cognition-projection.js",
  "dist/markdown-cognition-target.d.ts",
  "dist/markdown-cognition-target.js",
  "dist/markdown-cognition.d.ts",
  "dist/markdown-cognition.js",
]);
const expectedEmittedFiles060 = Object.freeze(
  [...expectedEmittedFiles050, ...expectedMarkdownEmittedFiles060].sort(),
);
const expectedDurableWorkflowEmittedFiles090 = Object.freeze([
  "dist/stores/sqlite-workflow.d.ts",
  "dist/stores/sqlite-workflow.js",
  "dist/workflow-cli-contract.d.ts",
  "dist/workflow-cli-contract.js",
  "dist/workflow-cli.d.ts",
  "dist/workflow-cli.js",
  "dist/workflows/durable-conformance.d.ts",
  "dist/workflows/durable-conformance.js",
  "dist/workflows/durable-contract.d.ts",
  "dist/workflows/durable-contract.js",
  "dist/workflows/durable-prepare.d.ts",
  "dist/workflows/durable-prepare.js",
  "dist/workflows/durable-run.d.ts",
  "dist/workflows/durable-run.js",
  "dist/workflows/durable.d.ts",
  "dist/workflows/durable.js",
]);
const expectedEmittedFiles090 = Object.freeze(
  [...expectedEmittedFiles060, ...expectedDurableWorkflowEmittedFiles090].sort(),
);
const productionDependencyFields = Object.freeze([
  "dependencies",
  "optionalDependencies",
  "peerDependencies",
  "bundleDependencies",
  "bundledDependencies",
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertMarkdownLinksResolve(markdown, sourceUrl) {
  const sourcePath = fileURLToPath(sourceUrl);

  for (const match of markdown.matchAll(/\[[^\]]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const rawTarget = match[1];
    if (rawTarget.startsWith("#") || /^[a-z]+:/i.test(rawTarget)) {
      continue;
    }
    const targetPath = resolve(dirname(sourcePath), rawTarget.split("#", 1)[0]);
    assert.equal(
      statSync(targetPath).isFile() || statSync(targetPath).isDirectory(),
      true,
      `${rawTarget} from ${relative(repositoryRoot, sourcePath)} must resolve`,
    );
  }
}

function assertContainsRequiredPhrase(documents, phrase) {
  assert.equal(
    documents.some((document) => document.content.toLowerCase().includes(phrase.toLowerCase())),
    true,
    `expected one public runtime-security document to contain or link ${JSON.stringify(phrase)}`,
  );
}

function assertNoPositiveClaimWithoutNearbyNegation(markdown, claim) {
  const lines = markdown.split("\n");
  const claimPattern = new RegExp(`\\b${escapeRegExp(claim)}\\b`, "i");
  const negationPattern = /\b(?:not|no|without|isn't|aren't|does not|doesn't|never)\b/i;

  for (let index = 0; index < lines.length; index += 1) {
    if (!claimPattern.test(lines[index])) {
      continue;
    }
    const nearby = lines.slice(Math.max(0, index - 1), index + 2).join(" ");
    assert.match(
      nearby,
      negationPattern,
      `README must not claim ${claim} without a nearby negation`,
    );
  }
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
  assert.equal(
    existsSync(distTeamMemoryCliUrl),
    true,
    "dist/team-memory-cli.js must exist; run npm run build",
  );
  assert.equal(
    existsSync(distMarkdownCognitionUrl),
    true,
    "dist/markdown-cognition.js must exist; run npm run build",
  );
  assert.equal(
    existsSync(distMarkdownCognitionCliUrl),
    true,
    "dist/markdown-cognition-cli.js must exist; run npm run build",
  );

  const builtApi = await import(distIndexUrl.href);
  assert.deepEqual(Object.keys(builtApi).sort(), expectedRuntimeExports);
});

test("package 0.9.0 exposes the exact durable workflow subpaths and executable", async () => {
  const packageJson = JSON.parse(readFileSync(packageJsonUrl, "utf8"));

  assert.equal(packageJson.version, "0.9.0");
  assert.deepEqual(packageJson.exports["./workflows/durable/0.1.0"], {
    types: "./dist/workflows/durable.d.ts",
    import: "./dist/workflows/durable.js",
  });
  assert.deepEqual(packageJson.exports["./stores/sqlite-workflow/0.1.0"], {
    types: "./dist/stores/sqlite-workflow.d.ts",
    import: "./dist/stores/sqlite-workflow.js",
  });
  assert.equal(
    packageJson.bin["collective-cognition-workflow"],
    "./dist/workflow-cli.js",
  );
  assert.deepEqual(
    Object.keys(await import("collective-cognition-sdk/workflows/durable/0.1.0")).sort(),
    expectedDurableWorkflowRuntimeExports,
  );
  assert.deepEqual(
    Object.keys(await import("collective-cognition-sdk/stores/sqlite-workflow/0.1.0")).sort(),
    ["SqliteCognitionWorkflowStore"],
  );
  await assert.rejects(
    import("collective-cognition-sdk/stores/sqlite-internal"),
    { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" },
  );
  assert.equal(existsSync(new URL("../dist/stores/sqlite-internal.js", import.meta.url)), false);
  assert.equal(existsSync(new URL("../dist/stores/sqlite-internal.d.ts", import.meta.url)), false);
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

test("public documentation explains the source-neutral connector model", () => {
  const packageJson = JSON.parse(readFileSync(packageJsonUrl, "utf8"));
  const readme = readFileSync(readmeUrl, "utf8");
  const authorGuide = readFileSync(connectorAuthorGuideUrl, "utf8");
  const roadmap = readFileSync(roadmapUrl, "utf8");
  const connectorRfc = readFileSync(connectorRfcUrl, "utf8");
  const runtimeSecurityRfc = readFileSync(runtimeSecurityRfcUrl, "utf8");
  const rfcIndex = readFileSync(rfcIndexUrl, "utf8");
  const specificationIndex = readFileSync(specificationIndexUrl, "utf8");
  const compatibilityPolicy = readFileSync(compatibilityPolicyUrl, "utf8");
  const runtimeSecurityProfile = readFileSync(runtimeSecurityProfileUrl, "utf8");
  const publicRuntimeSecurityDocuments = [
    { url: readmeUrl, content: readme },
    { url: specificationIndexUrl, content: specificationIndex },
    { url: rfcIndexUrl, content: rfcIndex },
    { url: roadmapUrl, content: roadmap },
    { url: runtimeSecurityRfcUrl, content: runtimeSecurityRfc },
    { url: runtimeSecurityProfileUrl, content: runtimeSecurityProfile },
  ];

  assert.equal(packageJson.private, true);
  assert.match(readme, /private and unpublished/i);
  assert.match(
    readme,
    /> The source-neutral core integrates through portable contracts\./,
  );
  assert.match(
    readme,
    /Optional\n> connectors and adapters operate only on explicitly supplied sources or\n> managed Markdown targets; they never discover another system's internals\./,
  );
  assert.doesNotMatch(
    readme,
    /Integrates with other systems only by reading Markdown vaults/i,
  );
  assert.doesNotMatch(readme, /github\.com\/xiongxhc\/collective-cognition-sdk\/blob\/master\//);
  assert.doesNotMatch(roadmap, /exact-`master`/);
  assert.match(roadmap, /exact-`main` tag/);
  assert.match(
    readme,
    /\[connector author guide\]\(docs\/connector-author-guide\.md\)/i,
  );
  assert.match(
    readme,
    /\[RFC 0006[^\]]*\]\(rfcs\/0006-maintained-source-connectors\.md\)/i,
  );
  assert.match(
    readme,
    /team-memory is one maintained compatible connector/i,
  );
  assert.match(
    readme,
    /collection does not imply interpretation, promotion, or persistence/i,
  );
  assert.match(readme, /does not require\s+`team-memory-agent`/i);
  assert.match(readme, /`sourceInstance` is public, non-secret identity/i);
  assert.match(
    readme,
    /`--include-raw` is\s+an explicit\s+privacy-sensitive opt-in/i,
  );

  assert.match(
    authorGuide,
    /`SourceRecord` is the universal boundary/i,
  );
  assert.match(
    authorGuide,
    /from "collective-cognition-sdk";/,
  );
  assert.match(
    authorGuide,
    /from "collective-cognition-sdk\/connector-conformance\/0\.1\.0";/,
  );
  assert.doesNotMatch(
    authorGuide,
    /collective-cognition-sdk\/connectors\/team-memory/,
  );
  assert.match(
    authorGuide,
    /separate repository and package/i,
  );
  assert.match(
    authorGuide,
    /conformance is not\s+certification, does not imply\s+endorsement, and is not an LTS commitment/i,
  );

  [
    "Runtime and Security Profile 0.1.0",
    "sdk-enforced",
    "conformance-verified",
    "host-required",
    "out-of-scope",
    "collective-cognition-sdk/runtime-security/0.1.0",
    "conformance is not certification",
    "authentication",
    "encryption",
    "tenant or workspace isolation",
    "durable publication recovery",
    "private and unpublished",
  ].forEach((phrase) => assertContainsRequiredPhrase(publicRuntimeSecurityDocuments, phrase));

  assert.match(
    runtimeSecurityRfc,
    /^# RFC 0008: Runtime and Security Profile$/m,
  );
  [
    "## Problem",
    "## Proposed Semantics",
    "## Enforcement Classes",
    "## Machine-Readable Profile",
    "## Alternatives",
    "## Compatibility and Migration",
    "## Security and Human Authority",
    "## Acceptance Checks",
    "## Explicit Deferrals",
  ].forEach((heading) =>
    assert.match(runtimeSecurityRfc, new RegExp(`^${escapeRegExp(heading)}$`, "m"))
  );
  [
    "sdk-enforced",
    "conformance-verified",
    "host-required",
    "out-of-scope",
    "collective-cognition-sdk/runtime-security/0.1.0",
    "does not add a runtime policy engine",
  ].forEach((phrase) =>
    assert.match(runtimeSecurityRfc, new RegExp(escapeRegExp(phrase)))
  );
  assert.match(
    runtimeSecurityRfc,
    /Private package `0\.7\.0` classifies this addition as `additive` with a `minor`\s+package-version effect\./,
  );
  assert.match(
    runtimeSecurityRfc,
    /Passing SDK\s+or repository checks does not certify a host as secure, compliant, or\s+production-ready\./,
  );

  assert.match(
    rfcIndex,
    /\[RFC 0006: Maintained Source Connectors\]\(0006-maintained-source-connectors\.md\)/,
  );
  assert.match(
    rfcIndex,
    /\[RFC 0008: Runtime and Security Profile\]\(0008-runtime-security-profile\.md\)/,
  );
  assert.match(
    rfcIndex,
    /current package is private, unpublished `0\.9\.0`/,
  );
  assert.doesNotMatch(
    rfcIndex,
    /current package is private, unpublished `0\.6\.0`/,
  );
  assert.match(
    specificationIndex,
    /collective-cognition-sdk\/connector-conformance\/0\.1\.0/,
  );
  assert.match(
    specificationIndex,
    /collective-cognition-sdk\/connectors\/team-memory\/0\.1\.0/,
  );
  assert.match(specificationIndex, /Runtime and Security Profile `0\.1\.0`/);
  assert.match(
    specificationIndex,
    /implemented, full local-gate verified, and independently reviewed/,
  );
  assert.match(
    specificationIndex,
    /collective-cognition-sdk\/runtime-security\/0\.1\.0/,
  );
  assert.match(
    readme,
    /## Runtime and Security Profile/,
  );
  assert.match(
    readme,
    /```js\nimport runtimeSecurityProfile from "collective-cognition-sdk\/runtime-security\/0\.1\.0"\n  with \{ type: "json" \};\n```/,
  );
  [
    "`sdk-enforced`",
    "`conformance-verified`",
    "`host-required`",
    "`out-of-scope`",
  ].forEach((className) =>
    assert.match(readme, new RegExp(escapeRegExp(className)))
  );
  assert.match(
    readme,
    /The JSON tells a host what remains unimplemented; importing it does not enforce host-required controls\./,
  );
  assert.match(
    readme,
    /\[host-required controls checklist\]\(spec\/runtime-security\.md#host-required-controls\)/,
  );
  [
    "authentication",
    "encryption",
    "tenant or workspace isolation",
    "durable publication recovery",
    "Conformance is not certification",
    "does not certify a deployment as secure",
  ].forEach((phrase) =>
    assert.match(readme, new RegExp(escapeRegExp(phrase), "i"))
  );
  assert.match(
    readme,
    /Runtime and Security Profile/i,
  );
  assert.match(roadmap, /Runtime and Security Profile `0\.1\.0`/);
  assert.match(
    roadmap,
    /implemented, full local-gate verified, and independently reviewed/,
  );
  assert.match(roadmap, /delivered|verified/i);
  assert.match(
    roadmap,
    /current package `0\.9\.0` preserves both historical artifacts/,
  );
  assert.doesNotMatch(
    roadmap,
    /current private, unpublished package `0\.6\.0`/,
  );

  ["secure", "production-ready", "certified"].forEach((claim) =>
    assertNoPositiveClaimWithoutNearbyNegation(readme, claim)
  );

  for (const document of publicRuntimeSecurityDocuments) {
    assertMarkdownLinksResolve(document.content, document.url);
  }

  [
    /scheduler/i,
    /connector registry/i,
    /network connectors/i,
    /credential policy/i,
    /automatic promotion/i,
    /durable publication outbox/i,
    /npm publication/i,
    /production certification/i,
    /real-ledger acceptance/i,
    /final verification/i,
  ].forEach((deferral) => assert.match(roadmap, deferral));

  for (const document of [
    readme,
    authorGuide,
    connectorRfc,
    compatibilityPolicy,
  ]) {
    assert.match(document, /private and unpublished|private, unpublished/i);
    assert.match(
      document,
      /not\s+certification|does not\s+certify|no\s+certification|not a\s+certification/i,
    );
    assert.match(
      document,
      /not\s+endorsement|does not\s+imply\s+endorsement|no\s+endorsement/i,
    );
    assert.match(
      document,
      /not\s+(?:an\s+)?LTS|no\s+LTS|does not\s+promise[\s\S]*long-term support/i,
    );
  }
});

test("public documentation defines the durable workflow without upgrading readiness claims", () => {
  const packageJson = JSON.parse(readFileSync(packageJsonUrl, "utf8"));
  const readme = readFileSync(readmeUrl, "utf8");
  const roadmap = readFileSync(roadmapUrl, "utf8");
  const publicApi = readFileSync(new URL("../docs/public-api.md", import.meta.url), "utf8");
  const guide = readFileSync(durableWorkflowGuideUrl, "utf8");
  const rfc = readFileSync(durableWorkflowRfcUrl, "utf8");
  const specificationIndex = readFileSync(specificationIndexUrl, "utf8");
  const documents = [readme, roadmap, publicApi, guide, rfc];
  const combined = documents.join("\n");

  assert.equal(packageJson.version, "0.9.0");
  assert.equal(packageJson.private, true);
  assert.match(readme, /connector or canonical JSONL[\s\S]*explicit durable workflow request[\s\S]*atomic cognition database[\s\S]*optional event publisher[\s\S]*optional managed Markdown projection/);
  for (const document of documents) {
    assert.match(document, /0\.9\.0/);
  }
  assert.match(combined, /private(?:,| and)? unpublished|private package `0\.9\.0` is unpublished/i);
  assert.match(combined, /production (?:use|readiness|certification)[^\n]*(?:not claimed|no|does not|not authorize)|no production certification/i);
  for (const phrase of [
    "new explicit database",
    "CLI has no publisher",
    "Markdown is non-authoritative",
    "no scheduler",
    "automatic cognition",
    "Obsidian discovery",
    "authentication",
    "encryption",
    "durable outbox",
    "production certification",
  ]) {
    assert.equal(
      documents.some((document) => document.toLowerCase().includes(phrase.toLowerCase())),
      true,
      phrase,
    );
  }
  assert.match(
    roadmap,
    /Phase 4[\s\S]*\*\*Status:\*\* Complete\. All Phase 4 design acceptance gates pass\./,
  );
  assert.match(
    readFileSync(join(repositoryRoot, "README.md"), "utf8"),
    /completed adapter ecosystem foundations with Durable Cognition Workflow `0\.1\.0` final-review verified/,
  );
  assert.match(roadmap, /\[x\] A source-neutral durable workflow/);
  assert.match(roadmap, /\[x\] Task 8 final independent specification and code review\./);
  assert.doesNotMatch(roadmap, /does not perform Task 8 final independent review/);
  assert.match(roadmap, /Phase 5 remains pending the two-connector criteria/);
  assert.match(roadmap, /at least two independently useful connectors/);
  assert.match(roadmap, /real cross-connector exchange workflow must have a named owner/);
  assert.match(publicApi, /\.\/workflows\/durable\/0\.1\.0/);
  assert.match(publicApi, /\.\/stores\/sqlite-workflow\/0\.1\.0/);
  assert.match(publicApi, /collective-cognition-workflow/);
  for (const document of [readme, publicApi, guide, rfc]) {
    assert.match(document, /Node(?:\.js)? `?>=24\.14\.0`?/i);
    assert.match(document, /DatabaseSync\.prototype\.enableDefensive/);
    assert.match(
      document,
      /Node(?:\.js)? `?24\.9(?:\.0)?`?[\s\S]{0,240}(?:package|core)[\s\S]{0,120}compatibility[\s\S]{0,240}(?:not a full workflow runtime|not the full workflow runtime)/i,
    );
  }
  assert.match(publicApi, /tarball[^\n]*no[^\n]*sqlite-internal|no[^\n]*sqlite-internal[^\n]*tarball/i);
  assert.match(rfc, /package contains no\s+`sqlite-internal` JavaScript or declaration file/i);
  assert.match(rfc, /SQLite workflow store[^\n]*self-contained|self-contained[^\n]*SQLite workflow store/i);
  assert.match(
    specificationIndex,
    /SQLite stores are self-contained[^\n]*no shared `sqlite-internal` source, JavaScript, or declaration module is built or packaged/i,
  );
  assert.doesNotMatch(specificationIndex, /SQLite internal module remain/i);
  const rfcIndex = readFileSync(rfcIndexUrl, "utf8");
  assert.doesNotMatch(rfcIndex, /current package[^\n]*0\.8\.0/i);
  assert.doesNotMatch(roadmap, /current private, unpublished package `0\.8\.0`/i);
  assertMarkdownLinksResolve(guide, durableWorkflowGuideUrl);
  assertMarkdownLinksResolve(rfc, durableWorkflowRfcUrl);
});

test("development dependency security floors remain pinned", () => {
  const packageJson = JSON.parse(readFileSync(packageJsonUrl, "utf8"));
  const packageLock = JSON.parse(readFileSync(packageLockUrl, "utf8"));

  assert.equal(packageJson.devDependencies["@types/node"], "^26.2.0");
  assert.equal(
    packageLock.packages[""].devDependencies["@types/node"],
    "^26.2.0",
  );
  assert.equal(packageLock.packages["node_modules/@types/node"].version, "26.2.0");
  assert.equal(packageLock.packages["node_modules/fast-uri"].version, "3.1.5");
});

test("npm package manifest and tarball expose only approved artifacts", () => {
  assert.equal(existsSync(gitAttributesUrl), true, ".gitattributes must exist");
  const packageJson = JSON.parse(readFileSync(packageJsonUrl, "utf8"));
  const packageLock = JSON.parse(readFileSync(packageLockUrl, "utf8"));
  const baseline = JSON.parse(
    readFileSync(compatibilityBaselineUrl, "utf8"),
  );
  const historicalBaseline = JSON.parse(
    readFileSync(historicalCompatibilityBaselineUrl, "utf8"),
  );
  const previousBaseline = JSON.parse(
    readFileSync(previousCompatibilityBaselineUrl, "utf8"),
  );
  assert.deepEqual(
    baseline.package.runtimeExports,
    previousBaseline.package.runtimeExports,
    "package 0.9 root runtime exports must remain identical to 0.8",
  );
  assert.deepEqual(
    baseline.package.typeExports,
    previousBaseline.package.typeExports,
    "package 0.9 root type exports must remain identical to 0.8",
  );
  assert.equal(packageJson.version, "0.9.0");
  assert.equal(packageLock.version, "0.9.0");
  assert.equal(packageLock.packages[""].version, "0.9.0");
  assert.equal(
    packageJson.exports["./distribution-readiness/0.1.0"],
    "./spec/distribution-readiness/0.1.0/profile.json",
  );
  assert.deepEqual(packageJson.engines, {
    node: ">=24",
  });
  assert.deepEqual(packageLock.packages[""].engines, {
    node: ">=24",
  });
  assert.deepEqual(
    productionDependencyFields,
    [
      "dependencies",
      "optionalDependencies",
      "peerDependencies",
      "bundleDependencies",
      "bundledDependencies",
    ],
  );
  assert.deepEqual(declaredProductionDependencyFields(packageJson), []);
  assert.deepEqual(
    declaredProductionDependencyFields(packageLock.packages[""]),
    [],
  );
  ["preinstall", "install", "postinstall"].forEach((hook) => {
    assert.equal(Object.hasOwn(packageJson.scripts, hook), false, hook);
  });
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
    "./compatibility/0.5.0":
      "./spec/compatibility/0.5.0/baseline.json",
    "./compatibility/0.6.0":
      "./spec/compatibility/0.6.0/baseline.json",
    "./compatibility/0.7.0":
      "./spec/compatibility/0.7.0/baseline.json",
    "./compatibility/0.8.0":
      "./spec/compatibility/0.8.0/baseline.json",
    "./compatibility/0.9.0":
      "./spec/compatibility/0.9.0/baseline.json",
    "./adapters/markdown/0.1.0": {
      types: "./dist/markdown-cognition.d.ts",
      import: "./dist/markdown-cognition.js",
    },
    "./workflows/durable/0.1.0": {
      types: "./dist/workflows/durable.d.ts",
      import: "./dist/workflows/durable.js",
    },
    "./connector-conformance/0.1.0": {
      types: "./dist/connector-conformance.d.ts",
      import: "./dist/connector-conformance.js",
    },
    "./connectors/team-memory/0.1.0": {
      types: "./dist/connectors/team-memory.d.ts",
      import: "./dist/connectors/team-memory.js",
    },
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
    "./stores/sqlite-workflow/0.1.0": {
      types: "./dist/stores/sqlite-workflow.d.ts",
      import: "./dist/stores/sqlite-workflow.js",
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
    "./distribution-readiness/0.1.0":
      "./spec/distribution-readiness/0.1.0/profile.json",
    "./runtime-security/0.1.0":
      "./spec/runtime-security/0.1.0/profile.json",
    "./package.json": "./package.json",
  });
  assert.deepEqual(packageJson.files, [
    "CITATION.cff",
    "dist/",
    "LICENSE",
    "NOTICE",
    "README.md",
    "docs/connector-author-guide.md",
    "docs/durable-cognition-workflow-guide.md",
    "docs/markdown-cognition-adapter-guide.md",
    "docs/public-api.md",
    "rfcs/README.md",
    "rfcs/0001-universal-source-record-ingestion.md",
    "rfcs/0002-compatibility-versioning-and-deprecation.md",
    "rfcs/0003-portable-cognition-contract.md",
    "rfcs/0004-host-integration-contract.md",
    "rfcs/0005-sqlite-cognition-store.md",
    "rfcs/0006-maintained-source-connectors.md",
    "rfcs/0007-markdown-cognition-adapter.md",
    "rfcs/0008-runtime-security-profile.md",
    "rfcs/0009-public-api-and-distribution-readiness.md",
    "rfcs/0010-durable-cognition-workflow.md",
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
    "spec/compatibility/0.5.0/baseline.json",
    "spec/compatibility/0.5.0/change-cases.jsonl",
    "spec/compatibility/0.6.0/baseline.json",
    "spec/compatibility/0.6.0/change-cases.jsonl",
    "spec/compatibility/0.7.0/baseline.json",
    "spec/compatibility/0.7.0/change-cases.jsonl",
    "spec/compatibility/0.8.0/baseline.json",
    "spec/compatibility/0.8.0/change-cases.jsonl",
    "spec/compatibility/0.9.0/baseline.json",
    "spec/compatibility/0.9.0/change-cases.jsonl",
    "spec/distribution-readiness.md",
    "spec/distribution-readiness/0.1.0/profile.json",
    "spec/host-integration.md",
    "spec/source-record.md",
    "spec/portable-cognition.md",
    "spec/runtime-security.md",
    "spec/runtime-security/0.1.0/profile.json",
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
    "collective-cognition-teammem": "./dist/team-memory-cli.js",
    "collective-cognition-markdown": "./dist/markdown-cognition-cli.js",
    "collective-cognition-workflow": "./dist/workflow-cli.js",
  });
  assert.deepEqual(baseline.package.executableModes, {
    "dist/cli.js": 0o755,
    "dist/markdown-cognition-cli.js": 0o755,
    "dist/team-memory-cli.js": 0o755,
    "dist/workflow-cli.js": 0o755,
  });
  const actualEmittedFiles = emittedFiles(distRoot)
    .map((path) => relative(repositoryRoot, path).replaceAll("\\", "/"))
    .sort();
  assert.deepEqual(
    historicalBaseline.package.emittedFiles,
    expectedEmittedFiles050,
    "package 0.5 emitted inventory must match its literal immutable allowlist",
  );
  assert.deepEqual(
    baseline.package.emittedFiles,
    expectedEmittedFiles090,
    "package 0.9 emitted inventory must match its literal allowlist",
  );
  assert.deepEqual(
    baseline.package.emittedFiles.filter(
      (path) => !expectedEmittedFiles040.includes(path),
    ),
    [
      ...expectedConnectorEmittedFiles050,
      ...expectedMarkdownEmittedFiles060,
      ...expectedDurableWorkflowEmittedFiles090,
    ].sort(),
    "package 0.9 emitted additions must be exactly the approved files",
  );
  assert.deepEqual(
    actualEmittedFiles,
    expectedEmittedFiles090,
    "dist/ contents must match the independent package 0.9 allowlist",
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
  const expectedBaselinePaths = [
    "CITATION.cff",
    "LICENSE",
    "NOTICE",
    "README.md",
    ...expectedEmittedFiles090,
    "package.json",
    "rfcs/0001-universal-source-record-ingestion.md",
    "rfcs/0002-compatibility-versioning-and-deprecation.md",
    "rfcs/0003-portable-cognition-contract.md",
    "rfcs/0004-host-integration-contract.md",
    "rfcs/0005-sqlite-cognition-store.md",
    "rfcs/0006-maintained-source-connectors.md",
    "rfcs/0007-markdown-cognition-adapter.md",
    "rfcs/0008-runtime-security-profile.md",
    "rfcs/0009-public-api-and-distribution-readiness.md",
    "rfcs/0010-durable-cognition-workflow.md",
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
    "spec/compatibility/0.5.0/baseline.json",
    "spec/compatibility/0.5.0/change-cases.jsonl",
    "spec/compatibility/0.6.0/baseline.json",
    "spec/compatibility/0.6.0/change-cases.jsonl",
    "spec/compatibility/0.7.0/baseline.json",
    "spec/compatibility/0.7.0/change-cases.jsonl",
    "spec/compatibility/0.8.0/baseline.json",
    "spec/compatibility/0.8.0/change-cases.jsonl",
    "spec/compatibility/0.9.0/baseline.json",
    "spec/compatibility/0.9.0/change-cases.jsonl",
    "spec/conformance/0.1.0/portable-cognition/cognitive-loop.jsonl",
    "spec/conformance/0.1.0/portable-cognition/invalid.jsonl",
    "spec/conformance/0.1.0/portable-cognition/valid.jsonl",
    "spec/conformance/0.1.0/source-record/invalid.jsonl",
    "spec/conformance/0.1.0/source-record/valid.jsonl",
    "spec/distribution-readiness.md",
    "spec/distribution-readiness/0.1.0/profile.json",
    "spec/host-integration.md",
    "spec/portable-cognition.md",
    "spec/runtime-security.md",
    "spec/runtime-security/0.1.0/profile.json",
    "spec/schemas/0.1.0/portable-cognition.schema.json",
    "spec/schemas/0.1.0/source-record.schema.json",
    "spec/source-record.md",
  ].sort();
  const expectedPaths = [
    ...expectedBaselinePaths,
    "docs/connector-author-guide.md",
    "docs/durable-cognition-workflow-guide.md",
    "docs/markdown-cognition-adapter-guide.md",
    "docs/public-api.md",
  ].sort();

  assert.deepEqual(
    baseline.package.packageFiles,
    expectedPaths,
    "package 0.9 compatibility inventory must match its literal allowlist",
  );
  assert.deepEqual(paths, expectedPaths, "package contents must match allowlist");
  assert.equal(
    paths.includes(".gitattributes"),
    false,
    ".gitattributes must remain outside the npm tarball",
  );
  assert.ok(
    paths.every(
      (path) =>
        !/^(?:src|tests|examples)\//.test(path) &&
        (
          !/^docs\//.test(path) ||
          path === "docs/connector-author-guide.md" ||
          path === "docs/durable-cognition-workflow-guide.md" ||
          path === "docs/markdown-cognition-adapter-guide.md" ||
          path === "docs/public-api.md"
        ) &&
        !/(?:^|\/)adapters?\//i.test(path) &&
        !/(?:git-commit|team-memory-activity|teammem-cli)/i.test(path),
    ),
    "package must exclude sources, tests, designs, adapters, and internal connectors",
  );
  assert.ok(
    paths.every(
      (path) =>
        !/\.db(?:-journal|-wal|-shm)?$/i.test(path) &&
        !/(?:^|\/)\.env(?:\.|$)/i.test(path) &&
        !/\.(?:log|pem|key)$/i.test(path) &&
        !/(?:credential|secret)/i.test(path),
    ),
    "package must exclude databases, logs, environments, and credentials",
  );
  if (process.platform !== "win32") {
    for (const [path, expectedMode] of Object.entries(
      baseline.package.executableModes,
    )) {
      const packedCli = packResults[0].files.find((file) => file.path === path);
      assert.ok(packedCli, `packed CLI is missing: ${path}`);
      assert.equal(packedCli.mode, expectedMode, `${path} must be exactly 0755`);
    }
  }
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
  const consumerRoot = realpathSync.native(
    mkdtempSync(join(temporaryRoot, "consumer-")),
  );
  mkdirSync(packageOutput);
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
        types: ["node"],
        typeRoots: [join(repositoryRoot, "node_modules", "@types")],
      },
      include: ["index.ts", "guide-snippet.ts"],
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
import {
  DURABLE_COGNITION_WORKFLOW_VERSION,
  prepareDurableCognitionWorkflow,
  runDurableCognitionWorkflow,
  runDurableWorkflowStoreConformance,
  type CognitionWorkflowStore,
  type DurableCognitionCommitResult,
  type DurableCognitionProjectionStatus,
  type DurableCognitionProjector,
  type DurableCognitionPublicationStatus,
  type DurableCognitionWorkflowCommitted,
  type DurableCognitionWorkflowCompletion,
  type DurableCognitionWorkflowConflict,
  type DurableCognitionWorkflowFailure,
  type DurableCognitionWorkflowHost,
  type DurableCognitionWorkflowRequest,
  type DurableCognitionWorkflowResult,
  type DurableCognitionWorkflowUnprojected,
  type DurableCognitionWorkflowUnpublished,
  type DurableCognitionWorkflowUnpublishedAndUnprojected,
  type DurableWorkflowConflictCode,
  type DurableWorkflowConformanceCaseResult,
  type DurableWorkflowConformanceReport,
  type DurableWorkflowStoreConformanceScenario,
  type DurableWorkflowStoreFactory,
  type PreparedDurableCognitionCommit,
} from ${JSON.stringify(`${packageJson.name}/workflows/durable/0.1.0`)};
import {
  SqliteCognitionWorkflowStore,
  type SqliteCognitionWorkflowStoreOptions,
} from ${JSON.stringify(`${packageJson.name}/stores/sqlite-workflow/0.1.0`)};
import {
  runSourceConnectorConformance,
  type SourceConnectorConformanceCase,
  type SourceConnectorConformanceDiagnostic,
  type SourceConnectorConformanceDiagnosticCode,
  type SourceConnectorConformanceResult,
} from ${JSON.stringify(`${packageJson.name}/connector-conformance/0.1.0`)};
import {
  TEAM_MEMORY_LEDGER_FORMAT,
  TeamMemoryConnectorError,
  readTeamMemorySourceRecords,
  type TeamMemoryConnectorErrorCode,
  type TeamMemorySourceRecordOptions,
} from ${JSON.stringify(`${packageJson.name}/connectors/team-memory/0.1.0`)};
import {
  MARKDOWN_COGNITION_MANIFEST_FILE,
  MARKDOWN_COGNITION_MARKER_FILE,
  MARKDOWN_COGNITION_MAX_INPUT_BYTES,
  MARKDOWN_COGNITION_MAX_MANIFEST_ENTRIES,
  MARKDOWN_COGNITION_MAX_NOTE_BYTES,
  MARKDOWN_COGNITION_MAX_OBJECT_VERSION,
  MARKDOWN_COGNITION_MAX_PATH_SEGMENTS,
  MARKDOWN_COGNITION_MAX_RECORDS,
  MARKDOWN_COGNITION_MAX_RELATIVE_PATH_BYTES,
  MARKDOWN_COGNITION_MAX_TOTAL_BYTES,
  MARKDOWN_COGNITION_PROFILE_VERSION,
  MARKDOWN_COGNITION_TARGET_FORMAT,
  MarkdownCognitionError,
  initializeMarkdownCognitionTarget,
  markdownCognitionRelativePath,
  parseMarkdownCognitionRecord,
  projectMarkdownCognition,
  renderMarkdownCognitionIndex,
  renderMarkdownCognitionRecord,
  verifyMarkdownCognitionTarget,
  type MarkdownCognitionErrorCode,
  type MarkdownCognitionProjectionOptions,
  type MarkdownCognitionProjectionReport,
  type MarkdownCognitionRecord,
  type MarkdownCognitionRenderContext,
  type MarkdownCognitionTargetOptions,
  type MarkdownCognitionVerificationDiagnostic,
  type MarkdownCognitionVerificationReport,
} from ${JSON.stringify(`${packageJson.name}/adapters/markdown/0.1.0`)};

function roundTrip(record: PortableCognitionRecord) {
  return deserializePortableCognitionRecord(
    serializePortableCognitionRecord(
      createPortableCognitionRecord(record),
    ),
  );
}

declare const packageWideCode: DomainErrorCodeType;
const exhaustivePackage080Codes: Record<DomainErrorCodeType, true> = {
  AUTHORIZATION_DENIED: true,
  CONFIRMATION_REQUIRED: true,
  INGESTION_LIMIT_EXCEEDED: true,
  INVALID_HOST_INTEGRATION_REQUEST: true,
  INVALID_OBJECT: true,
  INVALID_PORTABLE_COGNITION_RECORD: true,
  INVALID_RELATIONSHIP: true,
  INVALID_SOURCE_RECORD: true,
  INVALID_TRANSITION: true,
  PROMOTION_FAILED: true,
  SERIALIZATION_ERROR: true,
  SOURCE_REVISION_COLLISION: true,
};
void exhaustivePackage080Codes;
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
type ConnectorTypes =
  | SourceConnectorConformanceCase
  | SourceConnectorConformanceDiagnostic
  | SourceConnectorConformanceDiagnosticCode
  | SourceConnectorConformanceResult
  | TeamMemoryConnectorError
  | TeamMemoryConnectorErrorCode
  | TeamMemorySourceRecordOptions;
type MarkdownTypes =
  | MarkdownCognitionErrorCode
  | MarkdownCognitionProjectionOptions
  | MarkdownCognitionProjectionReport
  | MarkdownCognitionRecord
  | MarkdownCognitionRenderContext
  | MarkdownCognitionTargetOptions
  | MarkdownCognitionVerificationDiagnostic
  | MarkdownCognitionVerificationReport;
type DurableWorkflowTypes =
  | CognitionWorkflowStore
  | DurableCognitionCommitResult
  | DurableCognitionProjectionStatus
  | DurableCognitionProjector
  | DurableCognitionPublicationStatus
  | DurableCognitionWorkflowCommitted
  | DurableCognitionWorkflowCompletion
  | DurableCognitionWorkflowConflict
  | DurableCognitionWorkflowFailure
  | DurableCognitionWorkflowHost
  | DurableCognitionWorkflowRequest
  | DurableCognitionWorkflowResult
  | DurableCognitionWorkflowUnprojected
  | DurableCognitionWorkflowUnpublished
  | DurableCognitionWorkflowUnpublishedAndUnprojected
  | DurableWorkflowConflictCode
  | DurableWorkflowConformanceCaseResult
  | DurableWorkflowConformanceReport
  | DurableWorkflowStoreConformanceScenario
  | DurableWorkflowStoreFactory
  | PreparedDurableCognitionCommit
  | SqliteCognitionWorkflowStoreOptions;

void roundTrip;
void package020GenericAssignment;
void oldGenericAssignment;
void (undefined as unknown as HostTypes);
void (undefined as unknown as ConnectorTypes);
void (undefined as unknown as MarkdownTypes);
void (undefined as unknown as DurableWorkflowTypes);
void HOST_INTEGRATION_CONTRACT_VERSION;
void HostFailureCode;
void commitCognitionTransition;
void commitInitialCognition;
void InMemoryCognitionEventPublisher;
void InMemoryCognitionStore;
void runCognitionHostConformance;
void SqliteCognitionStore;
void DURABLE_COGNITION_WORKFLOW_VERSION;
void prepareDurableCognitionWorkflow;
void runDurableCognitionWorkflow;
void runDurableWorkflowStoreConformance;
void SqliteCognitionWorkflowStore;
void runSourceConnectorConformance;
void TEAM_MEMORY_LEDGER_FORMAT;
void TeamMemoryConnectorError;
void readTeamMemorySourceRecords;
void MARKDOWN_COGNITION_MANIFEST_FILE;
void MARKDOWN_COGNITION_MARKER_FILE;
void MARKDOWN_COGNITION_MAX_INPUT_BYTES;
void MARKDOWN_COGNITION_MAX_MANIFEST_ENTRIES;
void MARKDOWN_COGNITION_MAX_NOTE_BYTES;
void MARKDOWN_COGNITION_MAX_OBJECT_VERSION;
void MARKDOWN_COGNITION_MAX_PATH_SEGMENTS;
void MARKDOWN_COGNITION_MAX_RECORDS;
void MARKDOWN_COGNITION_MAX_RELATIVE_PATH_BYTES;
void MARKDOWN_COGNITION_MAX_TOTAL_BYTES;
void MARKDOWN_COGNITION_PROFILE_VERSION;
void MARKDOWN_COGNITION_TARGET_FORMAT;
void MarkdownCognitionError;
void initializeMarkdownCognitionTarget;
void markdownCognitionRelativePath;
void parseMarkdownCognitionRecord;
void projectMarkdownCognition;
void renderMarkdownCognitionIndex;
void renderMarkdownCognitionRecord;
void verifyMarkdownCognitionTarget;
`,
    "utf8",
  );
  const guide = readFileSync(durableWorkflowGuideUrl, "utf8");
  const guideSnippet = guide.match(
    /## SDK Usage[\s\S]*?```ts\n(?<snippet>[\s\S]*?)\n```/,
  )?.groups?.snippet;
  assert.equal(typeof guideSnippet, "string");
  writeFileSync(
    `${consumerRoot}/guide-snippet.ts`,
    `declare const records: never;
declare const hypothesis: never;
declare const promotion: never;
declare const reviewTransition: never;
declare const policy: never;
declare const databasePath: never;

${guideSnippet}
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
  DURABLE_COGNITION_WORKFLOW_VERSION,
  prepareDurableCognitionWorkflow,
  runDurableCognitionWorkflow,
  runDurableWorkflowStoreConformance,
} from ${JSON.stringify(`${packageJson.name}/workflows/durable/0.1.0`)};
import {
  SqliteCognitionWorkflowStore,
} from ${JSON.stringify(`${packageJson.name}/stores/sqlite-workflow/0.1.0`)};
import {
  runSourceConnectorConformance,
} from ${JSON.stringify(`${packageJson.name}/connector-conformance/0.1.0`)};
import {
  TEAM_MEMORY_LEDGER_FORMAT,
  TeamMemoryConnectorError,
  readTeamMemorySourceRecords,
} from ${JSON.stringify(`${packageJson.name}/connectors/team-memory/0.1.0`)};
import {
  MARKDOWN_COGNITION_MANIFEST_FILE,
  MARKDOWN_COGNITION_MARKER_FILE,
  MARKDOWN_COGNITION_MAX_INPUT_BYTES,
  MARKDOWN_COGNITION_MAX_MANIFEST_ENTRIES,
  MARKDOWN_COGNITION_MAX_NOTE_BYTES,
  MARKDOWN_COGNITION_MAX_OBJECT_VERSION,
  MARKDOWN_COGNITION_MAX_PATH_SEGMENTS,
  MARKDOWN_COGNITION_MAX_RECORDS,
  MARKDOWN_COGNITION_MAX_RELATIVE_PATH_BYTES,
  MARKDOWN_COGNITION_MAX_TOTAL_BYTES,
  MARKDOWN_COGNITION_PROFILE_VERSION,
  MARKDOWN_COGNITION_TARGET_FORMAT,
  MarkdownCognitionError,
  initializeMarkdownCognitionTarget,
  markdownCognitionRelativePath,
  parseMarkdownCognitionRecord,
  projectMarkdownCognition,
  renderMarkdownCognitionIndex,
  renderMarkdownCognitionRecord,
  verifyMarkdownCognitionTarget,
} from ${JSON.stringify(`${packageJson.name}/adapters/markdown/0.1.0`)};
import assert from "node:assert/strict";
import distributionReadinessProfile from ${JSON.stringify(`${packageJson.name}/distribution-readiness/0.1.0`)} with { type: "json" };
import profile from ${JSON.stringify(`${packageJson.name}/runtime-security/0.1.0`)} with { type: "json" };
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

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

assert.equal(profile.profile, "collective-cognition-runtime-security");
assert.equal(profile.version, "0.1.0");
assert.equal(distributionReadinessProfile.profileVersion, "0.1.0");
assert.equal(distributionReadinessProfile.describesPackageVersion, "0.8.0");

const record = createPortableCognitionRecord(validRecords[0]);
const restored = deserializePortableCognitionRecord(
  serializePortableCognitionRecord(record),
);
const markdownRoot = realpathSync(mkdtempSync(join(tmpdir(), "ccsdk-markdown-consumer-")));
const markdownTargetDirectory = join(markdownRoot, "Collective Cognition");
try {
  if (MARKDOWN_COGNITION_MAX_OBJECT_VERSION !== 99_999_999) {
    throw new Error("Markdown cognition object version limit is incompatible.");
  }
  await initializeMarkdownCognitionTarget({ targetDirectory: markdownTargetDirectory });
  const markdownReport = await projectMarkdownCognition({
    targetDirectory: markdownTargetDirectory,
    records: [record],
  });
  const markdownVerification = await verifyMarkdownCognitionTarget({
    targetDirectory: markdownTargetDirectory,
  });
  if (
    markdownReport.created.length !== 2 ||
    markdownVerification.status !== "passed" ||
    !existsSync(join(markdownTargetDirectory, MARKDOWN_COGNITION_MARKER_FILE)) ||
    !existsSync(join(markdownTargetDirectory, MARKDOWN_COGNITION_MANIFEST_FILE))
  ) {
    throw new Error("Markdown cognition adapter did not project a managed target.");
  }
} finally {
  rmSync(markdownRoot, { recursive: true, force: true });
}
const sqliteRoot = mkdtempSync(join(tmpdir(), "ccsdk-sqlite-consumer-"));
const databasePath = join(sqliteRoot, "cognition.db");
const teamMemoryDatabasePath = join(process.cwd(), "fictional-ledger.db");
let reopened = false;
let rejectedWithoutMutation = false;
let unsupportedStore;
try {
  if (typeof DatabaseSync.prototype.enableDefensive === "function") {
    const createdStore = new SqliteCognitionStore({
      databasePath,
      createIfMissing: true,
    });
    createdStore.close();
    const reopenedStore = new SqliteCognitionStore({ databasePath });
    reopenedStore.close();
    reopened = true;
  } else {
    try {
      unsupportedStore = new SqliteCognitionStore({
        databasePath,
        createIfMissing: true,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        /node:sqlite with enforced defensive mode/.test(error.message)
      ) {
        rejectedWithoutMutation = !existsSync(databasePath);
      } else {
        throw error;
      }
    }
  }
} finally {
  unsupportedStore?.close();
  rmSync(sqliteRoot, { recursive: true, force: true });
}
const teamMemoryDatabase = new DatabaseSync(teamMemoryDatabasePath);
try {
  teamMemoryDatabase.exec(\`
    CREATE TABLE events (
      id INTEGER PRIMARY KEY,
      person TEXT NOT NULL,
      project TEXT,
      ts TEXT NOT NULL,
      source TEXT NOT NULL,
      kind TEXT NOT NULL,
      summary TEXT NOT NULL,
      refs TEXT,
      raw TEXT,
      hash TEXT NOT NULL,
      UNIQUE(person, source, hash)
    );
  \`);
  teamMemoryDatabase.prepare(\`
    INSERT INTO events (
      person, project, ts, source, kind, summary, refs, raw, hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  \`).run(
    "fictional-analyst",
    "fictional-project",
    "2026-01-02T03:04:05Z",
    "fictional-journal",
    "note",
    "Fictional compatibility record.",
    JSON.stringify({ ticket: "FICTION-1" }),
    "Fictional private detail.",
    "fictional-revision-1",
  );
} finally {
  teamMemoryDatabase.close();
}
const teamMemoryOptions = {
  databasePath: teamMemoryDatabasePath,
  sourceInstance: "fictional-compatible-ledger",
};
const teamMemoryRecords = readTeamMemorySourceRecords(teamMemoryOptions);
const connectorConformance = await runSourceConnectorConformance([{
  name: "fictional compatible ledger",
  collect: () => readTeamMemorySourceRecords(teamMemoryOptions),
  collectAgain: () => readTeamMemorySourceRecords(teamMemoryOptions),
}]);
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
    typeof runSourceConnectorConformance,
    typeof TeamMemoryConnectorError,
    typeof readTeamMemorySourceRecords,
    typeof prepareDurableCognitionWorkflow,
    typeof runDurableCognitionWorkflow,
    typeof runDurableWorkflowStoreConformance,
    typeof SqliteCognitionWorkflowStore,
  ],
  durableWorkflowVersion: DURABLE_COGNITION_WORKFLOW_VERSION,
  sqliteReopened: reopened,
  sqliteRejectedWithoutMutation: rejectedWithoutMutation,
  connectorLedgerFormat: TEAM_MEMORY_LEDGER_FORMAT,
  connectorRecordCount: teamMemoryRecords.length,
  connectorConformanceStatus: connectorConformance[0]?.status,
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
if (descriptor !== undefined) {
  assert.equal(typeof descriptor.value, "function");
  Object.defineProperty(prototype, "enableDefensive", {
    ...descriptor,
    value: undefined,
  });
}

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
  if (descriptor !== undefined) {
    Object.defineProperty(prototype, "enableDefensive", descriptor);
  }
  rmSync(sqliteRoot, { recursive: true, force: true });
}
`,
    "utf8",
  );

  const environment = {
    ...process.env,
    npm_config_cache: npmCache,
    npm_config_dry_run: "false",
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
    const packedManifest = JSON.parse(
      readFileSync(
        join(
          consumerRoot,
          "node_modules",
          packageJson.name,
          "package.json",
        ),
        "utf8",
      ),
    );
    assert.deepEqual(
      declaredProductionDependencyFields(packedManifest),
      [],
    );
    ["preinstall", "install", "postinstall"].forEach((hook) => {
      assert.equal(Object.hasOwn(packedManifest.scripts, hook), false, hook);
    });

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
    const consumedOutput = JSON.parse(consumed.stdout.trim());
    const {
      sqliteReopened,
      sqliteRejectedWithoutMutation,
      ...stableConsumedOutput
    } = consumedOutput;
    assert.deepEqual(stableConsumedOutput, {
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
        "function",
        "function",
        "function",
        "function",
        "function",
        "function",
        "function",
      ],
      durableWorkflowVersion: "0.1.0",
      connectorLedgerFormat: "teammem-event-ledger/1",
      connectorRecordCount: 1,
      connectorConformanceStatus: "passed",
    });
    assert.equal(
      sqliteReopened || sqliteRejectedWithoutMutation,
      true,
      "SQLite consumer must either reopen defensively or reject before mutation",
    );
    assert.notEqual(sqliteReopened, sqliteRejectedWithoutMutation);

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
const baselineUrl = import.meta.resolve(${JSON.stringify(`${packageJson.name}/compatibility/0.9.0`)});
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
        baselineVersion: "0.9.0",
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
    const assertInstalledMode = (path, name) => {
      if (process.platform === "win32") {
        return;
      }
      const target = realpathSync(path);
      assert.equal(
        statSync(target).mode & 0o777,
        0o755,
        `installed ${name} target must be exactly 0755`,
      );
    };
    assertInstalledMode(executable, "collective-cognition");
    const teamMemoryExecutableName =
      process.platform === "win32"
        ? "collective-cognition-teammem.cmd"
        : "collective-cognition-teammem";
    const teamMemoryExecutable =
      `${consumerRoot}/node_modules/.bin/${teamMemoryExecutableName}`;
    assert.equal(
      existsSync(teamMemoryExecutable),
      true,
      "installed collective-cognition-teammem executable is missing",
    );
    assertInstalledMode(teamMemoryExecutable, "collective-cognition-teammem");
    const teamMemoryExecuted = spawnSync(
      teamMemoryExecutable,
      [
        "export",
        "--db",
        `${consumerRoot}/fictional-ledger.db`,
        "--source-instance",
        "fictional-compatible-ledger",
      ],
      {
        cwd: consumerRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          NODE_NO_WARNINGS: "1",
        },
        shell: process.platform === "win32",
      },
    );
    assert.equal(
      teamMemoryExecuted.status,
      0,
      teamMemoryExecuted.stderr || teamMemoryExecuted.stdout,
    );
    assert.equal(teamMemoryExecuted.stderr, "");
    const validatedTeamMemoryOutput = spawnSync(
      executable,
      ["validate", "--input", "-", "--format", "jsonl"],
      {
        cwd: consumerRoot,
        encoding: "utf8",
        input: teamMemoryExecuted.stdout,
        shell: process.platform === "win32",
      },
    );
    assert.equal(
      validatedTeamMemoryOutput.status,
      0,
      validatedTeamMemoryOutput.stderr || validatedTeamMemoryOutput.stdout,
    );
    assert.equal(validatedTeamMemoryOutput.stderr, "");
    assert.equal(
      JSON.parse(validatedTeamMemoryOutput.stdout.trim()).status,
      "accepted",
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

    const markdownExecutableName =
      process.platform === "win32"
        ? "collective-cognition-markdown.cmd"
        : "collective-cognition-markdown";
    const markdownExecutable = join(
      consumerRoot,
      "node_modules",
      ".bin",
      markdownExecutableName,
    );
    const markdownTarget = join(consumerRoot, "markdown-cognition");
    const markdownInput = join(consumerRoot, "markdown-input.jsonl");
    writeFileSync(
      markdownInput,
      `${readFileSync(portableCognitionValidFixturesUrl, "utf8").split("\n")[0]}\n`,
      "utf8",
    );
    assert.equal(existsSync(markdownExecutable), true);
    assertInstalledMode(markdownExecutable, "collective-cognition-markdown");
    const markdownHelp = spawnSync(markdownExecutable, ["--help"], {
      cwd: consumerRoot,
      encoding: "utf8",
      shell: process.platform === "win32",
    });
    assert.equal(markdownHelp.status, 0, markdownHelp.stderr);
    const markdownInitialized = spawnSync(
      markdownExecutable,
      ["init", "--target", markdownTarget],
      { cwd: consumerRoot, encoding: "utf8", shell: process.platform === "win32" },
    );
    assert.equal(markdownInitialized.status, 0, markdownInitialized.stderr);
    const markdownProjected = spawnSync(
      markdownExecutable,
      ["project", "--input", markdownInput, "--target", markdownTarget],
      { cwd: consumerRoot, encoding: "utf8", shell: process.platform === "win32" },
    );
    assert.equal(markdownProjected.status, 0, markdownProjected.stderr);
    const markdownVerified = spawnSync(
      markdownExecutable,
      ["verify", "--target", markdownTarget],
      { cwd: consumerRoot, encoding: "utf8", shell: process.platform === "win32" },
    );
    assert.equal(markdownVerified.status, 0, markdownVerified.stderr);
    assert.equal(JSON.parse(markdownVerified.stdout.trim()).status, "passed");

    const workflowExecutableName =
      process.platform === "win32"
        ? "collective-cognition-workflow.cmd"
        : "collective-cognition-workflow";
    const workflowExecutable = join(
      consumerRoot,
      "node_modules",
      ".bin",
      workflowExecutableName,
    );
    assert.equal(existsSync(workflowExecutable), true);
    assertInstalledMode(workflowExecutable, "collective-cognition-workflow");
    const workflowRequestPath = join(consumerRoot, "workflow-request.json");
    const workflowInputPath = join(consumerRoot, "workflow-input.jsonl");
    const workflowDatabasePath = join(consumerRoot, "workflow-cognition.db");
    const workflowHypothesis = {
      id: "hypothesis:packed-workflow",
      type: "hypothesis",
      version: 1,
      state: "proposed",
      title: "Packed workflow hypothesis",
      data: { statement: "Packed records are ready for review." },
      createdAt: "2026-08-13T08:00:00.000Z",
      updatedAt: "2026-08-13T08:00:00.000Z",
      attribution: {
        initiatorId: "human:author",
        executorId: "human:author",
        accountableId: "human:owner",
      },
      provenance: [{
        source: "package-test",
        sourceId: "packed:hypothesis",
        capturedAt: "2026-08-13T08:00:00.000Z",
      }],
      contextId: "context:packed-workflow",
      relationships: [{
        type: "supports-goal",
        targetId: "goal:packed-workflow",
      }],
    };
    writeFileSync(workflowRequestPath, JSON.stringify({
      workflowVersion: "0.1.0",
      workflowId: "workflow:packed-workflow:1",
      hypothesis: workflowHypothesis,
      promotion: {
        hypothesisId: workflowHypothesis.id,
        contextId: workflowHypothesis.contextId,
        rationale: "The packed record is relevant to the explicit hypothesis.",
        promotedAt: "2026-08-13T09:00:00.000Z",
        attribution: {
          initiatorId: "human:reviewer",
          executorId: "human:reviewer",
          accountableId: "human:owner",
        },
      },
      reviewTransition: {
        eventId: "event:packed-workflow:1",
        occurredAt: "2026-08-13T10:00:00.000Z",
        initiator: { id: "human:reviewer", kind: "human" },
        executor: { id: "human:reviewer", kind: "human" },
        accountableParty: { id: "human:owner", kind: "human" },
        automationMode: "manual",
        consequenceLevel: "routine",
        rationale: "Review the hypothesis with the packed evidence.",
      },
      policyId: "neutral-evidence-v1",
    }));
    writeFileSync(workflowInputPath, `${JSON.stringify({
      schemaVersion: "0.1.0",
      id: "source-record:packed-workflow:1",
      source: { system: "package-test" },
      sourceId: "packed:1",
      revisionId: "1",
      capturedAt: "2026-08-13T09:00:00.000Z",
      mediaType: "application/json",
      content: { summary: "Packed workflow evidence." },
    })}\n`);
    if (typeof DatabaseSync.prototype.enableDefensive === "function") {
      const workflowExecuted = spawnSync(workflowExecutable, [
        "run",
        "--request",
        workflowRequestPath,
        "--input",
        workflowInputPath,
        "--format",
        "jsonl",
        "--cognition-db",
        workflowDatabasePath,
        "--create-cognition-db",
      ], {
        cwd: consumerRoot,
        encoding: "utf8",
        env: { ...process.env, NODE_NO_WARNINGS: "1" },
        shell: process.platform === "win32",
      });
      assert.equal(
        workflowExecuted.status,
        0,
        workflowExecuted.stderr || workflowExecuted.stdout,
      );
      assert.equal(workflowExecuted.stderr, "");
      assert.equal(JSON.parse(workflowExecuted.stdout).status, "committed");
    } else {
      assert.equal(existsSync(workflowDatabasePath), false);
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
