import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  COGNITION_EVENT_PROJECTION_VERSION,
  COGNITION_PROJECTION_MAX_JSON_DEPTH,
  COGNITIVE_OBJECT_PROJECTION_VERSION,
  deserializeCognitionEventProjection,
  deserializeCognitiveObjectProjection,
  deserializePortableCognitionRecord,
  DomainError,
  DomainErrorCode,
  validateCognitionEventProjection,
  validateCognitiveObjectProjection,
  validatePortableCognitionRecord,
} from "../src/index.ts";
import type { CognitionEvent, CognitiveObject } from "../src/index.ts";

type RecordType = "cognitive-object" | "cognition-event";

interface InvalidFixture {
  readonly description: string;
  readonly expectedCode: DomainErrorCode;
  readonly payload?: unknown;
  readonly payloadJson?: string;
  readonly validationLayer: "lexical" | "runtime" | "schema";
}

interface LifecycleFixture {
  readonly description: string;
  readonly event: unknown;
  readonly expected: { readonly valid: boolean };
}

const fixtureUrls = {
  cognitiveObject: {
    valid: new URL(
      "../spec/conformance/0.1.0/cognitive-object/valid.jsonl",
      import.meta.url,
    ),
    invalid: new URL(
      "../spec/conformance/0.1.0/cognitive-object/invalid.jsonl",
      import.meta.url,
    ),
  },
  cognitionEvent: {
    valid: new URL(
      "../spec/conformance/0.1.0/cognition-event/valid.jsonl",
      import.meta.url,
    ),
    invalid: new URL(
      "../spec/conformance/0.1.0/cognition-event/invalid.jsonl",
      import.meta.url,
    ),
    lifecycle: new URL(
      "../spec/conformance/0.1.0/cognition-event/lifecycle.jsonl",
      import.meta.url,
    ),
  },
} as const;

function readJsonLines<T>(url: URL): T[] {
  return readFileSync(url, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as T);
}

function envelopeText(recordType: RecordType, payloadText: string): string {
  return `{"schemaVersion":"0.1.0","recordType":"${recordType}","payload":${payloadText}}`;
}

function maximumContainerDepth(value: unknown, depth = 1): number {
  if (value === null || typeof value !== "object") return depth - 1;
  return Math.max(
    depth,
    ...Object.values(value).map((child) =>
      maximumContainerDepth(child, depth + 1),
    ),
  );
}

function assertCode(error: unknown, code: DomainErrorCode): boolean {
  return error instanceof DomainError && error.code === code;
}

function projectionApi(recordType: RecordType) {
  return recordType === "cognitive-object"
    ? {
        deserialize: deserializeCognitiveObjectProjection,
        validate: validateCognitiveObjectProjection,
      }
    : {
        deserialize: deserializeCognitionEventProjection,
        validate: validateCognitionEventProjection,
      };
}

test("publishes the standalone projection profile", () => {
  assert.equal(COGNITIVE_OBJECT_PROJECTION_VERSION, "0.1.0");
  assert.equal(COGNITION_EVENT_PROJECTION_VERSION, "0.1.0");
  assert.equal(COGNITION_PROJECTION_MAX_JSON_DEPTH, 255);
});

for (const [recordType, fixtures] of [
  [
    "cognitive-object",
    fixtureUrls.cognitiveObject,
  ],
  [
    "cognition-event",
    fixtureUrls.cognitionEvent,
  ],
] as const) {
  test(`${recordType} projection accepts every valid fixture`, () => {
    const { deserialize, validate } = projectionApi(recordType);
    for (const payload of readJsonLines<unknown>(fixtures.valid)) {
      validate(payload);
      const payloadText = JSON.stringify(payload);
      assert.deepEqual(deserialize(payloadText), payload);
      assert.deepEqual(
        deserialize(payloadText),
        deserializePortableCognitionRecord(
          envelopeText(recordType, payloadText),
        ).payload,
      );
    }
  });

  test(`${recordType} projection preserves schema and runtime invalid fixture codes`, () => {
    const { deserialize, validate } = projectionApi(recordType);
    const fixturesByLayer = readJsonLines<InvalidFixture>(fixtures.invalid)
      .filter((fixture) => fixture.validationLayer !== "lexical");

    for (const fixture of fixturesByLayer) {
      assert.notEqual(fixture.payload, undefined, fixture.description);
      assert.throws(
        () => validate(fixture.payload),
        (error: unknown) => assertCode(error, fixture.expectedCode),
        fixture.description,
      );
      assert.throws(
        () => deserialize(JSON.stringify(fixture.payload)),
        (error: unknown) => assertCode(error, fixture.expectedCode),
        fixture.description,
      );
      assert.throws(
        () =>
          validatePortableCognitionRecord({
            schemaVersion: "0.1.0",
            recordType,
            payload: fixture.payload,
          }),
        (error: unknown) => assertCode(error, fixture.expectedCode),
        fixture.description,
      );
    }
  });

  test(`${recordType} projection preserves lexical invalid fixture codes`, () => {
    const { deserialize } = projectionApi(recordType);
    const lexicalFixtures = readJsonLines<InvalidFixture>(fixtures.invalid)
      .filter((fixture) => fixture.validationLayer === "lexical");

    for (const fixture of lexicalFixtures) {
      assert.equal(typeof fixture.payloadJson, "string", fixture.description);
      assert.throws(
        () => deserialize(fixture.payloadJson as string),
        (error: unknown) => assertCode(error, fixture.expectedCode),
        fixture.description,
      );
      assert.throws(
        () =>
          deserializePortableCognitionRecord(
            envelopeText(recordType, fixture.payloadJson as string),
          ),
        (error: unknown) => assertCode(error, fixture.expectedCode),
        fixture.description,
      );
    }
  });
}

