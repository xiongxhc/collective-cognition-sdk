import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const proseUrl = new URL("../spec/runtime-security.md", import.meta.url);
const profileUrl = new URL(
  "../spec/runtime-security/0.1.0/profile.json",
  import.meta.url,
);

const enforcementClasses = [
  "sdk-enforced",
  "conformance-verified",
  "host-required",
  "out-of-scope",
] as const;

const expectedControls = [
  ["RSP-001", "sdk-enforced"],
  ["RSP-002", "sdk-enforced"],
  ["RSP-003", "sdk-enforced"],
  ["RSP-004", "sdk-enforced"],
  ["RSP-005", "sdk-enforced"],
  ["RSP-006", "sdk-enforced"],
  ["RSP-007", "sdk-enforced"],
  ["RSP-008", "sdk-enforced"],
  ["RSP-009", "sdk-enforced"],
  ["RSP-010", "conformance-verified"],
  ["RSP-011", "conformance-verified"],
  ["RSP-012", "conformance-verified"],
  ["RSP-013", "conformance-verified"],
  ["RSP-014", "conformance-verified"],
  ["RSP-015", "host-required"],
  ["RSP-016", "host-required"],
  ["RSP-017", "host-required"],
  ["RSP-018", "host-required"],
  ["RSP-019", "host-required"],
  ["RSP-020", "host-required"],
  ["RSP-021", "host-required"],
  ["RSP-022", "host-required"],
] as const;

const expectedNonClaims = [
  "RSP-NC-001",
  "RSP-NC-002",
  "RSP-NC-003",
  "RSP-NC-004",
  "RSP-NC-005",
] as const;

const controlKeys = [
  "id",
  "title",
  "enforcementClass",
  "requirement",
  "normativeAnchor",
  "evidence",
] as const;

const nonClaimKeys = [
  "id",
  "title",
  "enforcementClass",
  "statement",
  "normativeAnchor",
] as const;

const evidenceKinds = ["test", "contract", "workflow", "package"] as const;

function readProfile(): Record<string, unknown> {
  return JSON.parse(readFileSync(profileUrl, "utf8")) as Record<string, unknown>;
}

function headingAnchor(text: string): string {
  return `#${text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[–—]/g, "-")
    .replace(/[^a-z0-9 -]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-{3,}/g, "--")}`;
}

