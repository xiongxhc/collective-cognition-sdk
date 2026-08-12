import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import {
  isAbsolute,
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

  return resolvedEvidencePath;
}

function assertRepositoryEvidencePath(evidencePath: unknown, label: string): asserts evidencePath is string {
  assertSingleLineText(evidencePath, label);
  const resolvedEvidencePath = resolveRepositoryEvidencePath(evidencePath);
  const stats = statSync(resolvedEvidencePath);
  assert.ok(stats.isFile(), `${label} must resolve to an existing repository file`);
}

function assertDistributionReadinessProfile(profile: Record<string, unknown>): void {
  assert.deepEqual(Object.keys(profile), allowedTopLevelKeys);

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

  assert.equal(new Set(channels.map((channel) => channel.id)).size, channels.length);
  assert.equal(new Set(gates.map((gate) => gate.id)).size, gates.length);
  assert.equal(new Set(npmBlockers.map((blocker) => blocker.id)).size, npmBlockers.length);
  assert.equal(new Set(nonClaims.map((nonClaim) => nonClaim.id)).size, nonClaims.length);

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
    assert.equal(blocker.status, "blocked");
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
  assert.throws(() => assertDistributionReadinessProfile(profile));
});

test("distribution readiness profile rejects unknown statuses", () => {
  const profile = mutateProfile(readProfile());
  (profile.channels as Array<Record<string, unknown>>)[0]!.status = "experimental";
  assert.throws(() => assertDistributionReadinessProfile(profile));
});

test("distribution readiness profile rejects duplicate gate IDs", () => {
  const profile = mutateProfile(readProfile());
  (profile.gates as Array<Record<string, unknown>>)[1]!.id = (profile.gates as Array<Record<string, unknown>>)[0]!.id;
  assert.throws(() => assertDistributionReadinessProfile(profile));
});

test("distribution readiness profile rejects false npm readiness", () => {
  const profile = mutateProfile(readProfile());
  (profile.npmBlockers as Array<Record<string, unknown>>)[0]!.status = "available";
  assert.throws(() => assertDistributionReadinessProfile(profile));
});

test("distribution readiness profile rejects missing evidence", () => {
  const profile = mutateProfile(readProfile());
  (profile.gates as Array<Record<string, unknown>>)[0]!.evidence = ["tests/does-not-exist.json"];
  assert.throws(() => assertDistributionReadinessProfile(profile));
});

test("distribution readiness profile rejects publication-authority claims", () => {
  const profile = mutateProfile(readProfile());
  (profile.nonClaims as Array<Record<string, unknown>>)[0]!.statement =
    "The profile claims publication authority.";
  assert.throws(() => assertDistributionReadinessProfile(profile));
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

  assert.equal(
    compatibilityBaseline.appliesToPackageVersion,
    packageMetadata.version,
  );
  assert.deepEqual(packageMetadata.exports, compatibilityBaseline.package.metadata.exports);
  assert.deepEqual(packageMetadata.bin, compatibilityBaseline.package.metadata.bin);

  const builtRootApi = await import("../dist/index.js");
  assert.deepEqual(
    Object.keys(builtRootApi).sort(),
    compatibilityBaseline.package.runtimeExports,
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

  const packageSymbolTokens = [
    ...((compatibilityBaseline.package as Record<string, unknown>)
      .runtimeExports as string[]),
    ...((compatibilityBaseline.package as Record<string, unknown>)
      .typeExports as string[]),
    ...Object.keys(compatibilityBaseline.package.metadata.exports as Record<
      string,
      unknown
    >),
    ...Object.keys(compatibilityBaseline.package.metadata.bin as Record<
      string,
      unknown
    >),
  ];
  const sectionSymbolTokens = Object.values(compatibilityBaseline)
    .flatMap((section) => {
      if (section === null || typeof section !== "object" || Array.isArray(section)) {
        return [];
      }

      const typedSection = section as Record<string, unknown>;
      return [
        ...(Array.isArray(typedSection.runtimeExports)
          ? (typedSection.runtimeExports as string[])
          : []),
        ...(Array.isArray(typedSection.typeExports)
          ? (typedSection.typeExports as string[])
          : []),
      ];
    });

  for (const token of [...packageSymbolTokens, ...sectionSymbolTokens]) {
    assert.match(
      publicApiReference,
      new RegExp(`\`${escapeRegExp(token)}\``),
    );
  }
});
