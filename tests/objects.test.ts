import assert from "node:assert/strict";
import test from "node:test";

import * as sdk from "../src/index.ts";
import {
  createObject,
  deserializeObject,
  DomainError,
  DomainErrorCode,
  serializeObject,
} from "../src/index.ts";
import type {
  CognitiveObject,
  CreateObjectInput,
  JsonObject,
  ObjectType,
  RelationshipType,
} from "../src/index.ts";

const attribution = {
  initiatorId: "human:initiator",
  executorId: "agent:executor",
  accountableId: "human:accountable",
};

const provenance = [
  {
    source: "test",
    sourceId: "source-1",
    capturedAt: "2026-07-24T10:00:00.000Z",
  },
];

function inputFor<T extends ObjectType>(type: T): CreateObjectInput<T> {
  const relationships =
    type === "hypothesis"
      ? [{ type: "supports-goal", targetId: "goal:1" }]
      : type === "experiment"
        ? [{ type: "tests-hypothesis", targetId: "hypothesis:1" }]
        : type === "evidence"
          ? [{ type: "supports-hypothesis", targetId: "hypothesis:1" }]
          : type === "decision"
            ? [
                { type: "supports-goal", targetId: "goal:1" },
                { type: "justified-by-evidence", targetId: "evidence:1" },
                { type: "considers-option", targetId: "option:1" },
                { type: "accountable-identity", targetId: "identity:1" },
              ]
            : type === "principle"
              ? [{ type: "justified-by-decision", targetId: "decision:1" }]
          : [];

  return {
    id: `${type}:1`,
    type,
    version: 1,
    state: {
      identity: "active",
      goal: "draft",
      hypothesis: "proposed",
      experiment: "planned",
      evidence: "collected",
      decision: "draft",
      principle: "proposed",
    }[type],
    title: `Test ${type}`,
    data: { description: `Description for ${type}` },
    createdAt: "2026-07-24T10:00:00.000Z",
    updatedAt: "2026-07-24T10:00:00.000Z",
    attribution,
    provenance,
    contextId: "organization:test",
    relationships,
    extensions: { "test:value": true },
  } as CreateObjectInput<typeof type>;
}

test("creates every object type at its required initial state", () => {
  const expectedStates = {
    identity: "active",
    goal: "draft",
    hypothesis: "proposed",
    experiment: "planned",
    evidence: "collected",
    decision: "draft",
    principle: "proposed",
  } as const;

  for (const type of Object.keys(expectedStates) as ObjectType[]) {
    const object = createObject(inputFor(type));

    assert.equal(object.id, `${type}:1`);
    assert.equal(object.type, type);
    assert.equal(object.version, 1);
    assert.equal(object.state, expectedStates[type]);
    assert.equal(object.title, `Test ${type}`);
    assert.equal(object.contextId, "organization:test");
  }
});

test("requires a positive initial version of one", () => {
  for (const version of [0, -1, 1.5, 2]) {
    assert.throws(
      () => createObject({ ...inputFor("goal"), version }),
      (error: unknown) =>
        error instanceof DomainError && error.code === "INVALID_OBJECT",
    );
  }
});

test("requires ISO timestamps and non-empty identity fields", () => {
  assert.throws(
    () => createObject({ ...inputFor("goal"), createdAt: "not-a-date" }),
    (error: unknown) =>
      error instanceof DomainError && error.code === "INVALID_OBJECT",
  );

  for (const field of ["id", "title", "contextId"] as const) {
    assert.throws(
      () => createObject({ ...inputFor("goal"), [field]: "  " }),
      (error: unknown) =>
        error instanceof DomainError && error.code === "INVALID_OBJECT",
    );
  }

  assert.throws(
    () =>
      createObject({
        ...inputFor("goal"),
        createdAt: "2026-02-30T10:00:00.000Z",
      }),
    (error: unknown) =>
      error instanceof DomainError && error.code === "INVALID_OBJECT",
  );
});

test("accepts six-digit fractional seconds in object and provenance timestamps", () => {
  const timestamp = "2026-06-23T10:51:33.326000+00:00";
  const object = createObject({
    ...inputFor("goal"),
    createdAt: timestamp,
    updatedAt: timestamp,
    provenance: [{ ...provenance[0], capturedAt: timestamp }],
  });

  assert.equal(object.createdAt, timestamp);
  assert.equal(object.updatedAt, timestamp);
  assert.equal(object.provenance[0].capturedAt, timestamp);
});

test("rejects objects created after their latest update", () => {
  assert.throws(
    () =>
      createObject({
        ...inputFor("goal"),
        createdAt: "2026-07-24T10:00:01.000Z",
        updatedAt: "2026-07-24T10:00:00.000Z",
      }),
    (error: unknown) =>
      error instanceof DomainError &&
      error.code === DomainErrorCode.INVALID_OBJECT,
  );
});

test("does not expose the internal event factory from the public API", () => {
  assert.equal("createCognitionEvent" in sdk, false);
});

test("requires attribution and provenance", () => {
  assert.throws(
    () =>
      createObject({
        ...inputFor("goal"),
        attribution: { ...attribution, accountableId: "" },
      }),
    (error: unknown) =>
      error instanceof DomainError && error.code === "INVALID_OBJECT",
  );

  assert.throws(
    () => createObject({ ...inputFor("goal"), provenance: [] }),
    (error: unknown) =>
      error instanceof DomainError && error.code === "INVALID_OBJECT",
  );
});

test("requires a hypothesis to support at least one goal", () => {
  assert.throws(
    () => createObject({ ...inputFor("hypothesis"), relationships: [] }),
    (error: unknown) =>
      error instanceof DomainError && error.code === "INVALID_RELATIONSHIP",
  );
});

