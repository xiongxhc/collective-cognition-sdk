import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import {
  isExternalModuleReference,
  isExportDeclaration,
  isImportDeclaration,
  isImportEqualsDeclaration,
  isImportTypeNode,
  isLiteralTypeNode,
  isNamedExports,
  isStringLiteral,
} from "typescript/unstable/ast";
import { API } from "typescript/unstable/sync";

import * as publicApi from "../dist/index.js";
import { CLI_CONTRACT } from "../dist/cli-contract.js";

const repositoryRoot = new URL("../", import.meta.url);
const historicalBaselineUrl = new URL(
  "../spec/compatibility/0.1.0/baseline.json",
  import.meta.url,
);
const currentBaselineUrl = new URL(
  "../spec/compatibility/0.2.0/baseline.json",
  import.meta.url,
);
const expectedHistoricalBaselineSha256 =
  "4e0c857ad8d115735aa8df99e9d524af55d3a6efae8ead7473b97c5201f5f89b";
const expectedCurrentBaselineSha256 =
  "430b26b2379307b533534acd9dc2d7d7a9d8856f28d2c6e4be2c6812b71f16fa";

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

function declarationFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(
    (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory()
        ? declarationFiles(path)
        : /\.d\.(?:ts|mts|cts)$/.test(entry.name)
          ? [path]
          : [];
    },
  );
}

function runtimePathForDeclaration(path) {
  return path
    .replace(/\.d\.ts$/, ".js")
    .replace(/\.d\.mts$/, ".mjs")
    .replace(/\.d\.cts$/, ".cjs");
}