test("cognition event projection classifies every lifecycle fixture through Portable Cognition", () => {
  const fixtures = readJsonLines<LifecycleFixture>(
    fixtureUrls.cognitionEvent.lifecycle,
  );

  for (const fixture of fixtures) {
    if (fixture.expected.valid) {
      assert.doesNotThrow(
        () => validateCognitionEventProjection(fixture.event),
        fixture.description,
      );
    } else {
      assert.throws(
        () => validateCognitionEventProjection(fixture.event),
        (error: unknown) =>
          assertCode(error, DomainErrorCode.INVALID_PORTABLE_COGNITION_RECORD),
        fixture.description,
      );
    }
  }
});

test("deserializers retain malformed JSON as a serialization error", () => {
  for (const deserialize of [
    deserializeCognitiveObjectProjection,
    deserializeCognitionEventProjection,
  ]) {
    assert.throws(
      () => deserialize("{"),
      (error: unknown) => assertCode(error, DomainErrorCode.SERIALIZATION_ERROR),
    );
  }
});

test("standalone depth profile accepts 255 and rejects 256 containers", () => {
  const validObject = readJsonLines<CognitiveObject>(
    fixtureUrls.cognitiveObject.valid,
  ).find((fixture) => fixture.id === "goal:depth-255");
  const invalidObject = readJsonLines<InvalidFixture>(
    fixtureUrls.cognitiveObject.invalid,
  ).find((fixture) => fixture.description === "cognitive object depth-256 runtime boundary");
  const invalidEvent = readJsonLines<InvalidFixture>(
    fixtureUrls.cognitionEvent.invalid,
  ).find((fixture) => fixture.description === "cognition event depth-256 runtime-before-schema precedence");

  assert.notEqual(validObject, undefined);
  assert.notEqual(invalidObject?.payload, undefined);
  assert.notEqual(invalidEvent?.payload, undefined);
  assert.equal(maximumContainerDepth(validObject), 255);
  assert.equal(maximumContainerDepth(invalidObject?.payload), 256);
  assert.equal(maximumContainerDepth(invalidEvent?.payload), 256);
  assert.doesNotThrow(() => validateCognitiveObjectProjection(validObject));
  assert.throws(
    () => validateCognitiveObjectProjection(invalidObject?.payload),
    (error: unknown) =>
      assertCode(error, DomainErrorCode.INVALID_PORTABLE_COGNITION_RECORD),
  );
  assert.throws(
    () => validateCognitionEventProjection(invalidEvent?.payload),
    (error: unknown) =>
      assertCode(error, DomainErrorCode.INVALID_PORTABLE_COGNITION_RECORD),
  );
});

test("deserializers return isolated deeply frozen projection payloads", () => {
  const source = structuredClone(
    readJsonLines<CognitiveObject>(fixtureUrls.cognitiveObject.valid)[0],
  ) as CognitiveObject & { data: { actorKind?: string } };
  const accepted = deserializeCognitiveObjectProjection(JSON.stringify(source));

  source.data.actorKind = "agent";

  assert.notDeepEqual(accepted, source);
  assert.equal(Object.isFrozen(accepted), true);
  assert.equal(Object.isFrozen(accepted.data), true);
  assert.equal(Object.isFrozen(accepted.provenance), true);
  assert.equal(Object.isFrozen(accepted.provenance[0]), true);
});

test("in-memory validators reject accessors without invoking them", () => {
  const source = structuredClone(
    readJsonLines<CognitionEvent>(fixtureUrls.cognitionEvent.valid)[0],
  ) as unknown as Record<string, unknown>;
  let accessed = false;
  Object.defineProperty(source, "id", {
    enumerable: true,
    get() {
      accessed = true;
      return "event:accessed";
    },
  });

  assert.throws(
    () => validateCognitionEventProjection(source),
    (error: unknown) =>
      assertCode(error, DomainErrorCode.INVALID_PORTABLE_COGNITION_RECORD),
  );
  assert.equal(accessed, false);
});
