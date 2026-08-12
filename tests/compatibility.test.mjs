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
import * as connectorConformanceApi from "../dist/connector-conformance.js";
import * as teamMemoryConnectorApi from "../dist/connectors/team-memory.js";
import * as markdownCognitionApi from "../dist/markdown-cognition.js";
import { CLI_CONTRACT } from "../dist/cli-contract.js";

const repositoryRoot = new URL("../", import.meta.url);
const historicalBaselineUrl = new URL(
  "../spec/compatibility/0.1.0/baseline.json",
  import.meta.url,
);
const historicalChangeCasesUrl = new URL(
  "../spec/compatibility/0.1.0/change-cases.jsonl",
  import.meta.url,
);
const previousBaselineUrl = new URL(
  "../spec/compatibility/0.2.0/baseline.json",
  import.meta.url,
);
const previousChangeCasesUrl = new URL(
  "../spec/compatibility/0.2.0/change-cases.jsonl",
  import.meta.url,
);
const latestHistoricalBaselineUrl = new URL(
  "../spec/compatibility/0.3.0/baseline.json",
  import.meta.url,
);
const latestHistoricalChangeCasesUrl = new URL(
  "../spec/compatibility/0.3.0/change-cases.jsonl",
  import.meta.url,
);
const previousCurrentBaselineUrl = new URL(
  "../spec/compatibility/0.4.0/baseline.json",
  import.meta.url,
);
const previousCurrentChangeCasesUrl = new URL(
  "../spec/compatibility/0.4.0/change-cases.jsonl",
  import.meta.url,
);
const currentBaselineUrl = new URL(
  "../spec/compatibility/0.8.0/baseline.json",
  import.meta.url,
);
const latestReleaseBaselineUrl = new URL(
  "../spec/compatibility/0.7.0/baseline.json",
  import.meta.url,
);
const latestReleaseChangeCasesUrl = new URL(
  "../spec/compatibility/0.7.0/change-cases.jsonl",
  import.meta.url,
);
const currentHistoricalBaselineUrl = new URL(
  "../spec/compatibility/0.5.0/baseline.json",
  import.meta.url,
);
const currentHistoricalChangeCasesUrl = new URL(
  "../spec/compatibility/0.5.0/change-cases.jsonl",
  import.meta.url,
);
const previousReleaseBaselineUrl = new URL(
  "../spec/compatibility/0.6.0/baseline.json",
  import.meta.url,
);
const previousReleaseChangeCasesUrl = new URL(
  "../spec/compatibility/0.6.0/change-cases.jsonl",
  import.meta.url,
);
const expectedHistoricalBaselineSha256 =
  "4e0c857ad8d115735aa8df99e9d524af55d3a6efae8ead7473b97c5201f5f89b";
const expectedHistoricalChangeCasesSha256 =
  "3337f8e2ca7aaa0769a18ad8ce724c621d94d01528980b6d30feec9e8626bd6b";
const expectedPreviousBaselineSha256 =
  "3da00ab49c1f3b02bfc19226545dce68379546641f418993f632851b8c49ddc4";
const expectedPreviousChangeCasesSha256 =
  "e0229b0436827bc71456e839e852f96d8d075da8fd65c32342fd6089c995e5f5";
const expectedLatestHistoricalBaselineSha256 =
  "02991abb5133a4aef2b6a2fc736567fbbde9e29859909f806f08822fcd40d3d4";
const expectedLatestHistoricalChangeCasesSha256 =
  "1f1ff3822de318806640357bb11804a0213d7084f05350035f8bb8d519dd95f2";
const expectedPreviousCurrentBaselineSha256 =
  "3f807dc1eeeaa3ebcd700e8e38f5c6358da60a2645a5b101ec1ba6429b97a918";
const expectedPreviousCurrentChangeCasesSha256 =
  "704d478ed8738f3f591d6b49886bce919dcd0318b8c54a107619d1aa9961c645";
const expectedCurrentHistoricalBaselineSha256 =
  "5350c0b6eda15f84539c0e7b8f33c377cfdce781425ed20bbafd61250f7e3327";
const expectedCurrentHistoricalChangeCasesSha256 =
  "992a3dfb12f5edcc96604007e61d28c102f0581d9bdba80f63697199be7e698e";
const expectedPreviousReleaseBaselineSha256 =
  "5549845df16c610d3b418220ebe895941ffcbb1f9dbe849d0a231e51e17d7289";
const expectedPreviousReleaseChangeCasesSha256 =
  "344c98585ab3c6572ea460a5902bea92bb9266bb29e33813492dd1c9bada62c8";
const expectedLatestReleaseBaselineSha256 =
  "732dad2f2aff303c0b80cfcf1474e64b71648d82256e2ba5c9efcf9e6575e50f";
