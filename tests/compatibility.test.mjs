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
import * as hostConformanceApi from "../dist/host-conformance.js";
import * as referenceHostApi from "../dist/reference-host.js";
import * as sqliteApi from "../dist/stores/sqlite.js";
import * as connectorConformanceApi from "../dist/connector-conformance.js";
import * as teamMemoryConnectorApi from "../dist/connectors/team-memory.js";
import * as gitConnectorApi from "../dist/connectors/git.js";
import * as markdownCognitionApi from "../dist/markdown-cognition.js";
import * as durableWorkflowApi from "../dist/workflows/durable.js";
import * as sqliteWorkflowApi from "../dist/stores/sqlite-workflow.js";
import { CLI_CONTRACT } from "../dist/cli-contract.js";
import { WORKFLOW_CLI_CONTRACT } from "../dist/workflow-cli-contract.js";

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
  "../spec/compatibility/0.11.0/baseline.json",
  import.meta.url,
);
const currentChangeCasesUrl = new URL(
  "../spec/compatibility/0.11.0/change-cases.jsonl",
  import.meta.url,
);
const previousPrivatePackageBaselineUrl = new URL(
  "../spec/compatibility/0.10.0/baseline.json",
  import.meta.url,
);
const previousPrivatePackageChangeCasesUrl = new URL(
  "../spec/compatibility/0.10.0/change-cases.jsonl",
  import.meta.url,
);
const previousPackageBaselineUrl = new URL(
  "../spec/compatibility/0.9.0/baseline.json",
  import.meta.url,
);
const previousPackageChangeCasesUrl = new URL(
  "../spec/compatibility/0.9.0/change-cases.jsonl",
  import.meta.url,
);
const package080BaselineUrl = new URL(
  "../spec/compatibility/0.8.0/baseline.json",
  import.meta.url,
);
const package080ChangeCasesUrl = new URL(
  "../spec/compatibility/0.8.0/change-cases.jsonl",
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
  "33b561fb71a43e6224d91de535a77054d45959c12a34e28205c736307dedb764";
const expectedHistoricalPublicApiReferenceSha256 =
  "02d6732330cf2ffaeed5ae02fd809c2b7dbdee5ce77704dc81e4d21f0bc5596d";
// Publishing `packagePolicyVersion` `1.0.0` revises these two documents after
// immutable baseline `0.11.0` recorded them. The baseline keeps its recorded
// digests; the working tree carries the revised ones until baseline
// `1.0.0-rc.1` records them.
const policy100RevisedArtifactSha256 = Object.freeze({
  "docs/public-api.md":
    "095be301c4a762f23acdbf8eaec8f39b6870f96a7b721ac3f35611614a5b97d2",
  "rfcs/0012-phase-3-charter-and-stable-package.md":
    "91b751e8ae76edbf7809a817b2cd3c4823f6d92ac41df358a97cd4a23a02e1b4",
  "spec/distribution-readiness.md":
    "5bbd4bc2e69dbae573d3e1a9d4653d554ad22d19f1d9775ddc1269216f062d18",
});
// The same policy revision adds the candidate-profile and release-artifact
// rules to the distribution readiness prose after baseline `0.11.0` recorded
// twelve identifiers.
const policy100AddedDistributionReadinessRuleIds = Object.freeze([
  "DRP-013",
  "DRP-014",
  "DRP-015",
  "DRP-016",
]);
const expectedDistributionReadinessRfcSha256 =
  "967b0cc1b6584902c4d606bbdc7cf47f9801283a3f67d7a802152994dabc6da3";
const expectedDistributionReadinessProseSha256 =
  "72d583c3e83b3a8c909c421bb1aa65ece2fa7bbda9a5eaca665d5998c429e936";
const expectedDistributionReadinessProfileSha256 =
  "5d1d236c946820be65d04648b66ca215073810a908ad8d44da8f04f800909af9";
const expectedPackage080ChangeCasesSha256 =
  "9cb7bd259d2b84e7fb1f8839263bfae0d54eb2ba8aaa07de9f15957660244572";
const expectedPackage080BaselineSha256 =
  "29479b4119519724a29d02ba4e4c5ce6d3276a34f515c0c2f018859d22ca3c0e";
const expectedPreviousPackageBaselineSha256 =
  "4b426bfa572c79a51af317ecfec1806a2fe6f8a2ef38b9b598b25bbbd393ea1f";
const expectedPreviousPackageChangeCasesSha256 =
  "22ba5a27a3c60520ac3e45f2246941d8efe0145c282dcbe689575e1bb54dedc3";
const expectedPreviousPrivatePackageBaselineSha256 =
  "e20b19508a6a58a48d7cc5ae42d09b018551d1ecfa89736dff28ca6596476c99";
const expectedPreviousPrivatePackageChangeCasesSha256 =
  "3c74491fbac5ee0b3dea274e3b183f60c64ed54eedb1a50375377dbf0c4a051a";
const expectedGitRfcSha256 =
  "0f79f89056b9820ae59757f4004dd69024d7ee74a21ebd0da06de6bbf994bd4a";
const expectedInteroperabilityProseSha256 =
  "58deb989685c346c210745e7f9a31855f374ca5a7cf65258ce2f4ba1b8e0478f";
const expectedInteroperabilityProfileSha256 =
  "4b646debe6809367ab1ddceea5717e081279efc7854cf31aba5f406a3ec7c704";
const expectedInteroperabilitySourceRecordsSha256 =
  "42757122645c2e0650e2347eedc61ed302ee2d330f4d0bdf771271bc9f5f9ed6";
const expectedInteroperabilityPortableCognitionSha256 =
  "a140ef3a746f6cfa72d160ee056dfb26326c400fbf586d383dab6a651f522641";
const expectedInteroperabilityErrorsSha256 =
  "c0aeb321060cb4d0c40eb1ae80d93de43a1878e3665cdf31829fd3ad680b40a6";
const expectedInteroperabilityAcceptanceSha256 =
  "6050735446ef6108dc4a98606afc96719eba22e509066f5120302e0137e3a407";
const expectedGitConnectorGuideSha256 =
  "40d147e57b68cfcd92ffe2e1b5a3873f36413c2affb741c4a42de86af069da22";
const expectedCurrentChangeCasesSha256 =
  "c67d51d2ffc3dc6ec789c5262acc6e1d40118b8b4336ce6340d2456e1a4b56c4";
const expectedGitDeclarationSha256 =
  "9b968fac610f355181b3ad30bc99fff8f5e09f70a27a28a5c6b17ce02c9515ba";
const expectedRootDeclarationSha256 =
  "83d435dc12444e4da464ce56dda3b762d069d0e832736f750594802e34218ace";
const expectedPhase3ResourceDigests = Object.freeze({
  "rfcs/0012-phase-3-charter-and-stable-package.md":
    "a3b41212e723a5473bdef9d7e66f26bfe48e33e4fa4f68f221c7d97c205c7e11",
  "spec/collective-cognition-charter.md":
    "342f88f478a82fa55fdd087f57bab50cc5e6a0818c890e74d014c261b9122004",
  "spec/schemas/0.1.0/cognitive-object.schema.json":
    "a9b89aac5bfd31f34a2b89dc5813d3572550b40b512f75bd7d562ad9fa760562",
  "spec/schemas/0.1.0/cognition-event.schema.json":
    "10ab368fb61ad35d2bab07a048d5c9bf54dd13af64bf4bb54386253a1896869c",
  "spec/conformance/0.1.0/cognitive-object/valid.jsonl":
    "5ada78820b73dc87d54b05b946641764839606f5d04d0a2f10fab2d2eba13dbe",
  "spec/conformance/0.1.0/cognitive-object/invalid.jsonl":
    "05fbba2600b9bcceb269ba0b6841bf494952858efb455e3820c97056865af5a5",
  "spec/conformance/0.1.0/cognition-event/valid.jsonl":
    "75e0eaa162344ce37181b4e51d0908805ecb19f71a1030ced21c901a64ba945f",
  "spec/conformance/0.1.0/cognition-event/invalid.jsonl":
    "b67a5484b404b48d607262d8dc4dc4b0cc90e8af09bc2637dfcbfbc16e6fef2e",
  "spec/conformance/0.1.0/cognition-event/lifecycle.jsonl":
    "a76fac5d3ce4fae1118eeae5d97f59ee67b4763cce3af2f3134278e69a2f2222",
});
const expectedProjectionRuntimeExports = Object.freeze([
  "COGNITION_EVENT_PROJECTION_VERSION",
  "COGNITION_PROJECTION_MAX_JSON_DEPTH",
  "COGNITIVE_OBJECT_PROJECTION_VERSION",
  "deserializeCognitionEventProjection",
  "deserializeCognitiveObjectProjection",
  "validateCognitionEventProjection",
  "validateCognitiveObjectProjection",
]);
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
  "spec/compatibility/0.8.0/change-cases.jsonl":
    expectedPackage080ChangeCasesSha256,
  "spec/compatibility/0.9.0/change-cases.jsonl":
    expectedPreviousPackageChangeCasesSha256,
  "spec/compatibility/0.10.0/change-cases.jsonl":
    expectedPreviousPrivatePackageChangeCasesSha256,
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

const semanticVersionPattern =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function assertCompatibilityVersionFields(baseline, expectedVersion) {
  assert.match(baseline.baselineVersion, semanticVersionPattern);
  assert.match(baseline.appliesToPackageVersion, semanticVersionPattern);
  assert.equal(baseline.baselineVersion, expectedVersion);
  assert.equal(baseline.appliesToPackageVersion, expectedVersion);
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
    version: packageJson.version,
    private: packageJson.private,
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

test("historical compatibility 0.8.0 artifacts remain immutable", () => {
  assert.equal(
    sha256(readFileSync(package080BaselineUrl)),
    expectedPackage080BaselineSha256,
  );
  assert.equal(
    sha256(readFileSync(package080ChangeCasesUrl)),
    expectedPackage080ChangeCasesSha256,
  );
});

test("historical compatibility 0.9.0 artifacts remain immutable", () => {
  assert.equal(
    sha256(readFileSync(previousPackageBaselineUrl)),
    expectedPreviousPackageBaselineSha256,
  );
  assert.equal(
    sha256(readFileSync(previousPackageChangeCasesUrl)),
    expectedPreviousPackageChangeCasesSha256,
  );
});

test("historical compatibility 0.10.0 artifacts remain immutable", () => {
  assert.equal(
    sha256(readFileSync(previousPrivatePackageBaselineUrl)),
    expectedPreviousPrivatePackageBaselineSha256,
  );
  assert.equal(
    sha256(readFileSync(previousPrivatePackageChangeCasesUrl)),
    expectedPreviousPrivatePackageChangeCasesSha256,
  );
});

test("historical versioned resources remain byte-immutable", () => {
  const baseline = readJson(previousPrivatePackageBaselineUrl);

  Object.entries(baseline.normative.artifacts)
    .filter(([path]) => path.startsWith("spec/"))
    .forEach(([path, expectedDigest]) => {
      assert.equal(
        sha256(readFileSync(new URL(path, repositoryRoot))),
        policy100RevisedArtifactSha256[path] ?? expectedDigest,
        path,
      );
    });
});

test("compatibility version fields accept Semantic Versioning prereleases", () => {
  const baseline = readJson(previousPrivatePackageBaselineUrl);
  baseline.baselineVersion = "1.0.0-rc.1";
  baseline.appliesToPackageVersion = "1.0.0-rc.1";
  assertCompatibilityVersionFields(baseline, "1.0.0-rc.1");
});

test("package 0.11.0 baseline records the additive Charter and projection surface", () => {
  const baseline = readJson(currentBaselineUrl);
  const cases = readJsonLines(currentChangeCasesUrl);

  assertCompatibilityVersionFields(baseline, "0.11.0");
  assert.deepEqual(baseline.packageChange, {
    classification: "additive",
    packageVersionEffect: "minor-before-1.0",
  });
  assert.deepEqual(baseline.historicalBaselines["0.10.0"], {
    path: "spec/compatibility/0.10.0/baseline.json",
    sha256: expectedPreviousPrivatePackageBaselineSha256,
  });
  assert.deepEqual(baseline.collectiveCognitionCharter, {
    version: "1.0.0",
    packageSubpath: "./charter/1.0.0",
    path: "spec/collective-cognition-charter.md",
    sha256: expectedPhase3ResourceDigests[
      "spec/collective-cognition-charter.md"
    ],
    ruleIds: Array.from({ length: 25 }, (_, index) =>
      `CCC-${String(index + 1).padStart(3, "0")}`
    ),
  });
  assert.deepEqual(baseline.cognitiveObjectProjection, {
    version: "0.1.0",
    schemaSubpath: "./schemas/cognitive-object/0.1.0",
    validFixturesSubpath: "./conformance/cognitive-object/0.1.0/valid",
    invalidFixturesSubpath: "./conformance/cognitive-object/0.1.0/invalid",
    maxJsonDepth: 255,
    runtimeExports: [
      "COGNITIVE_OBJECT_PROJECTION_VERSION",
      "COGNITION_PROJECTION_MAX_JSON_DEPTH",
      "deserializeCognitiveObjectProjection",
      "validateCognitiveObjectProjection",
    ],
  });
  assert.deepEqual(baseline.cognitionEventProjection, {
    version: "0.1.0",
    schemaSubpath: "./schemas/cognition-event/0.1.0",
    validFixturesSubpath: "./conformance/cognition-event/0.1.0/valid",
    invalidFixturesSubpath: "./conformance/cognition-event/0.1.0/invalid",
    lifecycleFixturesSubpath:
      "./conformance/cognition-event/0.1.0/lifecycle",
    maxJsonDepth: 255,
    runtimeExports: [
      "COGNITION_EVENT_PROJECTION_VERSION",
      "COGNITION_PROJECTION_MAX_JSON_DEPTH",
      "deserializeCognitionEventProjection",
      "validateCognitionEventProjection",
    ],
  });
  assert.deepEqual(cases.map(({ id, classification, packageVersionEffect }) => ({
    id,
    classification,
    packageVersionEffect,
  })), [
    {
      id: "additive-collective-cognition-charter",
      classification: "additive",
      packageVersionEffect: "minor-before-1.0",
    },
    {
      id: "additive-standalone-cognition-projections",
      classification: "additive",
      packageVersionEffect: "minor-before-1.0",
    },
    {
      id: "additive-reference-projection-validators",
      classification: "additive",
      packageVersionEffect: "minor-before-1.0",
    },
    {
      id: "additive-private-phase-3-resource-package",
      classification: "additive",
      packageVersionEffect: "minor-before-1.0",
    },
  ]);
});

test("compatibility policy classifies the interoperability profile and workflow executable", () => {
  const policy = readFileSync(
    new URL("spec/compatibility.md", repositoryRoot),
    "utf8",
  );
  const normativeStableRow = policy
    .split("\n")
    .find((line) => line.startsWith("| Normative Stable |"));
  const supportedExperimentalRow = policy
    .split("\n")
    .find((line) => line.startsWith("| Supported Experimental |"));

  assert.match(
    normativeStableRow ?? "",
    /Cross-Connector Interoperability Profile `0\.1\.0`/,
  );
  assert.match(
    supportedExperimentalRow ?? "",
    /`collective-cognition-workflow`/,
  );
});

test("current baseline describes the additive private package 0.11.0 release", () => {
  const baseline = readJson(currentBaselineUrl);

  assertCompatibilityVersionFields(baseline, "0.11.0");
  assert.deepEqual(baseline.packageChange, {
    classification: "additive",
    packageVersionEffect: "minor-before-1.0",
  });
  assert.deepEqual(baseline.package.metadata.engines, {
    node: ">=24",
  });
  assert.equal(baseline.package.metadata.version, "0.11.0");
  assert.equal(baseline.package.metadata.private, true);
  assert.deepEqual(baseline.package.executableModes, {
    "dist/cli.js": 0o755,
    "dist/markdown-cognition-cli.js": 0o755,
    "dist/team-memory-cli.js": 0o755,
    "dist/workflow-cli.js": 0o755,
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
    "0.8.0": {
      path: "spec/compatibility/0.8.0/baseline.json",
      sha256: expectedPackage080BaselineSha256,
    },
    "0.9.0": {
      path: "spec/compatibility/0.9.0/baseline.json",
      sha256: expectedPreviousPackageBaselineSha256,
    },
    "0.10.0": {
      path: "spec/compatibility/0.10.0/baseline.json",
      sha256: expectedPreviousPrivatePackageBaselineSha256,
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
      "docs/acceptance/cross-connector-interoperability-0.1.0.md",
      "docs/durable-cognition-workflow-guide.md",
      "docs/git-connector-guide.md",
      "docs/public-api.md",
      "rfcs/0009-public-api-and-distribution-readiness.md",
      "rfcs/0010-durable-cognition-workflow.md",
      "rfcs/0011-cross-connector-interoperability.md",
      "rfcs/0012-phase-3-charter-and-stable-package.md",
      "spec/collective-cognition-charter.md",
      "spec/compatibility/0.1.0/change-cases.jsonl",
      "spec/compatibility/0.10.0/change-cases.jsonl",
      "spec/compatibility/0.11.0/change-cases.jsonl",
      "spec/compatibility/0.2.0/change-cases.jsonl",
      "spec/compatibility/0.3.0/change-cases.jsonl",
      "spec/compatibility/0.4.0/change-cases.jsonl",
      "spec/compatibility/0.5.0/change-cases.jsonl",
      "spec/compatibility/0.6.0/change-cases.jsonl",
      "spec/compatibility/0.7.0/change-cases.jsonl",
      "spec/compatibility/0.8.0/change-cases.jsonl",
      "spec/compatibility/0.9.0/change-cases.jsonl",
      "spec/conformance/0.1.0/cognition-event/invalid.jsonl",
      "spec/conformance/0.1.0/cognition-event/lifecycle.jsonl",
      "spec/conformance/0.1.0/cognition-event/valid.jsonl",
      "spec/conformance/0.1.0/cognitive-object/invalid.jsonl",
      "spec/conformance/0.1.0/cognitive-object/valid.jsonl",
      "spec/conformance/0.1.0/portable-cognition/cognitive-loop.jsonl",
      "spec/conformance/0.1.0/portable-cognition/invalid.jsonl",
      "spec/conformance/0.1.0/portable-cognition/valid.jsonl",
      "spec/conformance/0.1.0/source-record/invalid.jsonl",
      "spec/conformance/0.1.0/source-record/valid.jsonl",
      "spec/distribution-readiness.md",
      "spec/distribution-readiness/0.1.0/profile.json",
      "spec/interoperability.md",
      "spec/interoperability/0.1.0/error-cases.jsonl",
      "spec/interoperability/0.1.0/portable-cognition.jsonl",
      "spec/interoperability/0.1.0/profile.json",
      "spec/interoperability/0.1.0/source-records.jsonl",
      "spec/runtime-security.md",
      "spec/runtime-security/0.1.0/profile.json",
      "spec/schemas/0.1.0/cognition-event.schema.json",
      "spec/schemas/0.1.0/cognitive-object.schema.json",
      "spec/schemas/0.1.0/portable-cognition.schema.json",
      "spec/schemas/0.1.0/source-record.schema.json",
    ],
  );
  assert.equal(
    baseline.normative.artifacts["docs/git-connector-guide.md"],
    expectedGitConnectorGuideSha256,
  );
  assert.equal(
    baseline.normative.artifacts["spec/compatibility/0.11.0/change-cases.jsonl"],
    expectedCurrentChangeCasesSha256,
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
  assert.deepEqual(
    Object.fromEntries(
      Object.keys(expectedPhase3ResourceDigests).map((path) => [
        path,
        baseline.normative.artifacts[path],
      ]),
    ),
    expectedPhase3ResourceDigests,
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
    expectedPackage080ChangeCasesSha256,
  );
  assert.equal(
    baseline.normative.artifacts["spec/compatibility/0.9.0/change-cases.jsonl"],
    expectedPreviousPackageChangeCasesSha256,
  );
  assert.deepEqual(
    {
      rfc: baseline.normative.artifacts[
        "rfcs/0011-cross-connector-interoperability.md"
      ],
      prose: baseline.normative.artifacts["spec/interoperability.md"],
      profile: baseline.normative.artifacts[
        "spec/interoperability/0.1.0/profile.json"
      ],
      sourceRecords: baseline.normative.artifacts[
        "spec/interoperability/0.1.0/source-records.jsonl"
      ],
      portableCognition: baseline.normative.artifacts[
        "spec/interoperability/0.1.0/portable-cognition.jsonl"
      ],
      errors: baseline.normative.artifacts[
        "spec/interoperability/0.1.0/error-cases.jsonl"
      ],
      acceptance: baseline.normative.artifacts[
        "docs/acceptance/cross-connector-interoperability-0.1.0.md"
      ],
    },
    {
      rfc: expectedGitRfcSha256,
      prose: expectedInteroperabilityProseSha256,
      profile: expectedInteroperabilityProfileSha256,
      sourceRecords: expectedInteroperabilitySourceRecordsSha256,
      portableCognition: expectedInteroperabilityPortableCognitionSha256,
      errors: expectedInteroperabilityErrorsSha256,
      acceptance: expectedInteroperabilityAcceptanceSha256,
    },
  );
  assert.equal(
    sha256(readFileSync(new URL("docs/public-api.md", repositoryRoot))),
    policy100RevisedArtifactSha256["docs/public-api.md"],
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
    policy100RevisedArtifactSha256["spec/distribution-readiness.md"],
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
        new URL("spec/compatibility/0.9.0/change-cases.jsonl", repositoryRoot),
      ),
    ),
    expectedPreviousPackageChangeCasesSha256,
    "spec/compatibility/0.9.0/change-cases.jsonl",
  );
  Object.entries(baseline.normative.artifacts).forEach(
    ([path, expectedDigest]) => {
      assert.equal(
        sha256(readFileSync(new URL(path, repositoryRoot))),
        policy100RevisedArtifactSha256[path] ?? expectedDigest,
        path,
      );
    },
  );
  Object.keys(policy100RevisedArtifactSha256).forEach((path) => {
    assert.ok(
      Object.hasOwn(baseline.normative.artifacts, path),
      `${path} must stay a recorded baseline artifact`,
    );
    assert.notEqual(
      baseline.normative.artifacts[path],
      policy100RevisedArtifactSha256[path],
      `${path} must keep the immutable digest baseline 0.11.0 recorded`,
    );
  });
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
      sha256: expectedHistoricalPublicApiReferenceSha256,
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
    [
      ...baseline.normative.distributionReadiness.ruleIds,
      ...policy100AddedDistributionReadinessRuleIds,
    ],
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
  const previousCurrentBaseline = readJson(previousPrivatePackageBaselineUrl);

  assert.deepEqual(
    Object.keys(publicApi).sort(),
    baseline.package.runtimeExports,
  );
  assert.deepEqual(
    Object.values(publicApi.DomainErrorCode).sort(),
    baseline.package.errorCodes,
  );
  assert.deepEqual(
    baseline.package.errorCodes,
    previousCurrentBaseline.package.errorCodes,
    "package 0.11 must preserve the exhaustive package 0.10 DomainErrorCode inventory",
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
    [
      ...previousCurrentBaseline.package.runtimeExports,
      ...expectedProjectionRuntimeExports,
    ].sort(),
    "package 0.11 root runtime inventory must equal the complete package 0.10 inventory plus the seven projection exports",
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

test("host and store subpath contracts match exact additive inventories", () => {
  const baseline = readJson(currentBaselineUrl);

  assert.deepEqual(baseline.hostConformance, {
    version: "0.1.0",
    packageSubpath: "./host-conformance/0.1.0",
    runtimeExports: ["runCognitionHostConformance"],
    typeExports: [
      "CognitionHostConformanceCaseResult",
      "CognitionHostConformanceFactory",
      "CognitionHostConformanceReport",
    ],
  });
  assert.deepEqual(
    Object.keys(hostConformanceApi).sort(),
    baseline.hostConformance.runtimeExports,
  );
  assert.deepEqual(
    directDeclarationTypeExports("dist/host-conformance.d.ts"),
    baseline.hostConformance.typeExports,
  );

  assert.deepEqual(baseline.referenceHost, {
    version: "0.1.0",
    packageSubpath: "./reference-host/0.1.0",
    runtimeExports: [
      "InMemoryCognitionEventPublisher",
      "InMemoryCognitionStore",
    ],
    typeExports: [],
  });
  assert.deepEqual(
    Object.keys(referenceHostApi).sort(),
    baseline.referenceHost.runtimeExports,
  );
  assert.deepEqual(
    directDeclarationTypeExports("dist/reference-host.d.ts"),
    baseline.referenceHost.typeExports,
  );

  assert.deepEqual(baseline.sqlite, {
    version: "0.1.0",
    packageSubpath: "./stores/sqlite/0.1.0",
    runtimeExports: ["SqliteCognitionStore"],
    typeExports: ["SqliteCognitionStoreOptions"],
  });
  assert.deepEqual(
    Object.keys(sqliteApi).sort(),
    baseline.sqlite.runtimeExports,
  );
  assert.deepEqual(
    directDeclarationTypeExports("dist/stores/sqlite.d.ts"),
    baseline.sqlite.typeExports,
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

  assert.deepEqual(
    Object.keys(gitConnectorApi).sort(),
    baseline.gitConnector.runtimeExports,
  );
  assert.deepEqual(
    directDeclarationTypeExports("dist/connectors/git.d.ts"),
    baseline.gitConnector.typeExports,
  );
  assert.deepEqual(
    declarationStringUnion(
      "dist/connectors/git.d.ts",
      /export type GitConnectorErrorCode = ([^;]+);/,
    ),
    baseline.gitConnector.errorCodes,
  );
  assert.equal(gitConnectorApi.GIT_REPOSITORY_FORMAT, "git-repository/1");
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

test("durable workflow subpaths and CLI match exact additive inventories", () => {
  const baseline = readJson(currentBaselineUrl);

  assert.deepEqual(baseline.durableWorkflow, {
    version: "0.1.0",
    packageSubpath: "./workflows/durable/0.1.0",
    runtimeExports: [
      "DURABLE_COGNITION_WORKFLOW_VERSION",
      "prepareDurableCognitionWorkflow",
      "runDurableCognitionWorkflow",
      "runDurableWorkflowStoreConformance",
    ],
    typeExports: [
      "CognitionWorkflowStore",
      "DurableCognitionCommitResult",
      "DurableCognitionProjectionStatus",
      "DurableCognitionProjector",
      "DurableCognitionPublicationStatus",
      "DurableCognitionWorkflowCommitted",
      "DurableCognitionWorkflowCompletion",
      "DurableCognitionWorkflowConflict",
      "DurableCognitionWorkflowFailure",
      "DurableCognitionWorkflowHost",
      "DurableCognitionWorkflowRequest",
      "DurableCognitionWorkflowResult",
      "DurableCognitionWorkflowUnprojected",
      "DurableCognitionWorkflowUnpublished",
      "DurableCognitionWorkflowUnpublishedAndUnprojected",
      "DurableWorkflowConflictCode",
      "DurableWorkflowConformanceCaseResult",
      "DurableWorkflowConformanceReport",
      "DurableWorkflowStoreConformanceScenario",
      "DurableWorkflowStoreFactory",
      "PreparedDurableCognitionCommit",
    ],
  });
  assert.deepEqual(
    Object.keys(durableWorkflowApi).sort(),
    baseline.durableWorkflow.runtimeExports,
  );
  assert.deepEqual(
    directDeclarationTypeExports("dist/workflows/durable.d.ts"),
    baseline.durableWorkflow.typeExports,
  );

  assert.deepEqual(baseline.sqliteWorkflow, {
    version: "0.1.0",
    packageSubpath: "./stores/sqlite-workflow/0.1.0",
    runtimeExports: ["SqliteCognitionWorkflowStore"],
    typeExports: ["SqliteCognitionWorkflowStoreOptions"],
  });
  assert.deepEqual(
    Object.keys(sqliteWorkflowApi).sort(),
    baseline.sqliteWorkflow.runtimeExports,
  );
  assert.deepEqual(
    directDeclarationTypeExports("dist/stores/sqlite-workflow.d.ts"),
    baseline.sqliteWorkflow.typeExports,
  );
  assert.deepEqual(baseline.workflowCli, {
    version: "0.1.0",
    binaryName: "collective-cognition-workflow",
    commandNames: ["run"],
    formats: ["json", "jsonl"],
    policyIds: ["neutral-evidence-v1"],
    defaults: {
      maxInputBytes: 10_485_760,
      maxRecords: 10_000,
      maxRecordBytes: 1_048_576,
      maxRequestBytes: 1_048_576,
    },
    runtime: {
      stability: "supported-experimental",
      node: ">=24.14.0",
      requiredCapabilities: [
        "DatabaseSync.prototype.enableDefensive",
      ],
    },
    publisherSupported: false,
  });
  assert.deepEqual([...WORKFLOW_CLI_CONTRACT.commands], baseline.workflowCli.commandNames);
  assert.deepEqual([...WORKFLOW_CLI_CONTRACT.formats], baseline.workflowCli.formats);
  assert.deepEqual([...WORKFLOW_CLI_CONTRACT.policyIds], baseline.workflowCli.policyIds);
  assert.deepEqual(WORKFLOW_CLI_CONTRACT.defaults, baseline.workflowCli.defaults);
  assert.deepEqual(WORKFLOW_CLI_CONTRACT.runtime, baseline.workflowCli.runtime);
});

test("public declaration entrypoint closures match exact independent digests", () => {
  const baseline = readJson(currentBaselineUrl);
  const previousCurrentBaseline = readJson(previousPrivatePackageBaselineUrl);
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
    gitConnector: {
      packageSubpath: "./connectors/git/0.1.0",
      declarationEntrypoint: "dist/connectors/git.d.ts",
    },
    markdownCognition: {
      packageSubpath: "./adapters/markdown/0.1.0",
      declarationEntrypoint: "dist/markdown-cognition.d.ts",
    },
    durableWorkflow: {
      packageSubpath: "./workflows/durable/0.1.0",
      declarationEntrypoint: "dist/workflows/durable.d.ts",
    },
    sqliteWorkflow: {
      packageSubpath: "./stores/sqlite-workflow/0.1.0",
      declarationEntrypoint: "dist/stores/sqlite-workflow.d.ts",
    },
  };

  assert.deepEqual(
    Object.keys(baseline.package.declarations),
    Object.keys(entrypoints),
  );
  assert.deepEqual(
    baseline.package.declarations.root.files,
    [
      ...previousCurrentBaseline.package.declarations.root.files,
      "dist/cognition-projections.d.ts",
    ].sort(),
    "package 0.11 root declaration closure must equal the complete package 0.10 closure plus the projection declaration",
  );
  assert.deepEqual(
    baseline.package.declarations.sqlite,
    previousCurrentBaseline.package.declarations.sqlite,
    "the historical SQLite subpath declaration closure must remain byte-compatible with 0.9",
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
  assert.equal(
    baseline.package.declarations.gitConnector.sha256,
    expectedGitDeclarationSha256,
  );
  assert.equal(
    baseline.package.declarations.root.sha256,
    expectedRootDeclarationSha256,
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
  const previousPackageBaseline = readJson(previousPrivatePackageBaselineUrl);

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
    previousPackageBaseline.package.metadata.bin,
    "package 0.11 must not add or remove an executable",
  );
  assert.deepEqual(baseline.package.executableModes, previousPackageBaseline.package.executableModes);
  assert.deepEqual(baseline.teamMemoryCli, previousPackageBaseline.teamMemoryCli);
  assert.deepEqual(baseline.workflowCli, previousPackageBaseline.workflowCli);
  assert.deepEqual(baseline.markdownCognition.cli, previousPackageBaseline.markdownCognition.cli);
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
  const cases = readJsonLines(currentChangeCasesUrl);
  const stabilityLevels = new Set(
    readJson(currentBaselineUrl).stabilityLevels.map((level) => level.id),
  );
  const classifications = new Set(["additive"]);
  const packageVersionEffects = new Set(["minor-before-1.0"]);

  assert.deepEqual(cases.map((changeCase) => changeCase.id), [
    "additive-collective-cognition-charter",
    "additive-standalone-cognition-projections",
    "additive-reference-projection-validators",
    "additive-private-phase-3-resource-package",
  ]);
  cases.forEach((changeCase) => {
    assert.deepEqual(Object.keys(changeCase), [
      "id",
      "description",
      "surface",
      "classification",
      "packageVersionEffect",
      "requiresRfc",
      "requiresMigrationNotes",
      "requiresDeprecation",
      "addedPackageSubpaths",
      "addedExecutables",
      "rootRuntimeExportsChanged",
      "rootTypeExportsChanged",
      "rationale",
    ]);
    assert.equal(changeCase.requiresRfc, true);
    assert.equal(changeCase.requiresMigrationNotes, false);
    assert.equal(changeCase.requiresDeprecation, false);
    assert.deepEqual(changeCase.addedExecutables, []);
    assert.equal(changeCase.rootTypeExportsChanged, false);
  });
  assert.deepEqual(
    cases.flatMap((changeCase) => changeCase.addedPackageSubpaths),
    [
      "./charter/1.0.0",
      "./schemas/cognitive-object/0.1.0",
      "./schemas/cognition-event/0.1.0",
      "./conformance/cognitive-object/0.1.0/valid",
      "./conformance/cognitive-object/0.1.0/invalid",
      "./conformance/cognition-event/0.1.0/valid",
      "./conformance/cognition-event/0.1.0/invalid",
      "./conformance/cognition-event/0.1.0/lifecycle",
      "./compatibility/0.11.0",
    ],
  );
  assert.deepEqual(
    cases.filter((changeCase) => changeCase.rootRuntimeExportsChanged)
      .map((changeCase) => changeCase.id),
    ["additive-reference-projection-validators"],
  );
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
    4,
  );
  assert.equal(cases.length, 4);
  assert.equal(
    readJson(currentBaselineUrl).normative.distributionReadiness.profile.packageSubpath,
    "./distribution-readiness/0.1.0",
  );
});

const compatibilityPolicyUrl = new URL(
  "spec/compatibility.md",
  repositoryRoot,
);
const stablePolicyMigrationUrl = new URL(
  "docs/migrations/1.0.0.md",
  repositoryRoot,
);
const policy010BaselineVersions = Object.freeze([
  "0.1.0",
  "0.2.0",
  "0.3.0",
  "0.4.0",
  "0.5.0",
  "0.6.0",
  "0.7.0",
  "0.8.0",
  "0.9.0",
  "0.10.0",
  "0.11.0",
]);
const policy100StablePublicApiSubpaths = Object.freeze(["."]);
const policy100StableIntrospectionSubpaths = Object.freeze(["./package.json"]);
const policy100SupportedExperimentalSubpaths = Object.freeze([
  "./adapters/markdown/0.1.0",
  "./connector-conformance/0.1.0",
  "./connectors/git/0.1.0",
  "./connectors/team-memory/0.1.0",
  "./host-conformance/0.1.0",
  "./reference-host/0.1.0",
  "./stores/sqlite/0.1.0",
  "./stores/sqlite-workflow/0.1.0",
  "./workflows/durable/0.1.0",
]);
const policy100StablePublicApiExecutables = Object.freeze([
  "collective-cognition",
]);
const policy100SupportedExperimentalExecutables = Object.freeze([
  "collective-cognition-markdown",
  "collective-cognition-teammem",
  "collective-cognition-workflow",
]);
const policy100Classifications = Object.freeze([
  "stable-public-api",
  "normative-stable",
  "supported-experimental",
  "stable-introspection",
]);
const stableSurfaceClassificationHeading =
  "### STAB-002 — Stable Surface Classification";

function policyDocument() {
  return readFileSync(compatibilityPolicyUrl, "utf8");
}

function policySection(policy, startHeading, endHeading) {
  const start = policy.indexOf(startHeading);
  assert.notEqual(start, -1, `${startHeading} must exist`);
  const end = endHeading === null ? policy.length : policy.indexOf(endHeading);
  assert.ok(end > start, `${endHeading} must follow ${startHeading}`);
  return policy.slice(start, end);
}

function stableSurfaceClassification(policy) {
  const section = policySection(
    policy,
    stableSurfaceClassificationHeading,
    null,
  );
  const opening = "```text\n";
  const fenceStart = section.indexOf(opening);
  assert.notEqual(
    fenceStart,
    -1,
    "STAB-002 must publish a machine-readable classification block",
  );
  const bodyStart = fenceStart + opening.length;
  const fenceEnd = section.indexOf("\n```", bodyStart);
  assert.notEqual(fenceEnd, -1, "the classification block must be closed");

  return section
    .slice(bodyStart, fenceEnd)
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const fields = line.split(" | ");
      assert.equal(
        fields.length,
        3,
        `classification entry must name a classification, kind, and surface: ${line}`,
      );
      return {
        classification: fields[0],
        kind: fields[1],
        surface: fields[2],
      };
    });
}

function sortedClassificationEntries(entries) {
  return [...entries].sort((left, right) =>
    `${left.kind} ${left.surface}`.localeCompare(
      `${right.kind} ${right.surface}`,
    ),
  );
}

function expectedStableSurfaceClassification(baseline) {
  const entries = [];
  const add = (classification, kind, surfaces) => {
    surfaces.forEach((surface) => {
      entries.push({ classification, kind, surface });
    });
  };

  add(
    "stable-public-api",
    "root-runtime-export",
    baseline.package.runtimeExports,
  );
  add("stable-public-api", "root-type-export", baseline.package.typeExports);
  add("stable-public-api", "root-error-code", baseline.package.errorCodes);
  add("stable-public-api", "package-subpath", policy100StablePublicApiSubpaths);
  add(
    "stable-introspection",
    "package-subpath",
    policy100StableIntrospectionSubpaths,
  );
  add(
    "supported-experimental",
    "package-subpath",
    policy100SupportedExperimentalSubpaths,
  );
  add(
    "normative-stable",
    "package-subpath",
    Object.keys(baseline.package.metadata.exports).filter(
      (subpath) =>
        !policy100StablePublicApiSubpaths.includes(subpath) &&
        !policy100StableIntrospectionSubpaths.includes(subpath) &&
        !policy100SupportedExperimentalSubpaths.includes(subpath),
    ),
  );
  add("stable-public-api", "executable", policy100StablePublicApiExecutables);
  add(
    "supported-experimental",
    "executable",
    policy100SupportedExperimentalExecutables,
  );
  add(
    "stable-introspection",
    "package-field",
    Object.keys(baseline.package.metadata),
  );

  return sortedClassificationEntries(entries);
}

test("the stable 1.0.0 matrix classifies every package surface exactly once", () => {
  const baseline = readJson(currentBaselineUrl);
  const entries = stableSurfaceClassification(policyDocument());

  const seen = new Set();
  entries.forEach((entry) => {
    const key = `${entry.kind} | ${entry.surface}`;
    assert.equal(seen.has(key), false, `${key} must be classified exactly once`);
    seen.add(key);
    assert.ok(
      policy100Classifications.includes(entry.classification),
      `${key} has unknown classification ${entry.classification}`,
    );
  });

  const surfacesOfKind = (kind) =>
    sorted(
      entries
        .filter((entry) => entry.kind === kind)
        .map((entry) => entry.surface),
    );

  assert.deepEqual(
    surfacesOfKind("root-runtime-export"),
    baseline.package.runtimeExports,
  );
  assert.deepEqual(
    surfacesOfKind("root-type-export"),
    baseline.package.typeExports,
  );
  assert.deepEqual(
    surfacesOfKind("root-error-code"),
    baseline.package.errorCodes,
  );
  assert.deepEqual(
    surfacesOfKind("package-subpath"),
    sorted(Object.keys(baseline.package.metadata.exports)),
  );
  assert.deepEqual(
    surfacesOfKind("executable"),
    sorted(Object.keys(baseline.package.metadata.bin)),
  );
  assert.deepEqual(
    surfacesOfKind("package-field"),
    sorted(Object.keys(baseline.package.metadata)),
  );

  assert.deepEqual(
    sortedClassificationEntries(entries),
    expectedStableSurfaceClassification(baseline),
  );
});

test("every existing compatibility baseline still records packagePolicyVersion 0.1.0", () => {
  policy010BaselineVersions.forEach((version) => {
    const baseline = readJson(
      new URL(`spec/compatibility/${version}/baseline.json`, repositoryRoot),
    );
    assert.equal(baseline.packagePolicyVersion, "0.1.0", version);
  });
});

test("the policy publishes packagePolicyVersion 1.0.0 beside retained 0.1.0 rules", () => {
  const policy = policyDocument();

  assert.match(policy, /^## Policy Versions$/m);
  assert.match(policy, /^## Policy `0\.1\.0` \(Retained\)$/m);
  assert.match(policy, /^## Policy `1\.0\.0`$/m);

  const retained = policySection(
    policy,
    "## Policy `0.1.0` (Retained)",
    "## Policy `1.0.0`",
  );
  const stable = policySection(policy, "## Policy `1.0.0`", null);

  Array.from(
    { length: 18 },
    (_, index) => `COMP-${String(index + 1).padStart(3, "0")}`,
  ).forEach((ruleId) => {
    assert.match(retained, new RegExp(`^### ${ruleId} — `, "m"), ruleId);
  });
  assert.match(
    retained,
    /Before `1\.0\.0`, a minor release MAY make a breaking Supported Experimental change only through an accepted RFC/,
  );
  assert.match(
    retained,
    /- Before `1\.0\.0`, `MINOR` MAY contain a reviewed breaking Supported Experimental change only through the full process in `COMP-003`\./,
  );

  Array.from(
    { length: 6 },
    (_, index) => `STAB-${String(index + 1).padStart(3, "0")}`,
  ).forEach((ruleId) => {
    assert.match(stable, new RegExp(`^### ${ruleId} — `, "m"), ruleId);
  });
  assert.match(
    stable,
    /`minor-before-1\.0` applies only under `packagePolicyVersion` `0\.1\.0`/,
  );
  assert.match(
    stable,
    /Supported Experimental is an operational-maturity label/,
  );
  assert.match(stable, /package `2\.0\.0` or a new retained versioned subpath/);
  assert.match(
    stable,
    /Compatibility baseline `1\.0\.0-rc\.1` and every later baseline MUST record `packagePolicyVersion` `1\.0\.0`/,
  );
});

test("migration guidance separates support guarantees from record meaning", () => {
  const migration = readFileSync(stablePolicyMigrationUrl, "utf8");

  assert.match(migration, /^# Migrating from package `0\.11\.0` to `1\.0\.0`$/m);
  assert.match(migration, /support guarantees/i);
  assert.match(
    migration,
    /Portable Cognition `0\.1\.0` record meaning does not change/,
  );
  assert.match(migration, /`packagePolicyVersion` `1\.0\.0`/);
});
