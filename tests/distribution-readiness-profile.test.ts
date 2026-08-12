import assert from "node:assert/strict";
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import {
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
  win32,
} from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const packageJsonUrl = new URL("../package.json", import.meta.url);
const profileUrl = new URL(
  "../spec/distribution-readiness/0.1.0/profile.json",
  import.meta.url,
);
const githubPrereleaseUrl = new URL(
  "../docs/github-prerelease.md",
  import.meta.url,
);
const distributionReadinessProseUrl = new URL(
  "../spec/distribution-readiness.md",
  import.meta.url,
);
const distributionReadinessRfcUrl = new URL(
  "../rfcs/0009-public-api-and-distribution-readiness.md",
  import.meta.url,
);
const publicApiReferenceUrl = new URL("../docs/public-api.md", import.meta.url);
const implementationPlanUrl = new URL(
  "../docs/superpowers/plans/2026-08-12-public-api-distribution-readiness.md",
  import.meta.url,
);

const allowedTopLevelKeys = [
  "profileVersion",
  "describesPackageVersion",
  "overallStatus",
  "channels",
  "gates",
  "npmBlockers",
  "nonClaims",
];

const expectedChannels = [
  { id: "public-source", status: "available" },
  {
    id: "github-prerelease",
    status: "available",
    historicalRelease: {
      tag: "v0.6.0",
      packageVersion: "0.6.0",
      commitSha: "76f289b7f1514f4bc490d0de6dbffbb61a4c9f0e",
    },
  },
  { id: "npm-registry", status: "blocked" },
  { id: "production-use", status: "not-claimed" },
];

const expectedGates = [
  {
    id: "DRP-GATE-001",
    status: "satisfied",
    rationale:
      "Public source evidence and Apache-2.0 attribution files are present in the repository.",
    evidence: ["LICENSE", "NOTICE", "CITATION.cff", "package.json"],
  },
  {
    id: "DRP-GATE-002",
    status: "satisfied",
    rationale:
      "The GitHub prerelease evidence remains a historical immutable record rather than current publication authority.",
    evidence: ["docs/github-prerelease.md", "tests/release-readiness.test.ts"],
  },
  {
    id: "DRP-GATE-003",
    status: "blocked",
    rationale:
      "npm registry readiness remains blocked while the package stays private and registry-name verification is unresolved.",
    evidence: ["package.json", "tests/package.test.mjs"],
  },
  {
    id: "DRP-GATE-004",
    status: "blocked",
    rationale:
      "Accountable human publication approval remains a required separate release decision.",
    evidence: ["spec/distribution-readiness.md", "rfcs/0009-public-api-and-distribution-readiness.md"],
  },
  {
    id: "DRP-GATE-005",
    status: "not-claimed",
    rationale:
      "Production use remains a host-owned responsibility and is not claimed by this repository.",
    evidence: ["spec/runtime-security.md", "rfcs/0008-runtime-security-profile.md"],
  },
];

const expectedNpmBlockers = [
  {
    id: "DRP-NPM-001",
    status: "blocked",
    rationale: "Registry-name verification has not been completed.",
    evidence: ["package.json", "tests/package.test.mjs"],
  },
  {
    id: "DRP-NPM-002",
    status: "blocked",
    rationale: "No accountable human publication approval has been recorded.",
    evidence: ["spec/distribution-readiness.md", "rfcs/0009-public-api-and-distribution-readiness.md"],
  },
];

const expectedNonClaims = [
  {
    id: "DRP-NC-001",
    status: "not-claimed",
    statement: "The profile does not claim publication authority.",
  },
  {
    id: "DRP-NC-002",
    status: "not-claimed",
    statement: "The profile does not claim security certification.",
  },
  {
    id: "DRP-NC-003",
    status: "not-claimed",
    statement: "The profile does not claim production readiness.",
  },
  {
    id: "DRP-NC-004",
    status: "not-claimed",
    statement: "The profile does not claim endorsement.",
  },
  {
    id: "DRP-NC-005",
    status: "not-claimed",
    statement: "The profile does not claim long-term support.",
  },
];

