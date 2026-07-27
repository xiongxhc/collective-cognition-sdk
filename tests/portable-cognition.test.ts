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

function eventRecordWithConfirmation(
  overrides: Record<string, unknown>,
): PortableCognitionRecord {
  const record = structuredClone(
    validRecords().find((candidate) => candidate.recordType === "cognition-event"),
  ) as PortableCognitionRecord<"cognition-event">;
  return {
    ...record,
    payload: {
      ...record.payload,
      humanConfirmation: {
        actor: { id: "human:owner", kind: "human" },
        confirmedAt: record.payload.occurredAt,
        objectId: record.payload.objectId,
        targetState: record.payload.nextState,
        eventId: record.payload.id,
        ...overrides,
      },
    },
  };
}

function transitionContextRecordWithConfirmation(
  overrides: Record<string, unknown>,
): PortableCognitionRecord {
  const record = structuredClone(
    validRecords().find(
      (candidate) => candidate.recordType === "transition-context",
    ),
  ) as PortableCognitionRecord<"transition-context">;
  return {
    ...record,
    payload: {
      ...record.payload,
      confirmation: {
        actor: { id: "human:owner", kind: "human" },
        confirmedAt: record.payload.occurredAt,
        objectId: "goal:portable",
        targetState: "active",
        eventId: record.payload.eventId,
        ...overrides,
      },
    },
  };
}

function allowedRecord(): PortableCognitionRecord {
  return {
    schemaVersion: "0.1.0",
    recordType: "authorization-decision",
    payload: { status: "allowed" },
  };
}

function statefulPortableRecord() {
  const expected = allowedRecord();
  const target = structuredClone(expected) as {
    schemaVersion: "0.1.0";
    recordType: "authorization-decision";
    payload:
      | { status: "allowed" }
      | { status: "denied"; reason: string };
  };
  const secret = "STATEFUL_PORTABLE_PROXY_SECRET";
  let payloadDescriptorReads = 0;
  let valueReads = 0;
  const record = new Proxy(target, {
    getOwnPropertyDescriptor(inner, key) {
      const descriptor = Reflect.getOwnPropertyDescriptor(inner, key);
      if (key === "payload") {
        payloadDescriptorReads += 1;
        if (payloadDescriptorReads === 1) {
          inner.payload = { status: "denied", reason: "changed" };
        }
      }
      return descriptor;
    },
    get() {
      valueReads += 1;
      throw new Error(secret);
    },
  });
  return {
    expected,
    record: record as PortableCognitionRecord,
    secret,
    payloadDescriptorReads: () => payloadDescriptorReads,
    valueReads: () => valueReads,
  };
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

test("create rejects descriptor-bearing values without invoking accessors", () => {
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
    () =>
      createPortableCognitionRecord(
        record as unknown as PortableCognitionRecord,
      ),
    isPortableRecordError,
  );
  assert.equal(accessed, false);
});

test("create rejects depth 257 with the stable portable error", () => {
  assert.throws(
    () =>
      createPortableCognitionRecord(domainErrorRecordWithDetailDepth(254)),
    isPortableRecordError,
  );
});

test("create does not depend on structuredClone after snapshotting", () => {
  const originalStructuredClone = globalThis.structuredClone;
  const record = validRecords().at(-2)!;
  let cloneCalls = 0;
  globalThis.structuredClone = (() => {
    cloneCalls += 1;
    throw new RangeError("clone failed");
  }) as typeof structuredClone;
  try {
    assert.deepEqual(createPortableCognitionRecord(record), record);
    assert.equal(cloneCalls, 0);
  } finally {
    globalThis.structuredClone = originalStructuredClone;
  }
});

test("portable operations use one own-descriptor snapshot of stateful Proxies", () => {
  const validation = statefulPortableRecord();
  assert.doesNotThrow(() =>
    validatePortableCognitionRecord(validation.record),
  );
  assert.equal(validation.payloadDescriptorReads(), 1);
  assert.equal(validation.valueReads(), 0);

  const creation = statefulPortableRecord();
  assert.deepEqual(
    createPortableCognitionRecord(creation.record),
    creation.expected,
  );
  assert.equal(creation.payloadDescriptorReads(), 1);
  assert.equal(creation.valueReads(), 0);

  const serialization = statefulPortableRecord();
  assert.deepEqual(
    JSON.parse(serializePortableCognitionRecord(serialization.record)),
    serialization.expected,
  );
  assert.equal(serialization.payloadDescriptorReads(), 1);
  assert.equal(serialization.valueReads(), 0);
});

