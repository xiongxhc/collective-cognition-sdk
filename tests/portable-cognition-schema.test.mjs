import assert from "node:assert/strict";
import test from "node:test";

import {
  compilePortableSchema,
  invalidFixtures,
  schemaInvalidFixtures,
  validRecords,
} from "./portable-cognition-fixtures.mjs";

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

const requiredLexicalFixtureDescriptions = [
  "duplicate envelope member name",
  "duplicate nested data member name",
  "lone surrogate data string",
];

const requiredRuntimeFixtureDescriptions = [
  "Portable Cognition record exceeds maximum JSON nesting depth",
  "createdAt follows updatedAt",
  "human confirmation event ID mismatch",
  "human confirmation follows occurrence time",
];

test("Portable Cognition schema compiles in strict Draft 2020-12 mode", () => {
  assert.equal(typeof compilePortableSchema(), "function");
});

test("every schema-layer valid fixture passes", () => {
  const validate = compilePortableSchema();
  for (const fixture of validRecords()) {
    assert.equal(validate(fixture), true, JSON.stringify(validate.errors));
  }
});

test("every schema-layer invalid fixture fails", () => {
  const validate = compilePortableSchema();
  for (const fixture of schemaInvalidFixtures()) {
    assert.equal(validate(fixture.record), false, fixture.description);
  }
});

test("invalid fixtures declare lexical and runtime boundaries", () => {
  const fixtures = invalidFixtures();
  assert.deepEqual(
    [...new Set(fixtures.map((fixture) => fixture.ruleId))].sort(),
    machineCheckableRuleIds.sort(),
  );
  const lexicalFixtures = fixtures.filter(
    (fixture) => fixture.validationLayer === "lexical",
  );
  const runtimeFixtures = fixtures.filter(
    (fixture) => fixture.validationLayer === "runtime",
  );
  assert.deepEqual(
    lexicalFixtures.map((fixture) => fixture.description).sort(),
    requiredLexicalFixtureDescriptions.sort(),
  );
  assert.deepEqual(
    runtimeFixtures.map((fixture) => fixture.description).sort(),
    requiredRuntimeFixtureDescriptions.sort(),
  );

  for (const fixture of lexicalFixtures) {
    assert.equal(typeof fixture.recordJson, "string");
    assert.equal(fixture.record, undefined);
  }

  for (const fixture of runtimeFixtures) {
    assert.notEqual(fixture.record, undefined);
    assert.equal(fixture.recordJson, undefined);
  }

  for (const fixture of fixtures) {
    assert.equal(fixture.expectedCode, "INVALID_PORTABLE_COGNITION_RECORD");
    assert.ok(
      fixture.validationLayer === undefined ||
        fixture.validationLayer === "lexical" ||
        fixture.validationLayer === "runtime",
    );
  }
});
