import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const schemaUrl = new URL(
  "../spec/schemas/0.1.0/portable-cognition.schema.json",
  import.meta.url,
);
const validFixtureUrl = new URL(
  "../spec/conformance/0.1.0/portable-cognition/valid.jsonl",
  import.meta.url,
);
const invalidFixtureUrl = new URL(
  "../spec/conformance/0.1.0/portable-cognition/invalid.jsonl",
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

function compileSchema() {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv, { mode: "full" });
  return ajv.compile(readJson(schemaUrl));
}

function invalidFixtureRecord(fixture) {
  assert.notEqual(
    fixture.record === undefined,
    fixture.recordJson === undefined,
    `${fixture.description} must define exactly one record form`,
  );
  return fixture.recordJson === undefined
    ? fixture.record
    : JSON.parse(fixture.recordJson);
}

const machineCheckableRuleIds = [
  "PCR-001",
  "PCR-002",
  "PCR-003",
  "PCR-004",
  "PCR-005",
  "PCR-006",
  "PCR-007",
  "PCR-008",
  "PCR-009",
  "PCR-010",
  "PCR-011",
  "PCR-012",
  "PCR-013",
  "PCR-014",
  "PCR-015",
  "PCR-016",
  "PCR-017",
  "PCR-018",
];

test("Portable Cognition schema compiles in strict Draft 2020-12 mode", () => {
  assert.equal(typeof compileSchema(), "function");
});

test("every schema-layer valid fixture passes", () => {
  const validate = compileSchema();
  for (const fixture of readJsonLines(validFixtureUrl)) {
    assert.equal(validate(fixture), true, JSON.stringify(validate.errors));
  }
});

test("every schema-layer invalid fixture fails", () => {
  const validate = compileSchema();
  for (const fixture of readJsonLines(invalidFixtureUrl).filter(
    (candidate) => candidate.validationLayer === undefined,
  )) {
    assert.equal(validate(invalidFixtureRecord(fixture)), false, fixture.description);
  }
});

test("invalid fixtures declare lexical and runtime boundaries", () => {
  const invalidFixtures = readJsonLines(invalidFixtureUrl);
  assert.deepEqual(
    [...new Set(invalidFixtures.map((fixture) => fixture.ruleId))].sort(),
    machineCheckableRuleIds.sort(),
  );
  assert.ok(
    invalidFixtures.some((fixture) => fixture.validationLayer === "lexical"),
  );
  assert.ok(
    invalidFixtures.some((fixture) => fixture.validationLayer === "runtime"),
  );

  for (const fixture of invalidFixtures) {
    assert.equal(fixture.expectedCode, "INVALID_PORTABLE_COGNITION_RECORD");
    assert.ok(
      fixture.validationLayer === undefined ||
        fixture.validationLayer === "lexical" ||
        fixture.validationLayer === "runtime",
    );
  }
});
