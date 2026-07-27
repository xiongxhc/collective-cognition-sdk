import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const schemaUrl = new URL(
  "../spec/schemas/0.1.0/source-record.schema.json",
  import.meta.url,
);
const validFixtureUrl = new URL(
  "../spec/conformance/0.1.0/source-record/valid.jsonl",
  import.meta.url,
);
const invalidFixtureUrl = new URL(
  "../spec/conformance/0.1.0/source-record/invalid.jsonl",
  import.meta.url,
);

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

function compileSchema({ validateFormats = true } = {}) {
  const ajv = new Ajv2020({
    strict: true,
    allErrors: true,
    validateFormats,
  });
  if (validateFormats) {
    addFormats(ajv, { mode: "full" });
  }
  return ajv.compile(readJson(schemaUrl));
}

test("SourceRecord schema compiles in strict Draft 2020-12 mode", () => {
  assert.equal(typeof compileSchema(), "function");
});

test("every normative valid fixture satisfies the schema", () => {
  const validate = compileSchema();
  for (const record of readJsonLines(validFixtureUrl)) {
    assert.equal(validate(record), true, JSON.stringify(validate.errors));
  }
});

test("every normative invalid fixture violates the schema", () => {
  const validate = compileSchema();
  for (const fixture of readJsonLines(invalidFixtureUrl)) {
    assert.equal(validate(fixture.record), false, fixture.description);
  }
});

test("timestamp validity remains asserted without format validation", () => {
  const validate = compileSchema({ validateFormats: false });
  const impossibleDate = readJsonLines(invalidFixtureUrl).find(
    (fixture) => fixture.description === "impossible captured calendar date",
  );

  assert.ok(impossibleDate);
  assert.equal(validate(impossibleDate.record), false);
});

test("invalid fixtures cover every machine-checkable rule", () => {
  const expectedRuleIds = [
    "SR-001",
    "SR-002",
    "SR-003",
    "SR-004",
    "SR-005",
    "SR-006",
    "SR-007",
    "SR-008",
    "SR-009",
    "SR-010",
    "SR-011",
  ];
  const actualRuleIds = [
    ...new Set(
      readJsonLines(invalidFixtureUrl).map((fixture) => fixture.ruleId),
    ),
  ].sort();

  assert.deepEqual(actualRuleIds, expectedRuleIds);
});
