import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createObject,
  DomainError,
  evaluateAuthorization,
  transitionObject,
  validatePortableCognitionRecord,
} from "../src/index.ts";
import type {
  PortableCognitionRecord,
  PortableCognitionRecordType,
  StateByType,
  TransitionContext,
} from "../src/index.ts";

const cognitiveLoopFixtureUrl = new URL(
  "../spec/conformance/0.1.0/portable-cognition/cognitive-loop.jsonl",
  import.meta.url,
);
const portableCognitionFixturesUrl = new URL(
  "./portable-cognition-fixtures.mjs",
  import.meta.url,
);

const createdAt = "2026-07-27T10:00:00Z";
const attribution = {
  initiatorId: "human:owner",
  executorId: "agent:fixture",
  accountableId: "identity:owner",
};

interface PortableSchemaValidator {
  (record: unknown): boolean;
  readonly errors?: unknown;
}

interface FixtureRecord {
  readonly description?: unknown;
  readonly record?: unknown;
  readonly validationLayer?: unknown;
}

interface PortableCognitionFixtures {
  readonly compilePortableSchema: () => PortableSchemaValidator;
  readonly invalidFixtures: () => readonly FixtureRecord[];
  readonly schemaInvalidFixtures: () => readonly FixtureRecord[];
  readonly validRecords: () => readonly unknown[];
}

const {
  compilePortableSchema,
  invalidFixtures,
  schemaInvalidFixtures,
  validRecords,
} = await import(portableCognitionFixturesUrl.href) as PortableCognitionFixtures;

function readJsonLines(url: URL): PortableCognitionRecord[] {
  return readFileSync(url, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as PortableCognitionRecord);
}

function portableRecordError(error: unknown): boolean {
  return (
    error instanceof DomainError &&
    error.code === "INVALID_PORTABLE_COGNITION_RECORD"
  );
}

function record<T extends PortableCognitionRecordType>(
  recordType: T,
  payload: PortableCognitionRecord<T>["payload"],
): PortableCognitionRecord<T> {
  return { schemaVersion: "0.1.0", recordType, payload } as PortableCognitionRecord<T>;
}

function context(
  eventId: string,
  occurredAt: string,
  rationale: string,
  confirmation?: {
    readonly objectId: string;
    readonly targetState: StateByType[keyof StateByType];
  },
): TransitionContext {
  return {
    eventId,
    occurredAt,
    initiator: { id: "human:owner", kind: "human" },
    executor: { id: "agent:fixture", kind: "agent" },
    accountableParty: { id: "identity:owner", kind: "human" },
    automationMode: "automated",
    consequenceLevel: confirmation === undefined ? "routine" : "consequential",
    rationale,
    ...(confirmation === undefined
      ? {}
      : {
          confirmation: {
            actor: { id: "human:owner", kind: "human" },
            confirmedAt: createdAt,
            objectId: confirmation.objectId,
            targetState: confirmation.targetState,
            eventId,
          },
        }),
  };
}

