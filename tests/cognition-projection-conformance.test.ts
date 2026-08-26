import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DomainError,
  DomainErrorCode,
  transitionObject,
  validateCognitionEventProjection,
  validateCognitiveObjectProjection,
} from "../src/index.ts";
import type {
  CognitionEvent,
  CognitiveObject,
  ObjectType,
  RelationshipType,
  TransitionContext,
} from "../src/index.ts";

type ValidationLayer = "projection" | "reference" | "transition";
type ExpectedCode = "VALID" | DomainErrorCode;

interface LifecycleFixture {
  readonly description: string;
  readonly objects: readonly unknown[];
  readonly event: unknown;
  readonly expected: {
    readonly valid: boolean;
    readonly linkedValid?: boolean;
    readonly code: ExpectedCode;
    readonly validationLayer?: ValidationLayer;
  };
}

const lifecycleUrl = new URL(
  "../spec/conformance/0.1.0/cognition-event/lifecycle.jsonl",
  import.meta.url,
);

const relationshipTargetTypes = {
  "parent-goal": "goal",
  "supports-goal": "goal",
  "tests-hypothesis": "hypothesis",
  "supports-hypothesis": "hypothesis",
  "challenges-hypothesis": "hypothesis",
  "relates-to-hypothesis": "hypothesis",
  "observed-in-experiment": "experiment",
  "informs-decision": "decision",
  "considers-option": undefined,
  "accountable-identity": "identity",
  "justified-by-decision": "decision",
  "justified-by-evidence": "evidence",
} as const satisfies Record<RelationshipType, ObjectType | undefined>;

function readJsonLines<T>(url: URL): T[] {
  return readFileSync(url, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as T);
}

function failureBoundary(fixture: LifecycleFixture): ValidationLayer | undefined {
  if (linkedValidity(fixture)) return undefined;
  return fixture.expected.validationLayer ?? "transition";
}

function linkedValidity(fixture: LifecycleFixture): boolean {
  return fixture.expected.linkedValid ?? fixture.expected.valid;
}

function transitionContext(event: CognitionEvent): TransitionContext {
  return {
    eventId: event.id,
    occurredAt: event.occurredAt,
    initiator: event.initiator,
    executor: event.executor,
    accountableParty: event.accountableParty,
    automationMode: event.automationMode,
    consequenceLevel: event.consequenceLevel,
    rationale: event.rationale,
    ...(event.humanConfirmation === undefined
      ? {}
      : { confirmation: event.humanConfirmation }),
  };
}

function validateRelationships(objects: readonly CognitiveObject[]): void {
  const objectsById = new Map(
    objects.map((object) => [object.id, object] as const),
  );

  for (const object of objects) {
    for (const relationship of object.relationships) {
      const targetType = relationshipTargetTypes[relationship.type];
      if (targetType === undefined) continue;

      const target = objectsById.get(relationship.targetId);
      if (target === undefined) {
        throw new DomainError(
          DomainErrorCode.INVALID_RELATIONSHIP,
          "A cognitive-object relationship target is missing.",
        );
      }
      if (target.type !== targetType) {
        throw new DomainError(
          DomainErrorCode.INVALID_RELATIONSHIP,
          "A cognitive-object relationship target has an incompatible type.",
        );
      }
    }
  }
}

function validateLifecycle(
  objects: readonly CognitiveObject[],
  event: CognitionEvent,
): void {
  const resultingObject = objects.find(
    (object) => object.id === event.objectId && object.version === event.objectVersion,
  );
  const previousObject = objects.find(
    (object) =>
      object.id === event.objectId && object.version === event.objectVersion - 1,
  );

  if (resultingObject === undefined || previousObject === undefined) {
    throw new DomainError(
      DomainErrorCode.INVALID_TRANSITION,
      "A lifecycle event must have adjacent object revisions.",
    );
  }

  if (event.previousState !== previousObject.state) {
    throw new DomainError(
      DomainErrorCode.INVALID_TRANSITION,
      "A lifecycle event previous state must match its prior object revision.",
    );
  }

  transitionObject(
    previousObject as never,
    resultingObject.state as never,
    transitionContext(event),
    () => ({ status: "allowed" }),
  );

  assert.equal(event.objectVersion, resultingObject.version);
  assert.equal(event.objectId, resultingObject.id);
  assert.equal(event.objectType, resultingObject.type);
  assert.equal(event.nextState, resultingObject.state);
  assert.equal(resultingObject.version, previousObject.version + 1);
}

function outcomeFor(
  fixture: LifecycleFixture,
  referenceCatalog: readonly unknown[],
): ExpectedCode {
  const input = structuredClone(fixture);
  const historicalObjects = structuredClone(input.objects);
  const historicalEvent = structuredClone(input.event);
  const resolvedObjects = [
    ...input.objects,
    ...structuredClone(referenceCatalog),
  ];
  let outcome: ExpectedCode = "VALID";

  try {
    const boundary = failureBoundary(input);
    if (boundary === "projection") {
      for (const object of resolvedObjects) {
        validateCognitiveObjectProjection(object);
      }
      validateCognitionEventProjection(input.event);
    } else {
      for (const object of resolvedObjects) {
        validateCognitiveObjectProjection(object);
      }
      if (boundary === "transition") {
        validateLifecycle(input.objects as CognitiveObject[], input.event as CognitionEvent);
      } else {
        validateCognitionEventProjection(input.event);
        validateRelationships(resolvedObjects as CognitiveObject[]);
        if (boundary === undefined) {
          validateLifecycle(input.objects as CognitiveObject[], input.event as CognitionEvent);
        }
      }
    }
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    outcome = error.code;
  }

  assert.deepEqual(input.objects, historicalObjects, `${input.description} mutates history`);
  assert.deepEqual(input.event, historicalEvent, `${input.description} mutates its event`);
  return outcome;
}

test("valid lifecycle rows run event-object correlation after reference checks", () => {
  const fixtures = readJsonLines<LifecycleFixture>(lifecycleUrl);
  const referenceCatalog = fixtures
    .filter((fixture) => linkedValidity(fixture))
    .flatMap((fixture) => fixture.objects);
  const fixture = structuredClone(
    fixtures.find((candidate) => candidate.description === "ExperimentActive"),
  );

  assert.ok(fixture);
  (fixture.event as { objectId: string }).objectId = "experiment:missing";

  assert.equal(
    outcomeFor(fixture, referenceCatalog),
    DomainErrorCode.INVALID_TRANSITION,
  );
});

test("linked lifecycle fixtures resolve compatible references without mutation", () => {
  const fixtures = readJsonLines<LifecycleFixture>(lifecycleUrl);
  const referenceCatalog = fixtures
    .filter((fixture) => linkedValidity(fixture))
    .flatMap((fixture) => fixture.objects);
  const relationshipTypesSeen = new Set<RelationshipType>();

  for (const fixture of fixtures) {
    if (linkedValidity(fixture)) {
      for (const object of fixture.objects as CognitiveObject[]) {
        for (const relationship of object.relationships) {
          relationshipTypesSeen.add(relationship.type);
        }
      }
    }
    assert.equal(
      outcomeFor(fixture, referenceCatalog),
      fixture.expected.code,
      fixture.description,
    );
  }

  assert.deepEqual(
    [...relationshipTypesSeen].sort(),
    Object.keys(relationshipTargetTypes).sort(),
  );
});