function readAnchors(): Set<string> {
  const markdown = readFileSync(proseUrl, "utf8");
  return new Set(
    markdown
      .split("\n")
      .flatMap((line) => {
        const match = /^(#{1,6}) (.+)$/.exec(line);
        return match ? [headingAnchor(match[2])] : [];
      }),
  );
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

test("runtime security prose distinguishes profile and package versions", () => {
  const prose = readFileSync(proseUrl, "utf8");

  assert.match(prose, /profile version `0\.1\.0`/);
  assert.match(prose, /private package version `0\.7\.0`/);
  assert.doesNotMatch(prose, /SDK version `0\.1\.0`/);
});

test("evidence path validation rejects POSIX-style internal traversal", () => {
  assert.throws(
    () => resolveRepositoryEvidencePath("tests/../../outside.json"),
    /must stay inside the repository/,
  );
});

test("evidence path validation rejects Windows-style internal traversal", () => {
  assert.throws(
    () => resolveRepositoryEvidencePath("tests\\..\\..\\outside.json"),
    /must stay inside the repository/,
  );
});

test("evidence path validation accepts valid repository paths", () => {
  assert.equal(
    resolveRepositoryEvidencePath("tests/runtime-security-profile.test.ts"),
    fileURLToPath(new URL("runtime-security-profile.test.ts", import.meta.url)),
  );
  assert.equal(
    resolveRepositoryEvidencePath("spec/runtime-security/0.1.0/profile.json"),
    fileURLToPath(profileUrl),
  );
});

test("runtime security profile pins the approved closed inventory", () => {
  const profile = readProfile();
  const headings = readAnchors();

  assert.deepEqual(Object.keys(profile), [
    "profile",
    "version",
    "status",
    "enforcementClasses",
    "controls",
    "nonClaims",
  ]);

  assert.equal(profile.profile, "collective-cognition-runtime-security");
  assert.equal(profile.version, "0.1.0");
  assert.equal(profile.status, "normative-stable");
  assert.deepEqual(profile.enforcementClasses, enforcementClasses);

  assert.ok(Array.isArray(profile.controls), "controls must be an array");
  assert.ok(Array.isArray(profile.nonClaims), "nonClaims must be an array");

  const controls = profile.controls as Array<Record<string, unknown>>;
  const nonClaims = profile.nonClaims as Array<Record<string, unknown>>;

  assert.deepEqual(
    controls.map((control) => [control.id, control.enforcementClass]),
    expectedControls,
  );
  assert.deepEqual(
    nonClaims.map((nonClaim) => nonClaim.id),
    expectedNonClaims,
  );
  assert.deepEqual(
    nonClaims.map((nonClaim) => nonClaim.enforcementClass),
    expectedNonClaims.map(() => "out-of-scope"),
  );

  const allIds = controls.map((control) => control.id);
  assert.equal(new Set(allIds).size, allIds.length, "control IDs must be unique");
  const allNonClaimIds = nonClaims.map((nonClaim) => nonClaim.id);
  assert.equal(
    new Set(allNonClaimIds).size,
    allNonClaimIds.length,
    "non-claim IDs must be unique",
  );

  for (const control of controls) {
    assert.deepEqual(Object.keys(control), controlKeys);
    assertSingleLineText(control.id, "control.id");
    assert.match(control.id, /^RSP-\d{3}$/);
    assertSingleLineText(control.title, `${control.id}.title`);
    assertSingleLineText(control.requirement, `${control.id}.requirement`);
    assert.match(
      control.normativeAnchor as string,
      /^#rsp-\d{3}--[a-z0-9-]+$/,
      `${control.id}.normativeAnchor must be a kebab-case heading anchor`,
    );
    assert.ok(
      headings.has(control.normativeAnchor as string),
      `${control.id}.normativeAnchor must resolve in spec/runtime-security.md`,
    );
    assert.ok(
      enforcementClasses.includes(control.enforcementClass as (typeof enforcementClasses)[number]),
      `${control.id}.enforcementClass must be recognized`,
    );
    assert.ok(Array.isArray(control.evidence), `${control.id}.evidence must be an array`);
    if (control.enforcementClass === "host-required") {
      assert.deepEqual(control.evidence, [], `${control.id} must not claim implementation evidence`);
      continue;
    }

    assert.notEqual(control.evidence.length, 0, `${control.id} must include implementation evidence`);
    for (const evidence of control.evidence as Array<Record<string, unknown>>) {
      assert.deepEqual(Object.keys(evidence), ["kind", "path"]);
      assert.ok(
        evidenceKinds.includes(evidence.kind as (typeof evidenceKinds)[number]),
        `${control.id} evidence.kind must be recognized`,
      );
      assertSingleLineText(evidence.path, `${control.id}.evidence.path`);
      const evidencePath = resolveRepositoryEvidencePath(evidence.path);
      assert.equal(
        statSync(evidencePath).isFile(),
        true,
        `${control.id}.evidence.path must point to an existing file`,
      );
    }
  }

  for (const nonClaim of nonClaims) {
    assert.deepEqual(Object.keys(nonClaim), nonClaimKeys);
    assertSingleLineText(nonClaim.id, "nonClaim.id");
    assert.match(nonClaim.id, /^RSP-NC-\d{3}$/);
    assertSingleLineText(nonClaim.title, `${nonClaim.id}.title`);
    assertSingleLineText(nonClaim.statement, `${nonClaim.id}.statement`);
    assert.equal(nonClaim.enforcementClass, "out-of-scope");
    assert.match(
      nonClaim.normativeAnchor as string,
      /^#rsp-nc-\d{3}--[a-z0-9-]+$/,
      `${nonClaim.id}.normativeAnchor must be a kebab-case heading anchor`,
    );
    assert.ok(
      headings.has(nonClaim.normativeAnchor as string),
      `${nonClaim.id}.normativeAnchor must resolve in spec/runtime-security.md`,
    );
  }
});