test("portable operations ignore inherited getters", () => {
  const expected = structuredClone(
    validRecords().find((record) => record.recordType === "cognition-event"),
  ) as PortableCognitionRecord<"cognition-event">;
  const originalConfirmation = Object.getOwnPropertyDescriptor(
    Object.prototype,
    "humanConfirmation",
  );
  let getterCalls = 0;
  Object.defineProperty(Object.prototype, "humanConfirmation", {
    configurable: true,
    get() {
      getterCalls += 1;
      return undefined;
    },
  });
  try {
    assert.doesNotThrow(() => validatePortableCognitionRecord(expected));
    assert.deepEqual(createPortableCognitionRecord(expected), expected);
    assert.deepEqual(
      JSON.parse(serializePortableCognitionRecord(expected)),
      expected,
    );
  } finally {
    if (originalConfirmation === undefined) {
      delete (
        Object.prototype as { humanConfirmation?: unknown }
      ).humanConfirmation;
    } else {
      Object.defineProperty(
        Object.prototype,
        "humanConfirmation",
        originalConfirmation,
      );
    }
  }
  assert.equal(getterCalls, 0);
});

test("serialization ignores polluted prototype toJSON hooks", () => {
  const record = eventRecordWithConfirmation({});
  const originalToJson = Object.getOwnPropertyDescriptor(
    Object.prototype,
    "toJSON",
  );
  let toJsonCalls = 0;
  let serialized = "";
  Object.defineProperty(Object.prototype, "toJSON", {
    configurable: true,
    value() {
      toJsonCalls += 1;
      return { leaked: true };
    },
  });
  try {
    serialized = serializePortableCognitionRecord(record);
  } finally {
    if (originalToJson === undefined) {
      delete (Object.prototype as { toJSON?: unknown }).toJSON;
    } else {
      Object.defineProperty(Object.prototype, "toJSON", originalToJson);
    }
  }

  assert.equal(toJsonCalls, 0);
  assert.deepEqual(JSON.parse(serialized), record);
});

test("reflection failures have stable classification without secret leakage", () => {
  const secret = "PORTABLE_REFLECTION_SECRET_DO_NOT_EXPOSE";
  const operations = [
    (record: PortableCognitionRecord) =>
      validatePortableCognitionRecord(record),
    (record: PortableCognitionRecord) =>
      createPortableCognitionRecord(record),
    (record: PortableCognitionRecord) =>
      serializePortableCognitionRecord(record),
  ];
  const failingRecords = [
    () => new Proxy(allowedRecord(), {
      getPrototypeOf() {
        throw new Error(secret);
      },
    }),
    () => new Proxy(allowedRecord(), {
      ownKeys() {
        throw new Error(secret);
      },
    }),
    () => new Proxy(allowedRecord(), {
      getOwnPropertyDescriptor(inner, key) {
        if (key === "schemaVersion") {
          throw new Error(secret);
        }
        return Reflect.getOwnPropertyDescriptor(inner, key);
      },
    }),
  ];

  for (const operation of operations) {
    for (const failingRecord of failingRecords) {
      assert.throws(
        () => operation(failingRecord()),
        (error: unknown) =>
          error instanceof DomainError &&
          error.code === DomainErrorCode.INVALID_PORTABLE_COGNITION_RECORD &&
          !error.message.includes(secret) &&
          !JSON.stringify(error.details).includes(secret) &&
          !(error.stack ?? "").includes(secret),
      );
    }
  }
});