const expectedLatestReleaseChangeCasesSha256 =
  "23d6577eb6aa927ab37f33278363f00a38cb2e0e67adfbc50a9dc2075b1b9e9e";
const expectedPublicApiReferenceSha256 =
  "41218dc679217ceba8851d643139af2ab670fcc3b3b340ddc692168955250728";
const expectedDistributionReadinessRfcSha256 =
  "73c4a89eed7c7bf0145806a5261874708c72899d5be6de511301f00012e602d3";
const expectedDistributionReadinessProseSha256 =
  "9c88e7fdce4dbcbfae2a27cf40d76dea7e7e7cefa84f43ad4aef7e848d5e6f78";
const expectedDistributionReadinessProfileSha256 =
  "5d1d236c946820be65d04648b66ca215073810a908ad8d44da8f04f800909af9";
const expectedCurrentChangeCasesSha256 =
  "9cb7bd259d2b84e7fb1f8839263bfae0d54eb2ba8aaa07de9f15957660244572";
const expectedHistoricalChangeCaseDigests = Object.freeze({
  "spec/compatibility/0.1.0/change-cases.jsonl":
    expectedHistoricalChangeCasesSha256,
  "spec/compatibility/0.2.0/change-cases.jsonl":
    expectedPreviousChangeCasesSha256,
  "spec/compatibility/0.3.0/change-cases.jsonl":
    expectedLatestHistoricalChangeCasesSha256,
  "spec/compatibility/0.4.0/change-cases.jsonl":
    expectedPreviousCurrentChangeCasesSha256,
  "spec/compatibility/0.5.0/change-cases.jsonl":
    expectedCurrentHistoricalChangeCasesSha256,
  "spec/compatibility/0.6.0/change-cases.jsonl":
    expectedPreviousReleaseChangeCasesSha256,
  "spec/compatibility/0.7.0/change-cases.jsonl":
    expectedLatestReleaseChangeCasesSha256,
});
const productionDependencyFieldNames = Object.freeze([
  "dependencies",
  "optionalDependencies",
  "peerDependencies",
  "bundleDependencies",
  "bundledDependencies",
]);

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

function directDeclarationTypeExports(path) {
  const text = readFileSync(new URL(path, repositoryRoot), "utf8");
  const direct = [...text.matchAll(
    /^export (?:interface|type) ([A-Za-z_$][\w$]*)/gm,
  )].map((match) => match[1]);
  const reExported = [...text.matchAll(
    /^export type \{([\s\S]*?)\} from /gm,
  )].flatMap((match) =>
    [...match[1].matchAll(/([A-Za-z_$][\w$]*)\s*,?/g)].map(
      (part) => part[1],
    )
  );
  return sorted([...direct, ...reExported]);
}

