import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  isExportDeclaration,
  isImportDeclaration,
  isNamedExports,
  isStringLiteral,
} from "typescript/unstable/ast";
import { API } from "typescript/unstable/sync";

import * as publicApi from "../dist/index.js";
import { CLI_CONTRACT } from "../dist/cli-contract.js";

const repositoryRoot = new URL("../", import.meta.url);
const baselineUrl = new URL(
  "../spec/compatibility/0.1.0/baseline.json",
  import.meta.url,
);
const expectedBaselineSha256 =
  "ea499789bd822a2dcdaf9d2c440af8810d1b50ff6018aba6ea3fa13d25405644";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readJson(url) {
  return JSON.parse(readFileSync(url, "utf8"));
}

function readJsonLines(url) {
  return readFileSync(url, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function sorted(values) {
  return [...values].sort();
}

function ruleIds(path, prefix) {
  return sorted(
    new Set(
      readFileSync(new URL(path, repositoryRoot), "utf8")
        .match(new RegExp(`\\b${prefix}-\\d{3}\\b`, "g")) ?? [],
    ),
  );
}

function selectedPackageMetadata(packageJson) {
  return {
    name: packageJson.name,
    type: packageJson.type,
    main: packageJson.main,
    types: packageJson.types,
    license: packageJson.license,
    engines: packageJson.engines,
    exports: packageJson.exports,
    bin: packageJson.bin,
  };
}

function sourceTypeExports() {
  const sourceUrl = new URL("../src/index.ts", import.meta.url);
  const configPath = fileURLToPath(
    new URL("../tsconfig.json", import.meta.url),
  );
  const api = new API({ cwd: fileURLToPath(repositoryRoot) });
  const names = [];

  try {
    const snapshot = api.updateSnapshot({ openProjects: [configPath] });
    const project = snapshot.getProject(configPath);
    assert.ok(project, configPath);
    const sourceFile = project.program.getSourceFile(
      fileURLToPath(sourceUrl),
    );
    assert.ok(sourceFile, fileURLToPath(sourceUrl));

    sourceFile.statements.forEach((statement) => {
      if (
        isExportDeclaration(statement) &&
        statement.isTypeOnly &&
        statement.exportClause &&
        isNamedExports(statement.exportClause)
      ) {
        statement.exportClause.elements.forEach((element) => {
          names.push(element.name.text);
        });
      }
    });
    snapshot.dispose();
  } finally {
    api.close();
  }

  return sorted(names);
}

function declarationClosure() {
  const distUrl = new URL("../dist/", import.meta.url);
  const declarations = new Map(
    readdirSync(distUrl)
      .filter((name) => name.endsWith(".d.ts"))
      .map((name) => [`./${name.replace(/\.d\.ts$/, ".js")}`, name]),
  );
  const declarationPaths = [...declarations.values()].map((name) =>
    fileURLToPath(new URL(name, distUrl))
  );
  const api = new API({ cwd: fileURLToPath(repositoryRoot) });
  const snapshot = api.updateSnapshot({ openFiles: declarationPaths });
  const pending = ["index.d.ts"];
  const visited = new Set();

  try {
    while (pending.length > 0) {
      const name = pending.pop();
      if (visited.has(name)) {
        continue;
      }
      visited.add(name);

      const declarationUrl = new URL(name, distUrl);
      const declarationPath = fileURLToPath(declarationUrl);
      assert.ok(statSync(declarationUrl).isFile(), `${name} must be a file`);
      const project = snapshot.getDefaultProjectForFile(declarationPath);
      assert.ok(project, declarationPath);
      const sourceFile = project.program.getSourceFile(declarationPath);
      assert.ok(sourceFile, declarationPath);

      sourceFile.statements.forEach((statement) => {
        if (
          (isImportDeclaration(statement) ||
            isExportDeclaration(statement)) &&
          statement.moduleSpecifier &&
          isStringLiteral(statement.moduleSpecifier)
        ) {
          const target = declarations.get(statement.moduleSpecifier.text);
          if (target && !visited.has(target)) {
            pending.push(target);
          }
        }
      });
    }
    snapshot.dispose();
  } finally {
    api.close();
  }

  return sorted([...visited].map((name) => `dist/${name}`));
}

function declarationDigest(paths) {
  const hash = createHash("sha256");

  paths.forEach((path) => {
    const content = readFileSync(new URL(path, repositoryRoot), "utf8")
      .replace(/\r\n?/g, "\n");
    hash.update(path);
    hash.update("\0");
    hash.update(String(Buffer.byteLength(content, "utf8")));
    hash.update("\0");
    hash.update(content);
    hash.update("\0");
  });

  return hash.digest("hex");
}

test("compatibility baseline has the initial version", () => {
  const baseline = readJson(baselineUrl);

  assert.equal(baseline.baselineVersion, "0.1.0");
  assert.deepEqual(baseline.stabilityLevels, [
    "normative-stable",
    "supported-experimental",
    "internal",
  ]);
});

test("compatibility baseline is immutable", () => {
  assert.equal(
    sha256(readFileSync(baselineUrl)),
    expectedBaselineSha256,
  );
});

test("normative machine artifacts match exact digests", () => {
  const baseline = readJson(baselineUrl);
  const schema = readJson(
    new URL(
      baseline.normative.sourceRecord.schema.path,
      repositoryRoot,
    ),
  );

  assert.equal(schema.$id, baseline.normative.sourceRecord.schema.id);
  assert.deepEqual(
    Object.keys(baseline.normative.artifacts).sort(),
    [
      "spec/compatibility/0.1.0/change-cases.jsonl",
      "spec/conformance/0.1.0/source-record/invalid.jsonl",
      "spec/conformance/0.1.0/source-record/valid.jsonl",
      "spec/schemas/0.1.0/source-record.schema.json",
    ],
  );
  Object.entries(baseline.normative.artifacts).forEach(
    ([path, expectedDigest]) => {
      assert.equal(
        sha256(readFileSync(new URL(path, repositoryRoot))),
        expectedDigest,
        path,
      );
    },
  );
});

test("normative prose exposes every stable rule identifier", () => {
  const baseline = readJson(baselineUrl);

  assert.deepEqual(
    ruleIds("spec/source-record.md", "SR"),
    baseline.normative.sourceRecord.ruleIds,
  );
  assert.deepEqual(
    ruleIds("spec/compatibility.md", "COMP"),
    baseline.normative.compatibility.ruleIds,
  );
});

test("root runtime and domain error inventories match exactly", () => {
  const baseline = readJson(baselineUrl);

  assert.deepEqual(
    Object.keys(publicApi).sort(),
    baseline.package.runtimeExports,
  );
  assert.deepEqual(
    Object.values(publicApi.DomainErrorCode).sort(),
    baseline.package.errorCodes,
  );
  assert.deepEqual(
    baseline.package.normativeStableErrorCodes,
    ["INVALID_SOURCE_RECORD", "SOURCE_REVISION_COLLISION"],
  );
  assert.ok(
    Object.keys(publicApi).every(
      (name) => !/team|git|connector|adapter/i.test(name),
    ),
  );
  assert.deepEqual(sourceTypeExports(), baseline.package.typeExports);
});

test("root-reachable declaration closure matches exact digest", () => {
  const baseline = readJson(baselineUrl);
  const paths = declarationClosure();

  assert.deepEqual(paths, baseline.package.declarations.files);
  assert.equal(
    declarationDigest(paths),
    baseline.package.declarations.sha256,
  );
});

test("package compatibility metadata matches exactly", () => {
  const baseline = readJson(baselineUrl);
  const packageJson = readJson(new URL("../package.json", import.meta.url));

  assert.deepEqual(
    selectedPackageMetadata(packageJson),
    baseline.package.metadata,
  );
});

test("CLI registry matches the exact baseline", () => {
  const baseline = readJson(baselineUrl);

  assert.deepEqual(CLI_CONTRACT, baseline.cli);
});

test("CLI and SDK promotion policy identities remain linked", () => {
  const baseline = readJson(baselineUrl);
  const selectors = Object.entries(baseline.cli.policySelectors);

  assert.deepEqual(baseline.package.policyIdentities, {
    neutralEvidencePolicyV1: {
      id: "neutral-evidence",
      version: "1",
    },
  });
  assert.deepEqual(selectors.map(([selector]) => selector), [
    "neutral-evidence-v1",
  ]);
  selectors.forEach(([, identity]) => {
    const policy = publicApi[identity.sdkExport];
    const sdkIdentity =
      baseline.package.policyIdentities[identity.sdkExport];
    assert.ok(policy, identity.sdkExport);
    assert.deepEqual(sdkIdentity, {
      id: identity.id,
      version: identity.version,
    });
    assert.equal(policy.id, identity.id);
    assert.equal(policy.version, identity.version);
  });
});

test("change cases exercise additive and breaking process rules", () => {
  const cases = readJsonLines(
    new URL(
      "../spec/compatibility/0.1.0/change-cases.jsonl",
      import.meta.url,
    ),
  );
  const stabilityLevels = new Set([
    "normative-stable",
    "supported-experimental",
    "internal",
  ]);
  const classifications = new Set(["additive", "breaking"]);
  const packageVersionEffects = new Set([
    "minor",
    "minor-before-1.0",
  ]);

  assert.deepEqual(cases, [
    {
      id: "additive-cli-command",
      description:
        "Add an independent generic CLI command without changing existing commands, options, outputs, diagnostics, or exit behavior.",
      surface: "supported-experimental",
      classification: "additive",
      packageVersionEffect: "minor",
      requiresRfc: false,
      requiresMigrationNotes: false,
      requiresDeprecation: false,
    },
    {
      id: "breaking-remove-root-export",
      description:
        "Remove the createObject root export while an existing package consumer imports it.",
      surface: "supported-experimental",
      classification: "breaking",
      packageVersionEffect: "minor-before-1.0",
      requiresRfc: true,
      requiresMigrationNotes: true,
      requiresDeprecation: true,
    },
  ]);
  cases.forEach((changeCase) => {
    assert.ok(stabilityLevels.has(changeCase.surface));
    assert.ok(classifications.has(changeCase.classification));
    assert.ok(packageVersionEffects.has(changeCase.packageVersionEffect));
  });
  assert.equal(
    cases.filter((changeCase) => changeCase.classification === "additive")
      .length,
    1,
  );
  assert.equal(
    cases.filter((changeCase) => changeCase.classification === "breaking")
      .length,
    1,
  );
});
