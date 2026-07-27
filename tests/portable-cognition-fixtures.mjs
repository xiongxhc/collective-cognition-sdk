import { readFileSync } from "node:fs";

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

function invalidFixtureRecord(fixture) {
  if ((fixture.record === undefined) === (fixture.recordJson === undefined)) {
    throw new TypeError(
      `${String(fixture.description)} must define exactly one record form`,
    );
  }
  return fixture.recordJson === undefined
    ? fixture.record
    : JSON.parse(String(fixture.recordJson));
}

export function compilePortableSchema() {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv, { mode: "full" });
  return ajv.compile(readJson(schemaUrl));
}

export function validRecords() {
  return readJsonLines(validFixtureUrl);
}

export function invalidFixtures() {
  return readJsonLines(invalidFixtureUrl);
}

export function schemaInvalidFixtures() {
  return invalidFixtures()
    .filter((fixture) => fixture.validationLayer === undefined)
    .map((fixture) => ({
      ...fixture,
      record: invalidFixtureRecord(fixture),
    }));
}
