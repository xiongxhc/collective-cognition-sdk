import assert from "node:assert/strict";
import test from "node:test";

import { createObject, transitionObject } from "../src/index.ts";
import type {
  CreateObjectInput,
  ObjectType,
  StateByType,
  TransitionContext,
} from "../src/index.ts";

const attribution = {
  initiatorId: "human:creator",
  executorId: "human:creator",
  accountableId: "human:owner",
};

const initialStates = {
  goal: "draft",
  hypothesis: "proposed",
  experiment: "planned",
  evidence: "collected",
  decision: "draft",
  principle: "proposed",
} as const;

function objectFor<T extends keyof typeof initialStates>(
  type: T,
): ReturnType<typeof createObject<T>> {
  const relationships =
    type === "hypothesis"
      ? [{ type: "supports-goal", targetId: "goal:delivery" }]
      : type === "experiment"
        ? [{ type: "tests-hypothesis", targetId: "hypothesis:delivery" }]
        : type === "evidence"
          ? [{ type: "observed-in-experiment", targetId: "experiment:delivery" }]
          : type === "decision"
            ? [
                { type: "supports-goal", targetId: "goal:delivery" },
                { type: "justified-by-evidence", targetId: "evidence:delivery" },
                { type: "considers-option", targetId: "option:ship" },
                { type: "accountable-identity", targetId: "human:owner" },
              ]
            : [{ type: "justified-by-decision", targetId: "decision:delivery" }];

  return createObject({
    id: `${type}:delivery`,
    type,
    version: 1,
    state: initialStates[type],
    title: `Delivery ${type}`,
    data: { description: `Delivery ${type}` },
    createdAt: "2026-07-24T10:00:00.000Z",
    updatedAt: "2026-07-24T10:00:00.000Z",
    attribution,
    provenance: [
      {
        source: "test",
        sourceId: `${type}:source`,
        capturedAt: "2026-07-24T10:00:00.000Z",
      },
    ],
    contextId: "organization:delivery",
    relationships,
  } as unknown as CreateObjectInput<T>);
}

function context(
  eventId: string,
  confirmationBinding?: {
    readonly objectId: string;
    readonly targetState: StateByType[ObjectType];
  },
): TransitionContext {
  return {
    eventId,
    occurredAt: "2026-07-24T11:00:00.000Z",
    initiator: { id: "human:initiator", kind: "human" },
    executor: { id: "agent:executor", kind: "agent" },
    accountableParty: { id: "human:owner", kind: "human" },
    automationMode: "automated",
    consequenceLevel: "consequential",
    rationale: "Advance the delivery cognitive loop.",
    ...(confirmationBinding === undefined
      ? {}
      : {
          confirmation: {
            actor: { id: "human:approver", kind: "human" as const },
            confirmedAt: "2026-07-24T10:59:00.000Z",
            objectId: confirmationBinding.objectId,
            targetState: confirmationBinding.targetState,
            eventId,
          },
        }),
  };
}

test("advances a complete attributed cognitive loop with one event per transition", () => {
  const goal = transitionObject(objectFor("goal"), "active", context("event:goal"));
  const hypothesisReview = transitionObject(
    objectFor("hypothesis"),
    "under_review",
    context("event:hypothesis-review"),
  );
  const hypothesis = transitionObject(
    hypothesisReview.object,
    "testing",
    context("event:hypothesis-testing"),
  );
  const experiment = transitionObject(
    objectFor("experiment"),
    "active",
    context("event:experiment"),
  );
  const evidenceAssessment = transitionObject(
    objectFor("evidence"),
    "assessed",
    context("event:evidence-assessed"),
  );
  const evidence = transitionObject(
    evidenceAssessment.object,
    "accepted",
    context("event:evidence-accepted", {
      objectId: evidenceAssessment.object.id,
      targetState: "accepted",
    }),
  );
  const decisionProposal = transitionObject(
    objectFor("decision"),
    "proposed",
    context("event:decision-proposed"),
  );
  const decision = transitionObject(
    decisionProposal.object,
    "approved",
    context("event:decision-approved", {
      objectId: decisionProposal.object.id,
      targetState: "approved",
    }),
  );
  const principleTrial = transitionObject(
    objectFor("principle"),
    "trial",
    context("event:principle-trial"),
  );
  const principle = transitionObject(
    principleTrial.object,
    "adopted",
    context("event:principle-adopted", {
      objectId: principleTrial.object.id,
      targetState: "adopted",
    }),
  );

  const results = [
    goal,
    hypothesisReview,
    hypothesis,
    experiment,
    evidenceAssessment,
    evidence,
    decisionProposal,
    decision,
    principleTrial,
    principle,
  ];

  assert.equal(goal.object.state, "active");
  assert.equal(hypothesis.object.state, "testing");
  assert.equal(experiment.object.state, "active");
  assert.equal(evidence.object.state, "accepted");
  assert.equal(decision.object.state, "approved");
  assert.equal(principle.object.state, "adopted");
  assert.equal(results.length, 10);
  assert.equal(new Set(results.map((result) => result.event.id)).size, 10);
  assert.ok(results.every((result) => result.event.objectVersion === result.object.version));
  assert.ok(
    results.every(
      (result) =>
        result.event.humanConfirmation === undefined ||
        result.event.humanConfirmation.actor.kind === "human",
    ),
  );
});