function createLoopObjects() {
  const identity = createObject({
    id: "identity:owner",
    type: "identity",
    version: 1,
    state: "active",
    title: "Accountable owner",
    data: { actorKind: "human" },
    createdAt,
    updatedAt: createdAt,
    attribution: {
      initiatorId: "human:owner",
      executorId: "human:owner",
      accountableId: "identity:owner",
    },
    provenance: [{ source: "fixture", sourceId: "identity-owner", capturedAt: createdAt }],
    contextId: "context:loop",
    relationships: [],
  });
  const goal = createObject({
    id: "goal:loop",
    type: "goal",
    version: 1,
    state: "draft",
    title: "Validate loop",
    data: { objective: "Validate the loop" },
    createdAt,
    updatedAt: createdAt,
    attribution,
    provenance: [{ source: "fixture", sourceId: "goal-loop", capturedAt: createdAt }],
    contextId: "context:loop",
    relationships: [],
  });
  const hypothesis = createObject({
    id: "hypothesis:loop",
    type: "hypothesis",
    version: 1,
    state: "proposed",
    title: "Loop is portable",
    data: { statement: "The loop records are portable." },
    createdAt,
    updatedAt: createdAt,
    attribution,
    provenance: [{ source: "fixture", sourceId: "hypothesis-loop", capturedAt: createdAt }],
    contextId: "context:loop",
    relationships: [{ type: "supports-goal", targetId: "goal:loop" }],
  });
  const experiment = createObject({
    id: "experiment:loop",
    type: "experiment",
    version: 1,
    state: "planned",
    title: "Run schema test",
    data: { action: "Run schema test" },
    createdAt,
    updatedAt: createdAt,
    attribution,
    provenance: [{ source: "fixture", sourceId: "experiment-loop", capturedAt: createdAt }],
    contextId: "context:loop",
    relationships: [{ type: "tests-hypothesis", targetId: "hypothesis:loop" }],
  });
  const evidence = createObject({
    id: "evidence:loop",
    type: "evidence",
    version: 1,
    state: "collected",
    title: "Schema test result",
    data: { statement: "The schema accepted the loop.", polarity: "supports" },
    createdAt,
    updatedAt: createdAt,
    attribution: {
      initiatorId: "agent:fixture",
      executorId: "agent:fixture",
      accountableId: "identity:owner",
    },
    provenance: [{ source: "fixture", sourceId: "evidence-loop", capturedAt: createdAt }],
    contextId: "context:loop",
    relationships: [{ type: "supports-hypothesis", targetId: "hypothesis:loop" }],
  });
  const decision = createObject({
    id: "decision:loop",
    type: "decision",
    version: 1,
    state: "draft",
    title: "Adopt loop",
    data: { selectedOption: "Adopt" },
    createdAt,
    updatedAt: createdAt,
    attribution: {
      initiatorId: "human:owner",
      executorId: "human:owner",
      accountableId: "identity:owner",
    },
    provenance: [{ source: "fixture", sourceId: "decision-loop", capturedAt: createdAt }],
    contextId: "context:loop",
    relationships: [
      { type: "supports-goal", targetId: "goal:loop" },
      { type: "justified-by-evidence", targetId: "evidence:loop" },
      { type: "considers-option", targetId: "option:adopt" },
      { type: "accountable-identity", targetId: "identity:owner" },
    ],
  });
  const principle = createObject({
    id: "principle:loop",
    type: "principle",
    version: 1,
    state: "proposed",
    title: "Keep contracts portable",
    data: { rule: "Keep contracts portable." },
    createdAt,
    updatedAt: createdAt,
    attribution: {
      initiatorId: "human:owner",
      executorId: "human:owner",
      accountableId: "identity:owner",
    },
    provenance: [{ source: "fixture", sourceId: "principle-loop", capturedAt: createdAt }],
    contextId: "context:loop",
    relationships: [{ type: "justified-by-decision", targetId: "decision:loop" }],
  });

  return { identity, goal, hypothesis, experiment, evidence, decision, principle };
}

