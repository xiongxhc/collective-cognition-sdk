import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const charter = readFileSync(
  new URL("../spec/collective-cognition-charter.md", import.meta.url),
  "utf8",
);
const expectedRules = Array.from(
  { length: 25 },
  (_, index) => `CCC-${String(index + 1).padStart(3, "0")}`,
);

test("publishes one mapped definition for every Charter rule", () => {
  const headings = [...charter.matchAll(/^### (CCC-\d{3}) /gm)].map((match) => match[1]);
  const mappings = [...charter.matchAll(/^\| (CCC-\d{3}) \| (schema|fixture|test|prose-only) \|/gm)]
    .map((match) => match[1]);
  assert.deepEqual(headings, expectedRules);
  assert.deepEqual(mappings.sort(), [...expectedRules].sort());
  for (const ruleId of expectedRules) {
    assert.equal((charter.match(new RegExp(`^### ${ruleId} `, "gm")) ?? []).length, 1);
    assert.match(charter, new RegExp(`^\\| ${ruleId} \\| (schema|fixture|test|prose-only) \\|`, "m"));
  }
  const firstRule = charter.indexOf("### CCC-001 ");
  assert.equal(/\b(?:MUST|MUST NOT|SHOULD|SHOULD NOT)\b/.test(charter.slice(0, firstRule)), false);
});

test("states the non-claims and split portable error catalog", () => {
  assert.match(charter, /does not define organizational truth/i);
  assert.match(charter, /INVALID_HOST_INTEGRATION_REQUEST/);
  assert.match(charter, /Portable Cognition.*eleven-code/i);
});