test("orders cognitive-object timestamps at nanosecond precision across offsets", () => {
  const original = structuredClone(
    validRecords().find(
      (candidate) => candidate.recordType === "cognitive-object",
    ),
  ) as PortableCognitionRecord<"cognitive-object">;
  const record = {
    ...original,
    payload: {
      ...original.payload,
      createdAt: "2026-07-27T11:00:00.000000002+01:00",
      updatedAt: "2026-07-27T10:00:00.000000001Z",
    },
  };

  assert.throws(
    () => validatePortableCognitionRecord(record),
    isPortableRecordError,
  );
});

test("orders cognition-event confirmation at nanosecond precision across offsets", () => {
  const original = eventRecordWithConfirmation({
    confirmedAt: "2026-07-27T11:00:00.000000002+01:00",
  }) as PortableCognitionRecord<"cognition-event">;
  const record = {
    ...original,
    payload: {
      ...original.payload,
      occurredAt: "2026-07-27T10:00:00.000000001Z",
    },
  };

  assert.throws(
    () => validatePortableCognitionRecord(record),
    isPortableRecordError,
  );
});

test("orders transition confirmation at nanosecond precision across offsets", () => {
  const original = transitionContextRecordWithConfirmation({
    confirmedAt: "2026-07-27T11:00:00.000000002+01:00",
  }) as PortableCognitionRecord<"transition-context">;
  const record = {
    ...original,
    payload: {
      ...original.payload,
      occurredAt: "2026-07-27T10:00:00.000000001Z",
    },
  };

  assert.throws(
    () => validatePortableCognitionRecord(record),
    isPortableRecordError,
  );
});

test("rejects event confirmations for another event", () => {
  assert.throws(
    () =>
      validatePortableCognitionRecord(
        eventRecordWithConfirmation({ eventId: "event:other" }),
      ),
    isPortableRecordError,
  );
});

test("rejects event confirmations for another object", () => {
  assert.throws(
    () =>
      validatePortableCognitionRecord(
        eventRecordWithConfirmation({ objectId: "goal:other" }),
      ),
    isPortableRecordError,
  );
});

test("rejects event confirmations for another target state", () => {
  assert.throws(
    () =>
      validatePortableCognitionRecord(
        eventRecordWithConfirmation({ targetState: "paused" }),
      ),
    isPortableRecordError,
  );
});

test("keeps standalone transition confirmation object and state unbound", () => {
  assert.doesNotThrow(() =>
    validatePortableCognitionRecord(
      transitionContextRecordWithConfirmation({
        objectId: "opaque:standalone-target",
        targetState: "host-defined-state",
      }),
    ),
  );
});

test("rejects event confirmations after event occurrence", () => {
  assert.throws(
    () =>
      validatePortableCognitionRecord(
        eventRecordWithConfirmation({
          confirmedAt: "2026-07-27T10:02:00Z",
        }),
      ),
    isPortableRecordError,
  );
});

test("keeps the Portable Cognition 0.1.0 error-code allowlist fixed", async () => {
  const expectedCodes = [
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
  ] as const;
  assert.deepEqual(Object.values(DomainErrorCode), expectedCodes);

  const futureCode = "UNRELATED_FUTURE_ERROR";
  const mutableDomainErrorCode = DomainErrorCode as unknown as Record<
    string,
    string
  >;
  mutableDomainErrorCode.UNRELATED_FUTURE_ERROR = futureCode;
  try {
    const moduleUrl = new URL("../src/portable-cognition.ts", import.meta.url);
    moduleUrl.search = "fixed-error-allowlist";
    const freshRuntime = await import(moduleUrl.href) as typeof import(
      "../src/portable-cognition.ts"
    );

    for (const code of expectedCodes) {
      assert.doesNotThrow(() =>
        freshRuntime.validatePortableCognitionRecord({
          schemaVersion: "0.1.0",
          recordType: "domain-error",
          payload: { code, message: "Portable error.", details: {} },
        }),
      );
    }
    assert.throws(
      () =>
        freshRuntime.validatePortableCognitionRecord({
          schemaVersion: "0.1.0",
          recordType: "domain-error",
          payload: {
            code: futureCode,
            message: "Future error.",
            details: {},
          },
        }),
      isPortableRecordError,
    );
  } finally {
    delete mutableDomainErrorCode.UNRELATED_FUTURE_ERROR;
  }
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