function generatedCognitiveLoopRecords(): PortableCognitionRecord[] {
  const objects = createLoopObjects();
  const goalActiveContext = context(
    "event:goal-active",
    "2026-07-27T10:01:00Z",
    "Activate the goal.",
  );
  const hypothesisReviewContext = context(
    "event:hypothesis-review",
    "2026-07-27T10:02:00Z",
    "Review the hypothesis.",
  );
  const hypothesisTestingContext = context(
    "event:hypothesis-testing",
    "2026-07-27T10:03:00Z",
    "Test the hypothesis.",
  );
  const experimentActiveContext = context(
    "event:experiment-active",
    "2026-07-27T10:04:00Z",
    "Run the experiment.",
  );
  const experimentCompletedContext = context(
    "event:experiment-completed",
    "2026-07-27T10:05:00Z",
    "Complete the experiment.",
  );
  const evidenceAssessedContext = context(
    "event:evidence-assessed",
    "2026-07-27T10:06:00Z",
    "Assess the evidence.",
  );
  const evidenceAcceptedContext = context(
    "event:evidence-accepted",
    "2026-07-27T10:07:00Z",
    "Accept the evidence.",
    { objectId: objects.evidence.id, targetState: "accepted" },
  );
  const decisionProposedContext = context(
    "event:decision-proposed",
    "2026-07-27T10:08:00Z",
    "Propose the decision.",
  );
  const decisionApprovedContext = context(
    "event:decision-approved",
    "2026-07-27T10:09:00Z",
    "Approve the decision.",
    { objectId: objects.decision.id, targetState: "approved" },
  );
  const principleTrialContext = context(
    "event:principle-trial",
    "2026-07-27T10:10:00Z",
    "Trial the principle.",
  );
  const principleAdoptedContext = context(
    "event:principle-adopted",
    "2026-07-27T10:11:00Z",
    "Adopt the principle.",
    { objectId: objects.principle.id, targetState: "adopted" },
  );

  const goalActive = transitionObject(objects.goal, "active", goalActiveContext);
  const hypothesisReview = transitionObject(
    objects.hypothesis,
    "under_review",
    hypothesisReviewContext,
  );
  const hypothesisTesting = transitionObject(
    hypothesisReview.object,
    "testing",
    hypothesisTestingContext,
  );
  const experimentActive = transitionObject(
    objects.experiment,
    "active",
    experimentActiveContext,
  );
  const experimentCompleted = transitionObject(
    experimentActive.object,
    "completed",
    experimentCompletedContext,
  );
  const evidenceAssessed = transitionObject(
    objects.evidence,
    "assessed",
    evidenceAssessedContext,
  );
  const evidenceAccepted = transitionObject(
    evidenceAssessed.object,
    "accepted",
    evidenceAcceptedContext,
  );
  const decisionProposed = transitionObject(
    objects.decision,
    "proposed",
    decisionProposedContext,
  );
  const decisionApproved = transitionObject(
    decisionProposed.object,
    "approved",
    decisionApprovedContext,
  );
  const principleTrial = transitionObject(
    objects.principle,
    "trial",
    principleTrialContext,
  );
  const principleAdopted = transitionObject(
    principleTrial.object,
    "adopted",
    principleAdoptedContext,
  );

  const confirmationRequiredContext = context(
    "event:decision-confirmation-required",
    "2026-07-27T10:09:00Z",
    "Check decision confirmation.",
  );
  const allowed = evaluateAuthorization(objects.goal, "active", goalActiveContext);
  const confirmationRequired = evaluateAuthorization(
    decisionProposed.object,
    "approved",
    confirmationRequiredContext,
  );

  let domainError: DomainError | undefined;
  try {
    transitionObject(
      goalActive.object,
      "achieved",
      context(
        "event:goal-achieved-without-confirmation",
        "2026-07-27T10:12:00Z",
        "Attempt the goal completion.",
      ),
    );
  } catch (error) {
    if (error instanceof DomainError) {
      domainError = error;
    } else {
      throw error;
    }
  }
  assert.ok(domainError);

  return [
    record("cognitive-object", objects.identity),
    record("cognitive-object", goalActive.object),
    record("cognitive-object", hypothesisReview.object),
    record("cognitive-object", hypothesisTesting.object),
    record("cognitive-object", experimentActive.object),
    record("cognitive-object", experimentCompleted.object),
    record("cognitive-object", evidenceAssessed.object),
    record("cognitive-object", evidenceAccepted.object),
    record("cognitive-object", decisionProposed.object),
    record("cognitive-object", decisionApproved.object),
    record("cognitive-object", principleTrial.object),
    record("cognitive-object", principleAdopted.object),
    record("transition-context", goalActiveContext),
    record("cognition-event", goalActive.event),
    record("transition-context", hypothesisReviewContext),
    record("cognition-event", hypothesisReview.event),
    record("transition-context", hypothesisTestingContext),
    record("cognition-event", hypothesisTesting.event),
    record("transition-context", experimentActiveContext),
    record("cognition-event", experimentActive.event),
    record("transition-context", experimentCompletedContext),
    record("cognition-event", experimentCompleted.event),
    record("transition-context", evidenceAssessedContext),
    record("cognition-event", evidenceAssessed.event),
    record("transition-context", evidenceAcceptedContext),
    record("cognition-event", evidenceAccepted.event),
    record("transition-context", decisionProposedContext),
    record("cognition-event", decisionProposed.event),
    record("transition-context", decisionApprovedContext),
    record("cognition-event", decisionApproved.event),
    record("transition-context", principleTrialContext),
    record("cognition-event", principleTrial.event),
    record("transition-context", principleAdoptedContext),
    record("cognition-event", principleAdopted.event),
    record("authorization-decision", allowed),
    record("authorization-decision", confirmationRequired),
    record("domain-error", {
      code: domainError.code,
      message: domainError.message,
      details: domainError.details,
    }),
  ];
}