const expectedDrpRuleMeanings = {
  "DRP-001": "The profile version and described package version MUST be explicit.",
  "DRP-002": "Status values and object members MUST use the closed profile vocabulary.",
  "DRP-003":
    "npm publication MUST remain blocked while package.json is private or any mandatory npm gate is not satisfied.",
  "DRP-004":
    "Registry-name availability MUST remain unverified until checked against the registry at release time.",
  "DRP-005":
    "Explicit accountable-human approval MUST be a mandatory npm publication gate.",
  "DRP-006":
    "Production readiness MUST be reported separately from package or prerelease availability.",
  "DRP-007":
    "Every satisfied repository-controlled gate MUST point to existing evidence; external gates MUST NOT be represented as repository-verified.",
  "DRP-008":
    "The public API reference MUST enumerate every baseline root export, package subpath, and executable.",
  "DRP-009":
    "Stability labels MUST match the compatibility policy and MUST NOT upgrade Supported Experimental surfaces implicitly.",
  "DRP-010":
    "Reading or importing the profile MUST NOT publish, authenticate, certify, endorse, or configure a host.",
  "DRP-011":
    "Profile replacement MUST use a new version and preserve previously distributed bytes.",
  "DRP-012":
    "Package contents MUST include the public reference, normative prose, machine profile, RFC, and compatibility evidence while excluding implementation plans.",
};

const allowedOverallStatuses = ["ready", "blocked", "not-claimed"];
const allowedChannelStatuses = ["available", "blocked", "not-claimed"];
const allowedGateStatuses = ["satisfied", "blocked", "not-claimed"];
const allowedNonClaimStatuses = ["not-claimed"];

function readProfile(): Record<string, unknown> {
  return JSON.parse(readFileSync(profileUrl, "utf8")) as Record<string, unknown>;
}

