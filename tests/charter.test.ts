import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const charter = readFileSync(
  new URL("../spec/collective-cognition-charter.md", import.meta.url),
  "utf8",
);
const expectedRules = Array.from(
  { length: 25 },
  (_, index) => `CCC-${String(index + 1).padStart(3, "0")}`,
);
const expectedRuleTitles = [
  "CCC-001 — Version Domains",
  "CCC-002 — JSON and Lexical Profile",
  "CCC-003 — Source Observation Boundary",
  "CCC-004 — Cognitive-Object Envelope",
  "CCC-005 — Attribution Roles",
  "CCC-006 — Provenance References",
  "CCC-007 — Identity Semantics",
  "CCC-008 — Goal Semantics",
  "CCC-009 — Hypothesis Semantics",
  "CCC-010 — Experiment Semantics",
  "CCC-011 — Evidence Semantics",
  "CCC-012 — Decision Semantics",
  "CCC-013 — Principle Semantics",
  "CCC-014 — Relationships and Reference Integrity",
  "CCC-015 — Lifecycle Transitions",
  "CCC-016 — Cognition Events",
  "CCC-017 — Authorization Decisions",
  "CCC-018 — Human Confirmation",
  "CCC-019 — Explicit Promotion",
  "CCC-020 — Stable Domain Errors",
  "CCC-021 — Host Security Boundary",
  "CCC-022 — Persistence and Publication Boundary",
  "CCC-023 — Namespaced Extensions",
  "CCC-024 — Conformance Claims",
  "CCC-025 — Explicit Non-Claims",
];
const expectedRootCodes = [
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
  "INVALID_HOST_INTEGRATION_REQUEST",
];
const expectedPortableCodes = expectedRootCodes.filter(
  (code) => code !== "INVALID_HOST_INTEGRATION_REQUEST",
);

function tableCodes(startMarker: string, endMarker: string): string[] {
  const start = charter.indexOf(startMarker);
  const end = charter.indexOf(endMarker, start);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return [...charter.slice(start, end).matchAll(/^\| `([A-Z_]+)` \|/gm)]
    .map((match) => match[1]);
}

test("publishes the exact Charter rule inventory and evidence plan", () => {
  const headings = [...charter.matchAll(/^### (CCC-\d{3} — .+)$/gm)].map((match) => match[1]);
  const mappings = [...charter.matchAll(
    /^\| (CCC-\d{3}) \| (schema|fixture|test|prose-only) \| (current|deferred) \| (.+) \|$/gm,
  )];
  assert.deepEqual(headings.map((heading) => heading.slice(0, 7)), expectedRules);
  assert.deepEqual(headings, expectedRuleTitles);
  assert.deepEqual(mappings.map((match) => match[1]).sort(), [...expectedRules].sort());
  for (const ruleId of expectedRules) {
    assert.equal((charter.match(new RegExp(`^### ${ruleId} `, "gm")) ?? []).length, 1);
    assert.match(
      charter,
      new RegExp(
        `^\\| ${ruleId} \\| (schema|fixture|test|prose-only) \\| (current|deferred) \\|`,
        "m",
      ),
    );
  }
  for (const [, ruleId, , evidenceStatus, evidence] of mappings) {
    if (evidenceStatus === "deferred") {
      assert.match(evidence, /^Deferred to Task 4:/, `${ruleId} deferred evidence`);
      continue;
    }
    const link = evidence.match(/\]\(([^)]+)\)/);
    assert.ok(link, `${ruleId} current evidence link`);
    assert.equal(
      existsSync(new URL(link[1], new URL("../spec/", import.meta.url))),
      true,
      `${ruleId} current evidence target`,
    );
  }
  const firstRule = charter.indexOf("### CCC-001 ");
  assert.equal(/\b(?:MUST|MUST NOT|SHOULD|SHOULD NOT)\b/.test(charter.slice(0, firstRule)), false);
});

test("states the non-claims, standalone iff rule, and split error catalogs", () => {
  assert.match(charter, /does not define organizational truth/i);
  assert.match(
    charter.replace(/\s+/g, " "),
    /A standalone projection, when supplied, MUST accept a payload if and only if its implicit canonical Portable Cognition envelope conforms\./,
  );
  assert.deepEqual(
    tableCodes("Conforming root implementations", "Portable Cognition retains"),
    expectedRootCodes,
  );
  assert.deepEqual(
    tableCodes("Portable Cognition retains", "The root-only"),
    expectedPortableCodes,
  );
  assert.equal(expectedRootCodes.length, 12);
  assert.equal(expectedPortableCodes.length, 11);
  assert.equal(expectedPortableCodes.includes("INVALID_HOST_INTEGRATION_REQUEST"), false);
});