test("schema-layer fixtures have identical schema and runtime outcomes", () => {
  const validateSchema = compilePortableSchema();
  const expectedValidRecords = validRecords();
  const expectedSchemaInvalidFixtures = invalidFixtures().filter(
    (fixture) => fixture.validationLayer === undefined,
  );
  const sharedSchemaInvalidFixtures = schemaInvalidFixtures();
  const visitedValidRecords: string[] = [];
  const visitedInvalidFixtures: string[] = [];

  assert.equal(expectedValidRecords.length, 11);
  assert.equal(expectedSchemaInvalidFixtures.length, 16);
  assert.deepEqual(
    sharedSchemaInvalidFixtures.map((fixture) => fixture.description).sort(),
    expectedSchemaInvalidFixtures.map((fixture) => fixture.description).sort(),
  );

  for (const record of expectedValidRecords) {
    visitedValidRecords.push(JSON.stringify(record));
    assert.equal(validateSchema(record), true);
    assert.doesNotThrow(() => validatePortableCognitionRecord(record));
  }
  for (const fixture of sharedSchemaInvalidFixtures) {
    const description = String(fixture.description);
    visitedInvalidFixtures.push(description);
    assert.equal(validateSchema(fixture.record), false, description);
    assert.throws(
      () => validatePortableCognitionRecord(fixture.record),
      portableRecordError,
      description,
    );
  }
  assert.deepEqual(
    visitedValidRecords.sort(),
    expectedValidRecords.map((record) => JSON.stringify(record)).sort(),
  );
  assert.deepEqual(
    visitedInvalidFixtures.sort(),
    expectedSchemaInvalidFixtures
      .map((fixture) => String(fixture.description))
      .sort(),
  );
});

test("complete cognitive loop preserves every required family, type, status, and link", () => {
  const records = readJsonLines(cognitiveLoopFixtureUrl);
  const cognitiveObjects = records.filter(
    (record): record is PortableCognitionRecord<"cognitive-object"> =>
      record.recordType === "cognitive-object",
  );
  const contexts = records.filter(
    (record): record is PortableCognitionRecord<"transition-context"> =>
      record.recordType === "transition-context",
  );
  const events = records.filter(
    (record): record is PortableCognitionRecord<"cognition-event"> =>
      record.recordType === "cognition-event",
  );
  const authorizationDecisions = records.filter(
    (record): record is PortableCognitionRecord<"authorization-decision"> =>
      record.recordType === "authorization-decision",
  );

  assert.deepEqual(
    [...new Set(records.map((record) => record.recordType))].sort(),
    [
      "authorization-decision",
      "cognition-event",
      "cognitive-object",
      "domain-error",
      "transition-context",
    ],
  );
  assert.deepEqual(
    [...new Set(cognitiveObjects.map((record) => record.payload.type))].sort(),
    [
      "decision",
      "evidence",
      "experiment",
      "goal",
      "hypothesis",
      "identity",
      "principle",
    ],
  );
  assert.deepEqual(
    [...new Set(authorizationDecisions.map((record) => record.payload.status))].sort(),
    ["allowed", "confirmation_required"],
  );
  assert.equal(cognitiveObjects.length, 12);
  assert.equal(contexts.length, 11);
  assert.equal(events.length, 11);
  assert.equal(new Set(contexts.map((record) => record.payload.eventId)).size, 11);
  assert.deepEqual(
    contexts.map((record) => record.payload.eventId).sort(),
    events.map((record) => record.payload.id).sort(),
  );

  const objectsByVersion = new Map(
    cognitiveObjects.map((record) => [
      `${record.payload.id}:${record.payload.version}`,
      record.payload,
    ]),
  );
  for (const event of events) {
    const linkedObject = objectsByVersion.get(
      `${event.payload.objectId}:${event.payload.objectVersion}`,
    );
    assert.deepEqual(
      linkedObject === undefined
        ? undefined
        : {
            id: linkedObject.id,
            type: linkedObject.type,
            version: linkedObject.version,
          },
      {
        id: event.payload.objectId,
        type: event.payload.objectType,
        version: event.payload.objectVersion,
      },
      event.payload.id,
    );
  }
});

test("generated cognitive loop matches the differential conformance fixture", () => {
  const generatedRecords = generatedCognitiveLoopRecords();
  const cognitiveLoopFixtureRecords = readJsonLines(cognitiveLoopFixtureUrl);

  assert.deepEqual(generatedRecords, cognitiveLoopFixtureRecords);

  const validateSchema = compilePortableSchema();
  for (const record of generatedRecords) {
    assert.equal(validateSchema(record), true, JSON.stringify(validateSchema.errors));
    assert.doesNotThrow(() => validatePortableCognitionRecord(record));
  }
});