function declarationStringUnion(path, pattern) {
  const text = readFileSync(new URL(path, repositoryRoot), "utf8");
  const match = text.match(pattern);
  assert.ok(match?.[1], `${path} must contain the expected string union`);
  return sorted(
    [...match[1].matchAll(/"([^"]+)"/g)].map((part) => part[1]),
  );
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
    productionDependencyFields: productionDependencyFieldNames.filter(
      (field) => Object.hasOwn(packageJson, field),
    ),
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
  entrypoint = "index.d.ts",
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
  const entryPath = join(distPath, entrypoint);
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

test("historical compatibility 0.1.0 artifacts remain immutable", () => {
  assert.equal(
    sha256(readFileSync(historicalBaselineUrl)),
    expectedHistoricalBaselineSha256,
  );
  assert.equal(
    sha256(readFileSync(historicalChangeCasesUrl)),
    expectedHistoricalChangeCasesSha256,
  );
});

test("historical compatibility 0.2.0 artifacts remain immutable", () => {
  assert.equal(
    sha256(readFileSync(previousBaselineUrl)),
    expectedPreviousBaselineSha256,
  );
  assert.equal(
    sha256(readFileSync(previousChangeCasesUrl)),
    expectedPreviousChangeCasesSha256,
  );
});

test("historical compatibility 0.3.0 artifacts remain immutable", () => {
  assert.equal(
    sha256(readFileSync(latestHistoricalBaselineUrl)),
    expectedLatestHistoricalBaselineSha256,
  );
  assert.equal(
    sha256(readFileSync(latestHistoricalChangeCasesUrl)),
    expectedLatestHistoricalChangeCasesSha256,
  );
});

test("historical compatibility 0.4.0 artifacts remain immutable", () => {
  assert.equal(
    sha256(readFileSync(previousCurrentBaselineUrl)),
    expectedPreviousCurrentBaselineSha256,
  );
  assert.equal(
    sha256(readFileSync(previousCurrentChangeCasesUrl)),
    expectedPreviousCurrentChangeCasesSha256,
  );
});

test("historical compatibility 0.5.0 artifacts remain immutable", () => {
  assert.equal(
    sha256(readFileSync(currentHistoricalBaselineUrl)),
    expectedCurrentHistoricalBaselineSha256,
  );
  assert.equal(
    sha256(readFileSync(currentHistoricalChangeCasesUrl)),
    expectedCurrentHistoricalChangeCasesSha256,
  );
});

test("historical compatibility 0.6.0 artifacts remain immutable", () => {
  assert.equal(
    sha256(readFileSync(previousReleaseBaselineUrl)),
    expectedPreviousReleaseBaselineSha256,
  );
  assert.equal(
    sha256(readFileSync(previousReleaseChangeCasesUrl)),
    expectedPreviousReleaseChangeCasesSha256,
  );
});

test("historical compatibility 0.7.0 artifacts remain immutable", () => {
  assert.equal(
    sha256(readFileSync(latestReleaseBaselineUrl)),
    expectedLatestReleaseBaselineSha256,
  );
  assert.equal(
    sha256(readFileSync(latestReleaseChangeCasesUrl)),
    expectedLatestReleaseChangeCasesSha256,
  );
});

test("current baseline describes the additive package 0.8.0 release", () => {
  const baseline = readJson(currentBaselineUrl);

  assert.equal(baseline.baselineVersion, "0.8.0");
  assert.equal(baseline.appliesToPackageVersion, "0.8.0");
  assert.deepEqual(baseline.packageChange, {
    classification: "additive",
    packageVersionEffect: "minor",
  });
  assert.deepEqual(baseline.package.metadata.engines, {
    node: ">=24",
  });
  assert.deepEqual(baseline.historicalBaselines, {
    "0.1.0": {
      path: "spec/compatibility/0.1.0/baseline.json",
      sha256: expectedHistoricalBaselineSha256,
    },
    "0.2.0": {
      path: "spec/compatibility/0.2.0/baseline.json",
      sha256: expectedPreviousBaselineSha256,
    },
    "0.3.0": {
      path: "spec/compatibility/0.3.0/baseline.json",
      sha256: expectedLatestHistoricalBaselineSha256,
    },
    "0.4.0": {
      path: "spec/compatibility/0.4.0/baseline.json",
      sha256: expectedPreviousCurrentBaselineSha256,
    },
    "0.5.0": {
      path: "spec/compatibility/0.5.0/baseline.json",
      sha256: expectedCurrentHistoricalBaselineSha256,
    },
    "0.6.0": {
      path: "spec/compatibility/0.6.0/baseline.json",
      sha256: expectedPreviousReleaseBaselineSha256,
    },
    "0.7.0": {
      path: "spec/compatibility/0.7.0/baseline.json",
      sha256: expectedLatestReleaseBaselineSha256,
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
      "docs/public-api.md",
      "rfcs/0009-public-api-and-distribution-readiness.md",
      "spec/compatibility/0.1.0/change-cases.jsonl",
      "spec/compatibility/0.2.0/change-cases.jsonl",
      "spec/compatibility/0.3.0/change-cases.jsonl",
      "spec/compatibility/0.4.0/change-cases.jsonl",
      "spec/compatibility/0.5.0/change-cases.jsonl",
      "spec/compatibility/0.6.0/change-cases.jsonl",
      "spec/compatibility/0.7.0/change-cases.jsonl",
      "spec/compatibility/0.8.0/change-cases.jsonl",
      "spec/conformance/0.1.0/portable-cognition/cognitive-loop.jsonl",
      "spec/conformance/0.1.0/portable-cognition/invalid.jsonl",
      "spec/conformance/0.1.0/portable-cognition/valid.jsonl",
      "spec/conformance/0.1.0/source-record/invalid.jsonl",
      "spec/conformance/0.1.0/source-record/valid.jsonl",
      "spec/distribution-readiness.md",
      "spec/distribution-readiness/0.1.0/profile.json",
      "spec/runtime-security.md",
      "spec/runtime-security/0.1.0/profile.json",
      "spec/schemas/0.1.0/portable-cognition.schema.json",
      "spec/schemas/0.1.0/source-record.schema.json",
    ],
  );
  assert.deepEqual(
    Object.fromEntries(
      Object.keys(expectedHistoricalChangeCaseDigests).map((path) => [
        path,
        baseline.normative.artifacts[path],
      ]),
    ),
    expectedHistoricalChangeCaseDigests,
  );
  assert.equal(
    baseline.normative.artifacts["docs/public-api.md"],
    expectedPublicApiReferenceSha256,
  );
  assert.equal(
    baseline.normative.artifacts[
      "rfcs/0009-public-api-and-distribution-readiness.md"
    ],
    expectedDistributionReadinessRfcSha256,
  );
  assert.equal(
    baseline.normative.artifacts["spec/distribution-readiness.md"],
    expectedDistributionReadinessProseSha256,
  );
  assert.equal(
    baseline.normative.artifacts[
      "spec/distribution-readiness/0.1.0/profile.json"
    ],
    expectedDistributionReadinessProfileSha256,
  );
  assert.equal(
    baseline.normative.artifacts["spec/compatibility/0.8.0/change-cases.jsonl"],
    expectedCurrentChangeCasesSha256,
  );
  assert.equal(
    sha256(readFileSync(new URL("docs/public-api.md", repositoryRoot))),
    expectedPublicApiReferenceSha256,
    "docs/public-api.md",
  );
  assert.equal(
    sha256(
      readFileSync(
        new URL(
          "rfcs/0009-public-api-and-distribution-readiness.md",
          repositoryRoot,
        ),
      ),
    ),
    expectedDistributionReadinessRfcSha256,
    "rfcs/0009-public-api-and-distribution-readiness.md",
  );
  assert.equal(
    sha256(
      readFileSync(new URL("spec/distribution-readiness.md", repositoryRoot)),
    ),
    expectedDistributionReadinessProseSha256,
    "spec/distribution-readiness.md",
  );
  assert.equal(
    sha256(
      readFileSync(
        new URL(
          "spec/distribution-readiness/0.1.0/profile.json",
          repositoryRoot,
        ),
      ),
    ),
    expectedDistributionReadinessProfileSha256,
    "spec/distribution-readiness/0.1.0/profile.json",
  );
  assert.equal(
    sha256(
      readFileSync(
        new URL("spec/compatibility/0.8.0/change-cases.jsonl", repositoryRoot),
      ),
    ),
    expectedCurrentChangeCasesSha256,
    "spec/compatibility/0.8.0/change-cases.jsonl",
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

test("normative prose matches its hash and stable rule identifiers", () => {
  const baseline = readJson(currentBaselineUrl);

  assert.equal(
    sha256(
      readFileSync(
        new URL(
          baseline.normative.portableCognition.prosePath,
          repositoryRoot,
        ),
      ),
    ),
    baseline.normative.portableCognition.proseSha256,
  );
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
  assert.deepEqual(baseline.normative.hostIntegration, {
    version: "0.1.0",
    prosePath: "spec/host-integration.md",
    proseSha256: sha256(
      readFileSync(
        new URL("spec/host-integration.md", repositoryRoot),
      ),
    ),
    ruleIds: [
      "HIC-001",
      "HIC-002",
      "HIC-003",
      "HIC-004",
      "HIC-005",
      "HIC-006",
      "HIC-007",
      "HIC-008",
      "HIC-009",
      "HIC-010",
      "HIC-011",
      "HIC-012",
      "HIC-013",
      "HIC-014",
      "HIC-015",
      "HIC-016",
    ],
    packageSubpaths: {
      contract: "./contracts/host-integration/0.1.0",
      conformance: "./host-conformance/0.1.0",
      referenceHost: "./reference-host/0.1.0",
    },
  });
  assert.deepEqual(
    ruleIds("spec/host-integration.md", "HIC"),
    baseline.normative.hostIntegration.ruleIds,
  );
  assert.deepEqual(baseline.normative.runtimeSecurity, {
    version: "0.1.0",
    prosePath: "spec/runtime-security.md",
    proseSha256: sha256(
      readFileSync(new URL("spec/runtime-security.md", repositoryRoot)),
    ),
    profile: {
      path: "spec/runtime-security/0.1.0/profile.json",
      sha256: sha256(
        readFileSync(
          new URL(
            "spec/runtime-security/0.1.0/profile.json",
            repositoryRoot,
          ),
        ),
      ),
      packageSubpath: "./runtime-security/0.1.0",
    },
    ruleIds: Array.from({ length: 22 }, (_, index) =>
      `RSP-${String(index + 1).padStart(3, "0")}`,
    ),
    nonClaimIds: Array.from({ length: 5 }, (_, index) =>
      `RSP-NC-${String(index + 1).padStart(3, "0")}`,
    ),
  });
  const runtimeSecurityProfile = readJson(
    new URL(baseline.normative.runtimeSecurity.profile.path, repositoryRoot),
  );
  assert.equal(runtimeSecurityProfile.version, baseline.normative.runtimeSecurity.version);
  assert.deepEqual(
    ruleIds("spec/runtime-security.md", "RSP"),
    baseline.normative.runtimeSecurity.ruleIds,
  );
  assert.deepEqual(
    runtimeSecurityProfile.controls.map((control) => control.id),
    baseline.normative.runtimeSecurity.ruleIds,
  );
  assert.deepEqual(
    runtimeSecurityProfile.nonClaims.map((nonClaim) => nonClaim.id),
    baseline.normative.runtimeSecurity.nonClaimIds,
  );
  assert.deepEqual(baseline.normative.distributionReadiness, {
    version: "0.1.0",
    prosePath: "spec/distribution-readiness.md",
    proseSha256: expectedDistributionReadinessProseSha256,
    profile: {
      path: "spec/distribution-readiness/0.1.0/profile.json",
      sha256: expectedDistributionReadinessProfileSha256,
      packageSubpath: "./distribution-readiness/0.1.0",
      describesPackageVersion: "0.8.0",
    },
    publicApiReference: {
      path: "docs/public-api.md",
      sha256: expectedPublicApiReferenceSha256,
    },
    rfc: {
      path: "rfcs/0009-public-api-and-distribution-readiness.md",
      sha256: expectedDistributionReadinessRfcSha256,
    },
    ruleIds: Array.from({ length: 12 }, (_, index) =>
      `DRP-${String(index + 1).padStart(3, "0")}`,
    ),
    gateIds: Array.from({ length: 5 }, (_, index) =>
      `DRP-GATE-${String(index + 1).padStart(3, "0")}`,
    ),
    npmBlockerIds: Array.from({ length: 2 }, (_, index) =>
      `DRP-NPM-${String(index + 1).padStart(3, "0")}`,
    ),
    nonClaimIds: Array.from({ length: 5 }, (_, index) =>
      `DRP-NC-${String(index + 1).padStart(3, "0")}`,
    ),
  });
  const distributionReadinessProfile = readJson(
    new URL(
      baseline.normative.distributionReadiness.profile.path,
      repositoryRoot,
    ),
  );
  assert.equal(
    distributionReadinessProfile.profileVersion,
    baseline.normative.distributionReadiness.version,
  );
  assert.equal(
    distributionReadinessProfile.describesPackageVersion,
    baseline.normative.distributionReadiness.profile.describesPackageVersion,
  );
  assert.deepEqual(
    ruleIds("spec/distribution-readiness.md", "DRP"),
    baseline.normative.distributionReadiness.ruleIds,
  );
  assert.deepEqual(
    distributionReadinessProfile.gates.map((gate) => gate.id),
    baseline.normative.distributionReadiness.gateIds,
  );
  assert.deepEqual(
    distributionReadinessProfile.npmBlockers.map((blocker) => blocker.id),
    baseline.normative.distributionReadiness.npmBlockerIds,
  );
  assert.deepEqual(
    distributionReadinessProfile.nonClaims.map((nonClaim) => nonClaim.id),
    baseline.normative.distributionReadiness.nonClaimIds,
  );
});

test("root runtime and domain error inventories match exactly", () => {
  const baseline = readJson(currentBaselineUrl);
  const previousCurrentBaseline = readJson(latestReleaseBaselineUrl);

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
      "INVALID_HOST_INTEGRATION_REQUEST",
      "INVALID_PORTABLE_COGNITION_RECORD",
      "INVALID_SOURCE_RECORD",
      "SOURCE_REVISION_COLLISION",
    ],
  );
  assert.equal(publicApi.HOST_INTEGRATION_CONTRACT_VERSION, "0.1.0");
  assert.deepEqual(publicApi.HostFailureCode, {
    COMMIT_FAILED: "HOST_COMMIT_FAILED",
    PUBLICATION_FAILED: "HOST_PUBLICATION_FAILED",
  });
  assert.equal(typeof publicApi.commitInitialCognition, "function");
  assert.equal(typeof publicApi.commitCognitionTransition, "function");
  assert.ok(
    Object.keys(publicApi).every(
      (name) => !/team|git|connector|adapter/i.test(name),
    ),
  );
  assert.deepEqual(sourceTypeExports(), baseline.package.typeExports);
  assert.deepEqual(
    baseline.package.runtimeExports,
    previousCurrentBaseline.package.runtimeExports,
  );
  assert.deepEqual(
    baseline.package.typeExports,
    previousCurrentBaseline.package.typeExports,
  );
  assert.ok(
    [
      "CognitionEventPublisher",
      "CognitionHost",
      "CognitionPersistenceStatus",
      "CognitionPublicationStatus",
      "CognitionStore",
      "CognitionStoreCommitResult",
      "HostConflict",
      "HostConflictCode",
      "HostFailure",
      "InitialCognitionCommit",
      "InitialCommitOutcome",
      "PortableCognitionEventRecord",
      "PortableCognitiveObjectRecord",
      "TransitionCognitionCommit",
      "TransitionCommitOutcome",
    ].every((name) => baseline.package.typeExports.includes(name)),
  );
});

test("connector subpath contracts match exact additive inventories", () => {
  const baseline = readJson(currentBaselineUrl);

  assert.deepEqual(baseline.connectorConformance, {
    version: "0.1.0",
    packageSubpath: "./connector-conformance/0.1.0",
    runtimeExports: ["runSourceConnectorConformance"],
    typeExports: [
      "SourceConnectorConformanceCase",
      "SourceConnectorConformanceDiagnostic",
      "SourceConnectorConformanceDiagnosticCode",
      "SourceConnectorConformanceResult",
    ],
    diagnosticCodes: [
      "connector_exception",
      "duplicate_revision",
      "invalid_collection",
      "invalid_source_record",
      "nondeterministic_output",
    ],
    statuses: ["failed", "passed"],
  });
  assert.deepEqual(
    Object.keys(connectorConformanceApi).sort(),
    baseline.connectorConformance.runtimeExports,
  );
  assert.deepEqual(
    directDeclarationTypeExports("dist/connector-conformance.d.ts"),
    baseline.connectorConformance.typeExports,
  );
  assert.deepEqual(
    declarationStringUnion(
      "dist/connector-conformance.d.ts",
      /export type SourceConnectorConformanceDiagnosticCode = ([^;]+);/,
    ),
    baseline.connectorConformance.diagnosticCodes,
  );
  assert.deepEqual(
    declarationStringUnion(
      "dist/connector-conformance.d.ts",
      /readonly status: ([^;]+);/,
    ),
    baseline.connectorConformance.statuses,
  );

  assert.deepEqual(baseline.teamMemoryConnector, {
    version: "0.1.0",
    packageSubpath: "./connectors/team-memory/0.1.0",
    runtimeExports: [
      "TEAM_MEMORY_LEDGER_FORMAT",
      "TeamMemoryConnectorError",
      "readTeamMemorySourceRecords",
    ],
    typeExports: [
      "TeamMemoryConnectorErrorCode",
      "TeamMemorySourceRecordOptions",
    ],
    errorCodes: [
      "incompatible_ledger",
      "invalid_options",
      "invalid_row",
      "read_failed",
      "target_unavailable",
    ],
    stages: ["mapping", "open", "options", "query", "schema"],
    ledgerFormat: "teammem-event-ledger/1",
  });
  assert.deepEqual(
    Object.keys(teamMemoryConnectorApi).sort(),
    baseline.teamMemoryConnector.runtimeExports,
  );
  assert.deepEqual(
    directDeclarationTypeExports("dist/connectors/team-memory.d.ts"),
    baseline.teamMemoryConnector.typeExports,
  );
  assert.deepEqual(
    declarationStringUnion(
      "dist/connectors/team-memory.d.ts",
      /export type TeamMemoryConnectorErrorCode = ([^;]+);/,
    ),
    baseline.teamMemoryConnector.errorCodes,
  );
  assert.deepEqual(
    declarationStringUnion(
      "dist/connectors/team-memory.d.ts",
      /type TeamMemoryConnectorStage = ([^;]+);/,
    ),
    baseline.teamMemoryConnector.stages,
  );
  assert.equal(
    teamMemoryConnectorApi.TEAM_MEMORY_LEDGER_FORMAT,
    baseline.teamMemoryConnector.ledgerFormat,
  );
  assert.deepEqual(baseline.teamMemoryCli, {
    binaryName: "collective-cognition-teammem",
    commandNames: ["export"],
  });
});

test("Markdown adapter subpath contract matches its exact additive inventory", () => {
  const baseline = readJson(currentBaselineUrl);

  assert.deepEqual(baseline.markdownCognition, {
    version: "0.1.0",
    packageSubpath: "./adapters/markdown/0.1.0",
    runtimeExports: [
      "MARKDOWN_COGNITION_MANIFEST_FILE",
      "MARKDOWN_COGNITION_MARKER_FILE",
      "MARKDOWN_COGNITION_MAX_INPUT_BYTES",
      "MARKDOWN_COGNITION_MAX_MANIFEST_ENTRIES",
      "MARKDOWN_COGNITION_MAX_NOTE_BYTES",
      "MARKDOWN_COGNITION_MAX_OBJECT_VERSION",
      "MARKDOWN_COGNITION_MAX_PATH_SEGMENTS",
      "MARKDOWN_COGNITION_MAX_RECORDS",
      "MARKDOWN_COGNITION_MAX_RELATIVE_PATH_BYTES",
      "MARKDOWN_COGNITION_MAX_TOTAL_BYTES",
      "MARKDOWN_COGNITION_PROFILE_VERSION",
      "MARKDOWN_COGNITION_TARGET_FORMAT",
      "MarkdownCognitionError",
      "initializeMarkdownCognitionTarget",
      "markdownCognitionRelativePath",
      "parseMarkdownCognitionRecord",
      "projectMarkdownCognition",
      "renderMarkdownCognitionIndex",
      "renderMarkdownCognitionRecord",
      "verifyMarkdownCognitionTarget",
    ],
    typeExports: [
      "MarkdownCognitionErrorCode",
      "MarkdownCognitionProjectionOptions",
      "MarkdownCognitionProjectionReport",
      "MarkdownCognitionRecord",
      "MarkdownCognitionRenderContext",
      "MarkdownCognitionTargetOptions",
      "MarkdownCognitionVerificationDiagnostic",
      "MarkdownCognitionVerificationReport",
    ],
    errorCodes: [
      "incompatible_target",
      "invalid_markdown_record",
      "invalid_projection_input",
      "invalid_target",
      "managed_file_conflict",
      "projection_io_failed",
      "projection_limit_exceeded",
      "target_not_initialized",
      "unsafe_target_entry",
    ],
    constants: {
      profileVersion: "portable-cognition-markdown/0.1.0",
      targetFormat: "collective-cognition-markdown-target/1",
      markerFile: ".collective-cognition.json",
      manifestFile: ".collective-cognition-manifest.json",
      maxInputBytes: 1048576,
      maxNoteBytes: 1048576,
      maxObjectVersion: 99999999,
      maxRecords: 10000,
      maxTotalBytes: 134217728,
      maxManifestEntries: 10001,
      maxPathSegments: 4,
      maxRelativePathBytes: 512,
    },
    binaryName: "collective-cognition-markdown",
  });
  assert.deepEqual(
    Object.keys(markdownCognitionApi).sort(),
    baseline.markdownCognition.runtimeExports,
  );
  assert.deepEqual(
    directDeclarationTypeExports("dist/markdown-cognition.d.ts"),
    baseline.markdownCognition.typeExports,
  );
  assert.deepEqual(
    declarationStringUnion(
      "dist/markdown-cognition-profile.d.ts",
      /export type MarkdownCognitionErrorCode = ([^;]+);/,
    ),
    baseline.markdownCognition.errorCodes,
  );
  assert.equal(
    markdownCognitionApi.MARKDOWN_COGNITION_PROFILE_VERSION,
    baseline.markdownCognition.constants.profileVersion,
  );
  assert.equal(
    markdownCognitionApi.MARKDOWN_COGNITION_TARGET_FORMAT,
    baseline.markdownCognition.constants.targetFormat,
  );
  assert.equal(
    markdownCognitionApi.MARKDOWN_COGNITION_MARKER_FILE,
    baseline.markdownCognition.constants.markerFile,
  );
  assert.equal(
    markdownCognitionApi.MARKDOWN_COGNITION_MANIFEST_FILE,
    baseline.markdownCognition.constants.manifestFile,
  );
  assert.equal(
    markdownCognitionApi.MARKDOWN_COGNITION_MAX_INPUT_BYTES,
    baseline.markdownCognition.constants.maxInputBytes,
  );
  assert.equal(
    markdownCognitionApi.MARKDOWN_COGNITION_MAX_NOTE_BYTES,
    baseline.markdownCognition.constants.maxNoteBytes,
  );
  assert.equal(
    markdownCognitionApi.MARKDOWN_COGNITION_MAX_OBJECT_VERSION,
    baseline.markdownCognition.constants.maxObjectVersion,
  );
  assert.equal(
    markdownCognitionApi.MARKDOWN_COGNITION_MAX_RECORDS,
    baseline.markdownCognition.constants.maxRecords,
  );
  assert.equal(
    markdownCognitionApi.MARKDOWN_COGNITION_MAX_TOTAL_BYTES,
    baseline.markdownCognition.constants.maxTotalBytes,
  );
  assert.equal(
    markdownCognitionApi.MARKDOWN_COGNITION_MAX_MANIFEST_ENTRIES,
    baseline.markdownCognition.constants.maxManifestEntries,
  );
  assert.equal(
    markdownCognitionApi.MARKDOWN_COGNITION_MAX_PATH_SEGMENTS,
    baseline.markdownCognition.constants.maxPathSegments,
  );
  assert.equal(
    markdownCognitionApi.MARKDOWN_COGNITION_MAX_RELATIVE_PATH_BYTES,
    baseline.markdownCognition.constants.maxRelativePathBytes,
  );
});

test("public declaration entrypoint closures match exact independent digests", () => {
  const baseline = readJson(currentBaselineUrl);
  const previousCurrentBaseline = readJson(latestReleaseBaselineUrl);
  const entrypoints = {
    root: {
      packageSubpath: ".",
      declarationEntrypoint: "dist/index.d.ts",
    },
    hostConformance: {
      packageSubpath: "./host-conformance/0.1.0",
      declarationEntrypoint: "dist/host-conformance.d.ts",
    },
    referenceHost: {
      packageSubpath: "./reference-host/0.1.0",
      declarationEntrypoint: "dist/reference-host.d.ts",
    },
    sqlite: {
      packageSubpath: "./stores/sqlite/0.1.0",
      declarationEntrypoint: "dist/stores/sqlite.d.ts",
    },
    connectorConformance: {
      packageSubpath: "./connector-conformance/0.1.0",
      declarationEntrypoint: "dist/connector-conformance.d.ts",
    },
    teamMemoryConnector: {
      packageSubpath: "./connectors/team-memory/0.1.0",
      declarationEntrypoint: "dist/connectors/team-memory.d.ts",
    },
    markdownCognition: {
      packageSubpath: "./adapters/markdown/0.1.0",
      declarationEntrypoint: "dist/markdown-cognition.d.ts",
    },
  };

  assert.deepEqual(
    Object.keys(baseline.package.declarations),
    Object.keys(entrypoints),
  );
  assert.deepEqual(
    baseline.package.declarations,
    previousCurrentBaseline.package.declarations,
  );
  Object.entries(entrypoints).forEach(([name, expected]) => {
    const declaration = baseline.package.declarations[name];
    assert.equal(declaration.packageSubpath, expected.packageSubpath);
    assert.equal(
      declaration.declarationEntrypoint,
      expected.declarationEntrypoint,
    );
    const paths = declarationClosure(
      new URL("../dist/", import.meta.url),
      "dist",
      expected.declarationEntrypoint.slice("dist/".length),
    );
    assert.deepEqual(paths, declaration.files, name);
    assert.equal(declarationDigest(paths), declaration.sha256, name);
  });
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
    productionDependencyFieldNames,
    [
      "dependencies",
      "optionalDependencies",
      "peerDependencies",
      "bundleDependencies",
      "bundledDependencies",
    ],
  );
  assert.deepEqual(
    selectedPackageMetadata(packageJson),
    baseline.package.metadata,
  );
});

test("CLI registry matches the exact baseline", () => {
  const baseline = readJson(currentBaselineUrl);
  const previousCurrentBaseline = readJson(latestReleaseBaselineUrl);

  assert.deepEqual(CLI_CONTRACT, baseline.cli);
  assert.deepEqual(baseline.cli, previousCurrentBaseline.cli);
  assert.equal(
    JSON.stringify(baseline.cli),
    JSON.stringify(previousCurrentBaseline.cli),
    "generic CLI contract serialization must remain byte-identical to 0.7",
  );
  assert.deepEqual(
    baseline.package.policyIdentities,
    previousCurrentBaseline.package.policyIdentities,
  );
  assert.deepEqual(
    baseline.package.metadata.bin,
    previousCurrentBaseline.package.metadata.bin,
  );
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

test("change cases exercise the additive package process", () => {
  const cases = readJsonLines(
    new URL(
      "../spec/compatibility/0.8.0/change-cases.jsonl",
      import.meta.url,
    ),
  );
  const stabilityLevels = new Set(
    readJson(currentBaselineUrl).stabilityLevels.map((level) => level.id),
  );
  const classifications = new Set(["additive"]);
  const packageVersionEffects = new Set(["minor"]);

  assert.deepEqual(cases, [
    {
      id: "additive-distribution-readiness-profile",
      description:
        "Add Distribution Readiness Profile 0.1.0 as normative prose, a checked public API reference, an RFC, and a versioned machine-readable package subpath while preserving every existing runtime, type, CLI, connector, adapter, host contract, and runtime-security surface.",
      surface: "normative-stable",
      classification: "additive",
      packageVersionEffect: "minor",
      requiresRfc: true,
      requiresMigrationNotes: false,
      requiresDeprecation: false,
      rationale:
        "Existing imports and behavior remain unchanged; the new JSON subpath, prose, API reference, and RFC describe private distribution status without enabling npm publication, production claims, or new production dependencies.",
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
  assert.equal(cases.length, 1);
  assert.equal(
    readJson(currentBaselineUrl).normative.distributionReadiness.profile.packageSubpath,
    "./distribution-readiness/0.1.0",
  );
});
