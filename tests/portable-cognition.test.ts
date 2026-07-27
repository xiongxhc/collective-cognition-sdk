import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createPortableCognitionRecord,
  deserializePortableCognitionRecord,
  DomainError,
  DomainErrorCode,
  PORTABLE_COGNITION_MAX_JSON_DEPTH,
  PORTABLE_COGNITION_SCHEMA_VERSION,
  serializePortableCognitionRecord,
  validatePortableCognitionRecord,
} from "../src/index.ts";
import type { PortableCognitionRecord } from "../src/index.ts";

interface InvalidFixture {
  readonly description: string;
  readonly expectedCode: string;
  readonly record?: unknown;
  readonly recordJson?: string;
}

const validFixtureUrl = new URL(
  "../spec/conformance/0.1.0/portable-cognition/valid.jsonl",
  import.meta.url,
);
const invalidFixtureUrl = new URL(
  "../spec/conformance/0.1.0/portable-cognition/invalid.jsonl",
  import.meta.url,
);

function readJsonLines(url: URL): unknown[] {
  return readFileSync(url, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as unknown);
}

function validRecords(): PortableCognitionRecord[] {
  return readJsonLines(validFixtureUrl) as PortableCognitionRecord[];
}

function invalidFixtures(): InvalidFixture[] {
  return readJsonLines(invalidFixtureUrl) as InvalidFixture[];
}

function nestedArrays(depth: number): unknown {
  let value: unknown = null;
  for (let index = 0; index < depth; index += 1) {
    value = [value];
  }
  return value;
}

function domainErrorRecordWithDetailDepth(
  detailDepth: number,
): PortableCognitionRecord {
  return {
    schemaVersion: "0.1.0",
    recordType: "domain-error",
    payload: {
      code: DomainErrorCode.INVALID_PORTABLE_COGNITION_RECORD,
      message: "Depth boundary.",
      details: { deep: nestedArrays(detailDepth) },
    },
  } as PortableCognitionRecord;
}

function isPortableRecordError(error: unknown): boolean {
  return (
    error instanceof DomainError &&
    error.code === DomainErrorCode.INVALID_PORTABLE_COGNITION_RECORD
  );
}

test("accepts every normative valid Portable Cognition record", () => {
  for (const record of validRecords()) {
    validatePortableCognitionRecord(record);
    const accepted = createPortableCognitionRecord(record);
    assert.deepEqual(accepted, record);
    assert.equal(Object.isFrozen(accepted), true);
    assert.deepEqual(
      deserializePortableCognitionRecord(
        serializePortableCognitionRecord(accepted),
      ),
      accepted,
    );
  }
});

test("rejects every normative invalid Portable Cognition record", () => {
  for (const fixture of invalidFixtures()) {
    assert.throws(
      () =>
        fixture.recordJson === undefined
          ? validatePortableCognitionRecord(fixture.record)
          : deserializePortableCognitionRecord(fixture.recordJson),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === fixture.expectedCode,
      fixture.description,
    );
  }
});

test("clones and deeply freezes accepted records", () => {
  const mutable = structuredClone(validRecords().at(-2)) as {
    payload: unknown;
  };
  const accepted = createPortableCognitionRecord(
    mutable as PortableCognitionRecord,
  );

  mutable.payload = { status: "denied", reason: "changed" };

  assert.notDeepEqual(mutable, accepted);
  assert.equal(Object.isFrozen(accepted), true);
  assert.equal(Object.isFrozen(accepted.payload), true);
  assert.equal(
    Object.isFrozen(
      deserializePortableCognitionRecord(
        serializePortableCognitionRecord(accepted),
      ).payload,
    ),
    true,
  );
});

test("publishes the stable Portable Cognition boundary constants", () => {
  assert.equal(PORTABLE_COGNITION_SCHEMA_VERSION, "0.1.0");
  assert.equal(PORTABLE_COGNITION_MAX_JSON_DEPTH, 256);
});

test("accepts depth 256 and rejects depth 257", () => {
  assert.doesNotThrow(() =>
    validatePortableCognitionRecord(domainErrorRecordWithDetailDepth(253)),
  );
  assert.throws(
    () =>
      validatePortableCognitionRecord(domainErrorRecordWithDetailDepth(254)),
    isPortableRecordError,
  );
});

test("classifies malformed JSON as a serialization error", () => {
  assert.throws(
    () => deserializePortableCognitionRecord("{broken"),
    (error: unknown) =>
      error instanceof DomainError &&
      error.code === DomainErrorCode.SERIALIZATION_ERROR,
  );
});

test("rejects descriptor-bearing values without invoking accessors", () => {
  let accessed = false;
  const record = {
    recordType: "authorization-decision",
    payload: { status: "allowed" },
  };
  Object.defineProperty(record, "schemaVersion", {
    enumerable: true,
    get() {
      accessed = true;
      return "0.1.0";
    },
  });

  assert.throws(
    () => validatePortableCognitionRecord(record),
    isPortableRecordError,
  );
  assert.equal(accessed, false);
});