function relativeDeclarationSpecifiers(sourceFile) {
  const specifiers = new Set();
  const addSpecifier = (value) => {
    if (typeof value === "string" && value.startsWith(".")) {
      specifiers.add(value);
    }
  };
  const visit = (node) => {
    if (
      (isImportDeclaration(node) || isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      isStringLiteral(node.moduleSpecifier)
    ) {
      addSpecifier(node.moduleSpecifier.text);
    } else if (
      isImportEqualsDeclaration(node) &&
      isExternalModuleReference(node.moduleReference) &&
      isStringLiteral(node.moduleReference.expression)
    ) {
      addSpecifier(node.moduleReference.expression.text);
    } else if (
      isImportTypeNode(node) &&
      isLiteralTypeNode(node.argument) &&
      isStringLiteral(node.argument.literal)
    ) {
      addSpecifier(node.argument.literal.text);
    }
    node.forEachChild(visit);
  };

  sourceFile.referencedFiles.forEach((reference) => {
    addSpecifier(reference.fileName);
  });
  sourceFile.forEachChild(visit);
  return specifiers;
}

function declarationClosure(
  distUrl = new URL("../dist/", import.meta.url),
  pathPrefix = "dist",
) {
  const distPath = fileURLToPath(distUrl);
  const declarationPaths = declarationFiles(distPath);
  const declarations = new Map();

  declarationPaths.forEach((declarationPath) => {
    const declarationUrl = pathToFileURL(declarationPath);
    const runtimePath = runtimePathForDeclaration(declarationPath);
    const runtimeUrl = pathToFileURL(runtimePath);
    declarations.set(declarationUrl.href, declarationPath);
    declarations.set(runtimeUrl.href, declarationPath);
    declarations.set(
      pathToFileURL(runtimePath.replace(/\.(?:mjs|cjs|js)$/, "")).href,
      declarationPath,
    );
    if (/[/\\]index\.d\.(?:ts|mts|cts)$/.test(declarationPath)) {
      declarations.set(
        pathToFileURL(dirname(declarationPath)).href,
        declarationPath,
      );
    }
  });

  const api = new API({ cwd: fileURLToPath(repositoryRoot) });
  const snapshot = api.updateSnapshot({ openFiles: declarationPaths });
  const entryPath = join(distPath, "index.d.ts");
  const pending = [entryPath];
  const visited = new Set();

  try {
    while (pending.length > 0) {
      const declarationPath = pending.pop();
      if (visited.has(declarationPath)) {
        continue;
      }
      visited.add(declarationPath);

      const declarationUrl = pathToFileURL(declarationPath);
      assert.ok(
        statSync(declarationPath).isFile(),
        `${declarationPath} must be a file`,
      );
      const project = snapshot.getDefaultProjectForFile(declarationPath);
      assert.ok(project, declarationPath);
      const sourceFile = project.program.getSourceFile(declarationPath);
      assert.ok(sourceFile, declarationPath);

      relativeDeclarationSpecifiers(sourceFile).forEach((specifier) => {
        const target = declarations.get(
          new URL(specifier, declarationUrl).href,
        );
        if (target === undefined) {
          throw new Error(
            `unresolved relative declaration target ${specifier} from ` +
              relative(distPath, declarationPath),
          );
        }
        if (!visited.has(target)) {
          pending.push(target);
        }
      });
    }
    snapshot.dispose();
  } finally {
    api.close();
  }

  return sorted(
    [...visited].map((path) => {
      const name = relative(distPath, path).replaceAll("\\", "/");
      return pathPrefix.length > 0 ? `${pathPrefix}/${name}` : name;
    }),
  );
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

function withDeclarationFixture(files, action) {
  const root = mkdtempSync(join(tmpdir(), "ccsdk-declarations-"));

  try {
    Object.entries(files).forEach(([path, content]) => {
      const filePath = join(root, path);
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, content, "utf8");
    });
    action(pathToFileURL(`${root}/`));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("historical baseline 0.1.0 remains immutable", () => {
  assert.equal(
    sha256(readFileSync(historicalBaselineUrl)),
    expectedHistoricalBaselineSha256,
  );
});

test("current baseline describes additive package 0.2.0", () => {
  const baseline = readJson(currentBaselineUrl);

  assert.equal(baseline.baselineVersion, "0.2.0");
  assert.equal(baseline.appliesToPackageVersion, "0.2.0");
  assert.deepEqual(baseline.packageChange, {
    classification: "additive",
    packageVersionEffect: "minor",
  });
  assert.deepEqual(baseline.historicalBaselines, {
    "0.1.0": {
      path: "spec/compatibility/0.1.0/baseline.json",
      sha256: expectedHistoricalBaselineSha256,
    },
  });
  assert.deepEqual(baseline.deprecations, []);
  assert.deepEqual(baseline.stabilityLevels, [
    {
      id: "normative-stable",
      definition:
        "Portable behavior and immutable versioned artifacts on which implementations and stored data can rely.",
    },
    {
      id: "supported-experimental",
      definition:
        "Public and tested package behavior that can evolve under this policy before 1.0.0.",
    },
    {
      id: "internal",
      definition:
        "Repository implementation details with no compatibility promise.",
    },
  ]);
});

test("current baseline 0.2.0 remains immutable", () => {
  assert.equal(
    sha256(readFileSync(currentBaselineUrl)),
    expectedCurrentBaselineSha256,
  );
});

test("normative machine artifacts match exact digests", () => {
  const baseline = readJson(currentBaselineUrl);
  const normativeContracts = [
    baseline.normative.sourceRecord,
    baseline.normative.portableCognition,
  ];

  normativeContracts.forEach((contract) => {
    const schema = readJson(
      new URL(contract.schema.path, repositoryRoot),
    );
    assert.equal(schema.$id, contract.schema.id);
  });
  assert.deepEqual(
    Object.keys(baseline.normative.artifacts).sort(),
    [
      "spec/compatibility/0.1.0/change-cases.jsonl",
      "spec/compatibility/0.2.0/change-cases.jsonl",
      "spec/conformance/0.1.0/portable-cognition/cognitive-loop.jsonl",
      "spec/conformance/0.1.0/portable-cognition/invalid.jsonl",
      "spec/conformance/0.1.0/portable-cognition/valid.jsonl",
      "spec/conformance/0.1.0/source-record/invalid.jsonl",
      "spec/conformance/0.1.0/source-record/valid.jsonl",
      "spec/schemas/0.1.0/portable-cognition.schema.json",
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
  const baseline = readJson(currentBaselineUrl);

  assert.deepEqual(
    ruleIds("spec/source-record.md", "SR"),
    baseline.normative.sourceRecord.ruleIds,
  );
  assert.deepEqual(
    ruleIds("spec/portable-cognition.md", "PCR"),
    baseline.normative.portableCognition.ruleIds,
  );
  assert.deepEqual(
    ruleIds("spec/compatibility.md", "COMP"),
    baseline.normative.compatibility.ruleIds,
  );
});

test("root runtime and domain error inventories match exactly", () => {
  const baseline = readJson(currentBaselineUrl);

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
    [
      "INVALID_PORTABLE_COGNITION_RECORD",
      "INVALID_SOURCE_RECORD",
      "SOURCE_REVISION_COLLISION",
    ],
  );
  assert.ok(
    Object.keys(publicApi).every(
      (name) => !/team|git|connector|adapter/i.test(name),
    ),
  );
  assert.deepEqual(sourceTypeExports(), baseline.package.typeExports);
});

test("root-reachable declaration closure matches exact digest", () => {
  const baseline = readJson(currentBaselineUrl);
  const paths = declarationClosure();

  assert.deepEqual(paths, baseline.package.declarations.files);
  assert.equal(
    declarationDigest(paths),
    baseline.package.declarations.sha256,
  );
});

test("declaration closure resolves nested references and rejects missing targets", () => {
  withDeclarationFixture(
    {
      "index.d.ts":
        'export type { Public } from "./nested/public.js";\n',
      "nested/public.d.ts":
        'export type { Leaf } from "../shared/leaf.js";\n',
      "shared/leaf.d.ts": "export interface Leaf {}\n",
    },
    (rootUrl) => {
      assert.deepEqual(declarationClosure(rootUrl, ""), [
        "index.d.ts",
        "nested/public.d.ts",
        "shared/leaf.d.ts",
      ]);
    },
  );

  withDeclarationFixture(
    {
      "index.d.ts":
        'export type { Missing } from "./missing.js";\n',
    },
    (rootUrl) => {
      assert.throws(
        () => declarationClosure(rootUrl, ""),
        /unresolved relative declaration target/,
      );
    },
  );
});

test("declaration closure follows every relative declaration reference form", () => {
  withDeclarationFixture(
    {
      "index.d.ts":
        'export type Public = import("./nested/public.js").Public;\n',
      "nested/public.d.ts":
        'import Legacy = require("../legacy/legacy.js");\n' +
        "export interface Public extends Legacy {}\n",
      "legacy/legacy.d.ts":
        '/// <reference path="../shared/leaf.d.ts" />\n' +
        "export = Leaf;\n",
      "shared/leaf.d.ts": "interface Leaf {}\n",
    },
    (rootUrl) => {
      assert.deepEqual(declarationClosure(rootUrl, ""), [
        "index.d.ts",
        "legacy/legacy.d.ts",
        "nested/public.d.ts",
        "shared/leaf.d.ts",
      ]);
    },
  );
});

test("declaration closure fails closed for unresolved relative reference forms", () => {
  const fixtures = [
    {
      name: "import type",
      source: 'export type Missing = import("./missing.js").Missing;\n',
    },
    {
      name: "import equals",
      source: 'import Missing = require("./missing.js");\nexport = Missing;\n',
    },
    {
      name: "triple-slash path",
      source: '/// <reference path="./missing.d.ts" />\nexport {};\n',
    },
  ];

  fixtures.forEach((fixture) => {
    withDeclarationFixture(
      { "index.d.ts": fixture.source },
      (rootUrl) => {
        assert.throws(
          () => declarationClosure(rootUrl, ""),
          /unresolved relative declaration target/,
          fixture.name,
        );
      },
    );
  });
});

test("package compatibility metadata matches exactly", () => {
  const baseline = readJson(currentBaselineUrl);
  const packageJson = readJson(new URL("../package.json", import.meta.url));

  assert.deepEqual(
    selectedPackageMetadata(packageJson),
    baseline.package.metadata,
  );
});

test("CLI registry matches the exact baseline", () => {
  const baseline = readJson(currentBaselineUrl);

  assert.deepEqual(CLI_CONTRACT, baseline.cli);
});

test("CLI and SDK promotion policy identities remain linked", () => {
  const baseline = readJson(currentBaselineUrl);
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
      "../spec/compatibility/0.2.0/change-cases.jsonl",
      import.meta.url,
    ),
  );
  const stabilityLevels = new Set(
    readJson(currentBaselineUrl).stabilityLevels.map((level) => level.id),
  );
  const classifications = new Set(["additive", "breaking"]);
  const packageVersionEffects = new Set([
    "minor",
    "minor-before-1.0",
  ]);

  assert.deepEqual(cases, [
    {
      id: "additive-portable-cognition-package",
      description:
        "Add Portable Cognition 0.1.0 runtime exports, schema, conformance fixtures, and package subpaths while preserving every existing SourceRecord and package surface.",
      surface: "supported-experimental",
      classification: "additive",
      packageVersionEffect: "minor",
      requiresRfc: false,
      requiresMigrationNotes: false,
      requiresDeprecation: false,
      rationale:
        "Existing imports, SourceRecord artifacts, CLI behavior, and policy identities remain available with unchanged meaning while consumers may opt into the new contract.",
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
      rationale:
        "Removing a root export makes an existing conforming import fail, so consumers require migration and deprecation handling.",
    },
  ]);
  cases.forEach((changeCase) => {
    assert.ok(stabilityLevels.has(changeCase.surface));
    assert.ok(classifications.has(changeCase.classification));
    assert.ok(packageVersionEffects.has(changeCase.packageVersionEffect));
    assert.equal(typeof changeCase.rationale, "string");
    assert.ok(changeCase.rationale.trim().length > 0);
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