test("requires relationships for every dependent object type", () => {
  const missingRelationships: CreateObjectInput<ObjectType>[] = [
    { ...inputFor("experiment"), relationships: [] },
    { ...inputFor("evidence"), relationships: [] },
    {
      ...inputFor("decision"),
      relationships: [{ type: "supports-goal", targetId: "goal:1" }],
    },
    {
      ...inputFor("decision"),
      relationships: [
        { type: "justified-by-evidence", targetId: "evidence:1" },
        { type: "considers-option", targetId: "option:1" },
        { type: "accountable-identity", targetId: "identity:1" },
      ],
    },
    {
      ...inputFor("decision"),
      relationships: [
        { type: "supports-goal", targetId: "goal:1" },
        { type: "justified-by-evidence", targetId: "evidence:1" },
        { type: "accountable-identity", targetId: "identity:1" },
      ],
    },
    {
      ...inputFor("decision"),
      relationships: [
        { type: "supports-goal", targetId: "goal:1" },
        { type: "justified-by-evidence", targetId: "evidence:1" },
        { type: "considers-option", targetId: "option:1" },
      ],
    },
    {
      ...inputFor("principle"),
      relationships: [],
    },
  ];

  for (const input of missingRelationships) {
    assert.throws(
      () => createObject(input),
      (error: unknown) =>
        error instanceof DomainError && error.code === "INVALID_RELATIONSHIP",
    );
  }
});

test("accepts evidence related to either a hypothesis or an experiment", () => {
  const object = createObject({
    ...inputFor("evidence"),
    relationships: [
      { type: "observed-in-experiment", targetId: "experiment:1" },
    ],
  });

  assert.equal(object.relationships[0].type, "observed-in-experiment");
});

test("accepts a principle justified by evidence alone", () => {
  const object = createObject({
    ...inputFor("principle"),
    relationships: [
      { type: "justified-by-evidence", targetId: "evidence:1" },
    ],
  });

  assert.equal(object.relationships[0].type, "justified-by-evidence");
});

test("rejects non-JSON payloads and extensions", () => {
  assert.throws(
    () =>
      createObject({
        ...inputFor("goal"),
        data: { invalid: new Map() } as unknown as CreateObjectInput<"goal">["data"],
      }),
    (error: unknown) =>
      error instanceof DomainError && error.code === "INVALID_OBJECT",
  );

  assert.throws(
    () =>
      createObject({
        ...inputFor("goal"),
        extensions: new Map() as unknown as JsonObject,
      }),
    (error: unknown) =>
      error instanceof DomainError && error.code === "INVALID_OBJECT",
  );
});

test("rejects arrays whose shape would not round-trip through JSON", () => {
  const arrayWithMapProperty = ["value"] as unknown[] & {
    custom?: unknown;
  };
  arrayWithMapProperty.custom = new Map([["key", "value"]]);

  const arrayWithSymbolProperty = ["value"] as unknown[] & {
    [key: symbol]: unknown;
  };
  arrayWithSymbolProperty[Symbol("custom")] = "discarded";

  const arrayWithAccessor = ["value"] as unknown[] & {
    custom?: unknown;
  };
  Object.defineProperty(arrayWithAccessor, "custom", {
    enumerable: true,
    get: () => "computed",
  });

  const sparseArray = [] as unknown[];
  sparseArray.length = 1;

  const arrayWithCustomPrototype = ["value"];
  Object.setPrototypeOf(arrayWithCustomPrototype, { custom: true });

  for (const invalidArray of [
    arrayWithMapProperty,
    arrayWithSymbolProperty,
    arrayWithAccessor,
    sparseArray,
    arrayWithCustomPrototype,
  ]) {
    assert.throws(
      () =>
        createObject({
          ...inputFor("goal"),
          data: { invalidArray },
        } as never),
      (error: unknown) =>
        error instanceof DomainError && error.code === "INVALID_OBJECT",
    );
  }
});

test("rejects non-JSON domain error details", () => {
  assert.throws(
    () =>
      new DomainError(DomainErrorCode.INVALID_OBJECT, "invalid", {
        invalid: new Map(),
      } as unknown as JsonObject),
    TypeError,
  );
});

test("uses JsonObject-compatible details for domain errors", () => {
  const relationshipType: RelationshipType = "supports-goal";
  const details: JsonObject = { type: relationshipType };
  const error = new DomainError(
    DomainErrorCode.INVALID_OBJECT,
    "invalid",
    details,
  );

  assert.deepEqual(error.details, { type: "supports-goal" });
  assert.equal(Object.isFrozen(error.details), true);
});

test("CognitiveObject is extractable as a correlated discriminated union", () => {
  type GoalObject = Extract<CognitiveObject, { type: "goal" }>;
  const object: CognitiveObject = createObject(inputFor("goal"));

  if (object.type !== "goal") {
    assert.fail("Expected a goal object.");
  }
  const goal: GoalObject = object;

  assert.equal(goal.type, "goal");
  assert.equal(goal.state, "draft");
  assert.equal(goal.data.description, "Description for goal");
});

test("serializes and deserializes without losing semantic information", () => {
  const object = createObject(inputFor("hypothesis"));
  const restored = deserializeObject(serializeObject(object));

  assert.deepEqual(restored, object);
  assert.equal(Object.isFrozen(restored), true);
});

test("wraps malformed serialized JSON in a serialization error", () => {
  assert.throws(
    () => deserializeObject("{broken"),
    (error: unknown) =>
      error instanceof DomainError && error.code === "SERIALIZATION_ERROR",
  );
});