function readText(url: URL): string {
  return readFileSync(url, "utf8");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeNormativeMeaning(value: string): string {
  return value.replace(/`([^`]+)`/g, "$1").replace(/\s+/g, " ").trim();
}

function drpRuleMeanings(markdown: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const lines = markdown.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index]!.match(/^## (DRP-\d{3})$/);
    if (heading === null) {
      continue;
    }

    const body: string[] = [];
    for (index += 1; index < lines.length && !lines[index]!.startsWith("## "); index += 1) {
      body.push(lines[index]!);
    }
    index -= 1;
    sections[heading[1]!] = normalizeNormativeMeaning(body.join("\n"));
  }

  return sections;
}

function documentedSubpathExportInventory(
  markdown: string,
  packageSubpath: string,
): { runtimeExports: string[]; typeExports: string[] } {
  const marker = `- \`${packageSubpath}\` —`;
  const start = markdown.indexOf(marker);
  assert.notEqual(start, -1, `${packageSubpath} must have a documented subpath block`);
  const next = markdown.indexOf("\n- `", start + marker.length);
  const block = markdown.slice(start, next === -1 ? markdown.length : next);

  const inventory = (label: "Runtime exports" | "Type exports"): string[] => {
    const match = block.match(new RegExp(`^  - ${label}: (.+)$`, "m"));
    assert.ok(match?.[1], `${packageSubpath} must document ${label.toLowerCase()}`);
    if (match[1] === "none.") {
      return [];
    }
    return [...match[1].matchAll(/`([^`]+)`/g)].map((token) => token[1]!);
  };

  return {
    runtimeExports: inventory("Runtime exports"),
    typeExports: inventory("Type exports"),
  };
}

function assertSingleLineText(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string") {
    assert.fail(`${label} must be a string`);
  }

  assert.equal(value.trim(), value, `${label} must be trimmed`);
  assert.notEqual(value.length, 0, `${label} must not be empty`);
  assert.equal(value.includes("\n"), false, `${label} must be single-line`);
}

function resolveRepositoryEvidencePath(evidencePath: string): string {
  const normalizedEvidencePath = evidencePath.replaceAll("\\", "/");

  assert.equal(
    isAbsolute(normalizedEvidencePath) || win32.isAbsolute(evidencePath),
    false,
    "evidence path must be repository-relative",
  );

  const resolvedEvidencePath = resolve(repositoryRoot, normalizedEvidencePath);
  const repositoryRelativePath = relative(repositoryRoot, resolvedEvidencePath);

  assert.equal(
    isAbsolute(repositoryRelativePath) ||
      repositoryRelativePath === ".." ||
      repositoryRelativePath.startsWith(`..${sep}`),
    false,
    "evidence path must stay inside the repository",
  );

  lstatSync(resolvedEvidencePath);
  const canonicalRepositoryRoot = realpathSync(repositoryRoot);
  const canonicalEvidencePath = realpathSync(resolvedEvidencePath);
  const canonicalRepositoryRelativePath = relative(
    canonicalRepositoryRoot,
    canonicalEvidencePath,
  );

  assert.equal(
    isAbsolute(canonicalRepositoryRelativePath) ||
      canonicalRepositoryRelativePath === ".." ||
      canonicalRepositoryRelativePath.startsWith(`..${sep}`),
    false,
    "evidence path must stay inside the repository after resolving symlinks",
  );

  return canonicalEvidencePath;
}

function assertRepositoryEvidencePath(evidencePath: unknown, label: string): asserts evidencePath is string {
  assertSingleLineText(evidencePath, label);
  let resolvedEvidencePath: string;
  try {
    resolvedEvidencePath = resolveRepositoryEvidencePath(evidencePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      assert.fail(`${label} must resolve to an existing repository file`);
    }
    throw error;
  }
  const stats = statSync(resolvedEvidencePath);
  assert.ok(stats.isFile(), `${label} must resolve to an existing repository file`);
}

function assertDistributionReadinessProfile(profile: Record<string, unknown>): void {
  assert.deepEqual(
    Object.keys(profile),
    allowedTopLevelKeys,
    "profile top-level keys must match the closed vocabulary",
  );

  assert.equal(profile.profileVersion, "0.1.0");
  assert.equal(profile.describesPackageVersion, "0.8.0");
  assert.equal(profile.overallStatus, "blocked");
  assert.ok(
    allowedOverallStatuses.includes(profile.overallStatus as (typeof allowedOverallStatuses)[number]),
    "overallStatus must use the closed vocabulary",
  );

  assert.ok(Array.isArray(profile.channels), "channels must be an array");
  assert.ok(Array.isArray(profile.gates), "gates must be an array");
  assert.ok(Array.isArray(profile.npmBlockers), "npmBlockers must be an array");
  assert.ok(Array.isArray(profile.nonClaims), "nonClaims must be an array");

  const channels = profile.channels as Array<Record<string, unknown>>;
  const gates = profile.gates as Array<Record<string, unknown>>;
  const npmBlockers = profile.npmBlockers as Array<Record<string, unknown>>;
  const nonClaims = profile.nonClaims as Array<Record<string, unknown>>;

  assert.equal(
    new Set(channels.map((channel) => channel.id)).size,
    channels.length,
    "channel IDs must be unique",
  );
  assert.equal(
    new Set(gates.map((gate) => gate.id)).size,
    gates.length,
    "gate IDs must be unique",
  );
  assert.equal(
    new Set(npmBlockers.map((blocker) => blocker.id)).size,
    npmBlockers.length,
    "npm blocker IDs must be unique",
  );
  assert.equal(
    new Set(nonClaims.map((nonClaim) => nonClaim.id)).size,
    nonClaims.length,
    "non-claim IDs must be unique",
  );

  for (const channel of channels) {
    assert.deepEqual(
      Object.keys(channel),
      channel.id === "github-prerelease"
        ? ["id", "status", "historicalRelease"]
        : ["id", "status"],
    );
    assertSingleLineText(channel.id, "channel.id");
    assert.ok(expectedChannels.some((expected) => expected.id === channel.id), `${channel.id} must be recognized`);
    assert.ok(
      allowedChannelStatuses.includes(channel.status as (typeof allowedChannelStatuses)[number]),
      `${channel.id}.status must be recognized`,
    );
    if (channel.id === "github-prerelease") {
      const historicalRelease = channel.historicalRelease as Record<string, unknown>;
      assert.deepEqual(Object.keys(historicalRelease), ["tag", "packageVersion", "commitSha"]);
      assert.deepEqual(historicalRelease, expectedChannels[1].historicalRelease);
      assert.equal(
        readText(githubPrereleaseUrl).includes("v0.6.0"),
        true,
        "github prerelease evidence must include the historical release tag",
      );
      assert.equal(
        readText(githubPrereleaseUrl).includes("private, unpublished package `0.6.0`"),
        true,
        "github prerelease evidence must include the exact historical package-version phrase",
      );
      assert.equal(
        readText(githubPrereleaseUrl).includes("76f289b7f1514f4bc490d0de6dbffbb61a4c9f0e"),
        true,
        "github prerelease evidence must include the historical release commit",
      );
      assert.equal(
        readText(distributionReadinessProseUrl).includes("v0.6.0"),
        true,
        "distribution readiness prose must name the historical prerelease tag",
      );
      assert.equal(
        readText(distributionReadinessProseUrl).includes("76f289b7f1514f4bc490d0de6dbffbb61a4c9f0e"),
        true,
        "distribution readiness prose must name the historical prerelease commit",
      );
      assert.equal(
        readText(distributionReadinessRfcUrl).includes("v0.6.0"),
        true,
        "RFC 0009 must name the historical prerelease tag",
      );
      assert.equal(
        readText(distributionReadinessRfcUrl).includes("76f289b7f1514f4bc490d0de6dbffbb61a4c9f0e"),
        true,
        "RFC 0009 must name the historical prerelease commit",
      );
    }
  }

  for (const gate of gates) {
    assert.deepEqual(Object.keys(gate), ["id", "status", "rationale", "evidence"]);
    assertSingleLineText(gate.id, "gate.id");
    assert.match(gate.id, /^DRP-GATE-\d{3}$/);
    assert.ok(
      expectedGates.some((expected) => expected.id === gate.id),
      `${gate.id} must be recognized`,
    );
    assert.ok(
      allowedGateStatuses.includes(gate.status as (typeof allowedGateStatuses)[number]),
      `${gate.id}.status must be recognized`,
    );
    assertSingleLineText(gate.rationale, `${gate.id}.rationale`);
    assert.ok(Array.isArray(gate.evidence), `${gate.id}.evidence must be an array`);
    assert.notEqual(gate.evidence.length, 0, `${gate.id}.evidence must not be empty`);
    for (const evidencePath of gate.evidence as Array<unknown>) {
      assertRepositoryEvidencePath(evidencePath, `${gate.id}.evidence`);
    }
  }

  for (const blocker of npmBlockers) {
    assert.deepEqual(Object.keys(blocker), ["id", "status", "rationale", "evidence"]);
    assertSingleLineText(blocker.id, "npmBlocker.id");
    assert.match(blocker.id, /^DRP-NPM-\d{3}$/);
    assert.ok(
      expectedNpmBlockers.some((expected) => expected.id === blocker.id),
      `${blocker.id} must be recognized`,
    );
    assert.equal(
      blocker.status,
      "blocked",
      `${blocker.id}.status must remain blocked`,
    );
    assertSingleLineText(blocker.rationale, `${blocker.id}.rationale`);
    assert.ok(Array.isArray(blocker.evidence), `${blocker.id}.evidence must be an array`);
    assert.notEqual(blocker.evidence.length, 0, `${blocker.id}.evidence must not be empty`);
    for (const evidencePath of blocker.evidence as Array<unknown>) {
      assertRepositoryEvidencePath(evidencePath, `${blocker.id}.evidence`);
    }
  }

  for (const nonClaim of nonClaims) {
    assert.deepEqual(Object.keys(nonClaim), ["id", "status", "statement"]);
    assertSingleLineText(nonClaim.id, "nonClaim.id");
    assert.match(nonClaim.id, /^DRP-NC-\d{3}$/);
    assert.ok(
      expectedNonClaims.some((expected) => expected.id === nonClaim.id),
      `${nonClaim.id} must be recognized`,
    );
    assert.ok(
      allowedNonClaimStatuses.includes(nonClaim.status as (typeof allowedNonClaimStatuses)[number]),
      `${nonClaim.id}.status must be recognized`,
    );
    assertSingleLineText(nonClaim.statement, `${nonClaim.id}.statement`);
    const expected = expectedNonClaims.find((candidate) => candidate.id === nonClaim.id);
    assert.equal(
      nonClaim.statement,
      expected?.statement,
      `${nonClaim.id}.statement must preserve the exact non-claim`,
    );
  }

  assert.equal(new Set(nonClaims.map((nonClaim) => nonClaim.statement)).size, nonClaims.length);

  for (const path of [
    "package.json",
    "LICENSE",
    "NOTICE",
    "CITATION.cff",
    "docs/github-prerelease.md",
    "tests/release-readiness.test.ts",
    "spec/runtime-security/0.1.0/profile.json",
    "spec/runtime-security.md",
    "rfcs/0008-runtime-security-profile.md",
  ]) {
    assertRepositoryEvidencePath(path, path);
  }

  assert.deepEqual(
    channels.map((channel) => {
      const mappedChannel: Record<string, unknown> = {
        id: channel.id,
        status: channel.status,
      };
      if (channel.id === "github-prerelease") {
        mappedChannel.historicalRelease = channel.historicalRelease;
      }
      return mappedChannel;
    }),
    expectedChannels,
  );
  assert.deepEqual(
    gates.map((gate) => ({ id: gate.id, status: gate.status, rationale: gate.rationale, evidence: gate.evidence })),
    expectedGates,
  );
  assert.deepEqual(
    npmBlockers.map((blocker) => ({
      id: blocker.id,
      status: blocker.status,
      rationale: blocker.rationale,
      evidence: blocker.evidence,
    })),
    expectedNpmBlockers,
  );
  assert.deepEqual(
    nonClaims.map((nonClaim) => ({
      id: nonClaim.id,
      status: nonClaim.status,
      statement: nonClaim.statement,
    })),
    expectedNonClaims,
  );
}

function mutateProfile(profile: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(profile) as Record<string, unknown>;
}

test("distribution readiness profile pins the closed release contract", () => {
  const packageMetadata = JSON.parse(readFileSync(packageJsonUrl, "utf8")) as Record<string, unknown>;
  assert.equal(packageMetadata.private, true);
  assertDistributionReadinessProfile(readProfile());
});

test("distribution readiness profile rejects unknown top-level keys", () => {
  const profile = mutateProfile(readProfile());
  profile.unexpected = true;
  assert.throws(
    () => assertDistributionReadinessProfile(profile),
    /profile top-level keys must match the closed vocabulary/,
  );
});

test("distribution readiness profile rejects unknown statuses", () => {
  const profile = mutateProfile(readProfile());
  (profile.channels as Array<Record<string, unknown>>)[0]!.status = "experimental";
  assert.throws(
    () => assertDistributionReadinessProfile(profile),
    /public-source\.status must be recognized/,
  );
});

test("distribution readiness profile rejects duplicate gate IDs", () => {
  const profile = mutateProfile(readProfile());
  (profile.gates as Array<Record<string, unknown>>)[1]!.id = (profile.gates as Array<Record<string, unknown>>)[0]!.id;
  assert.throws(
    () => assertDistributionReadinessProfile(profile),
    /gate IDs must be unique/,
  );
});

test("distribution readiness profile rejects false npm readiness", () => {
  const profile = mutateProfile(readProfile());
  (profile.npmBlockers as Array<Record<string, unknown>>)[0]!.status = "available";
  assert.throws(
    () => assertDistributionReadinessProfile(profile),
    /DRP-NPM-001\.status must remain blocked/,
  );
});

test("distribution readiness profile rejects missing evidence", () => {
  const profile = mutateProfile(readProfile());
  (profile.gates as Array<Record<string, unknown>>)[0]!.evidence = ["tests/does-not-exist.json"];
  assert.throws(
    () => assertDistributionReadinessProfile(profile),
    /DRP-GATE-001\.evidence must resolve to an existing repository file/,
  );
});

test("distribution readiness profile rejects publication-authority claims", () => {
  const profile = mutateProfile(readProfile());
  (profile.nonClaims as Array<Record<string, unknown>>)[0]!.statement =
    "The profile claims publication authority.";
  assert.throws(
    () => assertDistributionReadinessProfile(profile),
    /DRP-NC-001\.statement must preserve the exact non-claim/,
  );
});

test("distribution readiness profile rejects evidence symlinks that escape the repository", () => {
  const outsideRoot = mkdtempSync(join(tmpdir(), "ccsdk-drp-evidence-outside-"));
  const insideRoot = mkdtempSync(join(repositoryRoot, ".ccsdk-drp-evidence-inside-"));
  const outsideEvidencePath = join(outsideRoot, "evidence.txt");
  const symlinkPath = join(insideRoot, "escape");
  writeFileSync(outsideEvidencePath, "outside repository\n");
  symlinkSync(outsideRoot, symlinkPath, process.platform === "win32" ? "junction" : "dir");

  try {
    assert.throws(
      () =>
        assertRepositoryEvidencePath(
          relative(repositoryRoot, join(symlinkPath, "evidence.txt")),
          "symlink evidence",
        ),
      /evidence path must stay inside the repository after resolving symlinks/,
    );
  } finally {
    rmSync(insideRoot, { recursive: true, force: true });
    rmSync(outsideRoot, { recursive: true, force: true });
  }
});

test("distribution readiness prose pins every approved DRP normative meaning", () => {
  assert.deepEqual(
    drpRuleMeanings(readText(distributionReadinessProseUrl)),
    expectedDrpRuleMeanings,
  );
});

test("distribution readiness packaging text matches the implemented private subpaths", () => {
  const prose = readText(distributionReadinessProseUrl);
  const rfc = readText(distributionReadinessRfcUrl);
  const plan = readText(implementationPlanUrl);

  for (const document of [prose, rfc]) {
    const normalizedDocument = normalizeNormativeMeaning(document);
    assert.match(
      normalizedDocument,
      /Private package 0\.8\.0 already packages the read-only \.\/distribution-readiness\/0\.1\.0 JSON subpath\./,
    );
    assert.match(
      normalizedDocument,
      /Reading or importing it is side-effect-free and grants no publication, authentication, certification, endorsement, host-configuration, or production authority\./,
    );
  }
  assert.match(
    plan,
    /the export-map additions are `\.\/compatibility\/0\.8\.0` and `\.\/distribution-readiness\/0\.1\.0`/,
  );
});

test("public API reference names every supported package surface", async () => {
  const packageMetadata = JSON.parse(
    readFileSync(packageJsonUrl, "utf8"),
  ) as Record<string, unknown>;
  assert.equal(packageMetadata.private, true);
  assert.equal(typeof packageMetadata.version, "string");

  const compatibilityBaselineUrl = new URL(
    `../spec/compatibility/${packageMetadata.version}/baseline.json`,
    import.meta.url,
  );
  const compatibilityBaseline = JSON.parse(
    readFileSync(compatibilityBaselineUrl, "utf8"),
  ) as Record<string, unknown>;
  const compatibilityPackage = compatibilityBaseline.package as {
    metadata: {
      bin: Record<string, unknown>;
      exports: Record<string, unknown>;
    };
    runtimeExports: string[];
    typeExports: string[];
  };

  assert.equal(
    compatibilityBaseline.appliesToPackageVersion,
    packageMetadata.version,
  );
  assert.deepEqual(packageMetadata.exports, compatibilityPackage.metadata.exports);
  assert.deepEqual(packageMetadata.bin, compatibilityPackage.metadata.bin);

  const builtRootApi = await import("../dist/index.js");
  assert.deepEqual(
    Object.keys(builtRootApi).sort(),
    compatibilityPackage.runtimeExports,
  );

  const publicApiReference = readText(publicApiReferenceUrl);
  const requiredSections = [
    "Stability",
    "Root API",
    "Package Subpaths",
    "Executables",
    "Not Public API",
  ];

  for (const section of requiredSections) {
    assert.match(publicApiReference, new RegExp(`^## ${escapeRegExp(section)}$`, "m"));
  }

  assert.match(
    publicApiReference,
    /Supported Experimental is not Normative Stable\./,
  );
  assert.match(
    publicApiReference,
    /source paths absent from `exports` are internal\./,
  );
  assert.match(publicApiReference, /SourceRecord Ingestion/);
  assert.match(publicApiReference, /Promotion/);
  assert.match(publicApiReference, /Cognitive Objects/);
  assert.match(publicApiReference, /Portable Cognition/);
  assert.match(publicApiReference, /Authorization and Transitions/);
  assert.match(publicApiReference, /Host Integration/);

  for (const heading of ["Promotion", "Authorization and Transitions"]) {
    const section = publicApiReference.match(
      new RegExp(`^### ${escapeRegExp(heading)}$([\\s\\S]*?)(?=^### |^## )`, "m"),
    );
    assert.ok(section?.[1], `${heading} must have a root API section`);
    assert.match(section[1], /Stability: Supported Experimental only\./);
    assert.doesNotMatch(section[1], /Normative Stable (?:promotion|authorization|transition)/i);
  }

  const packageSymbolTokens = [
    ...compatibilityPackage.runtimeExports,
    ...compatibilityPackage.typeExports,
    ...Object.keys(compatibilityPackage.metadata.exports),
    ...Object.keys(compatibilityPackage.metadata.bin),
  ];
  for (const token of packageSymbolTokens) {
    assert.match(
      publicApiReference,
      new RegExp(`\`${escapeRegExp(token)}\``),
    );
  }

  for (const sectionName of ["hostConformance", "referenceHost", "sqlite"]) {
    assert.ok(
      Object.hasOwn(compatibilityBaseline, sectionName),
      `compatibility baseline must define ${sectionName}`,
    );
  }

  for (const [sectionName, section] of Object.entries(compatibilityBaseline)) {
    if (section === null || typeof section !== "object" || Array.isArray(section)) {
      continue;
    }

    const typedSection = section as Record<string, unknown>;
    if (
      typeof typedSection.packageSubpath !== "string" ||
      !Array.isArray(typedSection.runtimeExports) ||
      !Array.isArray(typedSection.typeExports)
    ) {
      continue;
    }

    assert.deepEqual(
      documentedSubpathExportInventory(
        publicApiReference,
        typedSection.packageSubpath,
      ),
      {
        runtimeExports: typedSection.runtimeExports,
        typeExports: typedSection.typeExports,
      },
      sectionName,
    );
  }
});
