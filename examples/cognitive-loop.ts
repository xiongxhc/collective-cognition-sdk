import {
  createObject,
  DomainError,
  DomainErrorCode,
  transitionObject,
} from "../src/index.ts";
import type {
  CognitiveObject,
  CognitionEvent,
  ObjectType,
  StateByType,
  TransitionContext,
} from "../src/index.ts";

const createdAt = "2026-07-24T10:00:00.000Z";
const contextId = "organization:example-team";

const human = createObject({
  id: "human:example-owner",
  type: "identity",
  version: 1,
  state: "active",
  title: "Example accountable owner",
  data: {
    actorKind: "human",
    displayName: "Example Owner",
  },
  createdAt,
  updatedAt: createdAt,
  attribution: {
    initiatorId: "human:example-owner",
    executorId: "human:example-owner",
    accountableId: "human:example-owner",
  },
  provenance: [
    {
      source: "example",
      sourceId: "identity:human",
      capturedAt: createdAt,
    },
  ],
  contextId,
  relationships: [],
});

const agent = createObject({
  id: "agent:example-researcher",
  type: "identity",
  version: 1,
  state: "active",
  title: "Example research agent",
  data: {
    actorKind: "agent",
    displayName: "Example Researcher",
  },
  createdAt,
  updatedAt: createdAt,
  attribution: {
    initiatorId: human.id,
    executorId: human.id,
    accountableId: human.id,
  },
  provenance: [
    {
      source: "example",
      sourceId: "identity:agent",
      capturedAt: createdAt,
    },
  ],
  contextId,
  relationships: [],
});

const attribution = {
  initiatorId: human.id,
  executorId: agent.id,
  accountableId: human.id,
};

function provenance(sourceId: string) {
  return [
    {
      source: "example",
      sourceId,
      capturedAt: createdAt,
    },
  ];
}

const goal = createObject({
  id: "goal:safer-releases",
  type: "goal",
  version: 1,
  state: "draft",
  title: "Make releases safer",
  data: {
    objective: "Reduce avoidable release failures.",
    successCriteria: ["Every release uses a verified preflight check."],
  },
  createdAt,
  updatedAt: createdAt,
  attribution,
  provenance: provenance("goal"),
  contextId,
  relationships: [],
});

const hypothesis = createObject({
  id: "hypothesis:preflight-checks",
  type: "hypothesis",
  version: 1,
  state: "proposed",
  title: "Preflight checks reduce release failures",
  data: {
    statement: "A repeatable preflight check catches release blockers early.",
    scope: "Example team releases",
  },
  createdAt,
  updatedAt: createdAt,
  attribution,
  provenance: provenance("hypothesis"),
  contextId,
  relationships: [{ type: "supports-goal", targetId: goal.id }],
});

const experiment = createObject({
  id: "experiment:release-preflight",
  type: "experiment",
  version: 1,
  state: "planned",
  title: "Run release preflight checks",
  data: {
    action: "Run the same preflight checklist before three releases.",
    expectedOutcome: "Blocking issues are found before deployment.",
    successCriteria: ["At least one pre-deployment blocker is identified."],
  },
  createdAt,
  updatedAt: createdAt,
  attribution,
  provenance: provenance("experiment"),
  contextId,
  relationships: [{ type: "tests-hypothesis", targetId: hypothesis.id }],
});

const evidence = createObject({
  id: "evidence:preflight-results",
  type: "evidence",
  version: 1,
  state: "collected",
  title: "Preflight checks found release blockers",
  data: {
    statement: "Two blockers were found before deployment across three releases.",
    evidenceKind: "experiment-result",
    polarity: "supports",
    sourceActorId: agent.id,
  },
  createdAt,
  updatedAt: createdAt,
  attribution,
  provenance: provenance("evidence"),
  contextId,
  relationships: [
    { type: "supports-hypothesis", targetId: hypothesis.id },
    { type: "observed-in-experiment", targetId: experiment.id },
  ],
});

const decision = createObject({
  id: "decision:require-preflight",
  type: "decision",
  version: 1,
  state: "draft",
  title: "Require release preflight checks",
  data: {
    selectedOption: "Require the checklist before each release.",
    rejectedOptions: ["Keep the checklist optional."],
    rationale: "The experiment found preventable blockers before deployment.",
  },
  createdAt,
  updatedAt: createdAt,
  attribution,
  provenance: provenance("decision"),
  contextId,
  relationships: [
    { type: "supports-goal", targetId: goal.id },
    { type: "justified-by-evidence", targetId: evidence.id },
    { type: "considers-option", targetId: "option:required-preflight" },
    { type: "accountable-identity", targetId: human.id },
  ],
});

const principle = createObject({
  id: "principle:verify-before-release",
  type: "principle",
  version: 1,
  state: "proposed",
  title: "Verify before release",
  data: {
    rule: "Run and record the agreed preflight checks before every release.",
    rationale: "Repeated preflight checks exposed preventable release blockers.",
  },
  createdAt,
  updatedAt: createdAt,
  attribution,
  provenance: provenance("principle"),
  contextId,
  relationships: [{ type: "justified-by-decision", targetId: decision.id }],
});

const successfulEvents: CognitionEvent[] = [];
let minute = 1;

function transitionContext(
  eventId: string,
  confirmationBinding?: {
    readonly objectId: string;
    readonly targetState: StateByType[ObjectType];
  },
): TransitionContext {
  const occurredAt = `2026-07-24T10:${String(minute).padStart(2, "0")}:00.000Z`;
  minute += 1;
  return {
    eventId,
    occurredAt,
    initiator: { id: agent.id, kind: "agent" },
    executor: { id: agent.id, kind: "agent" },
    accountableParty: { id: human.id, kind: "human" },
    automationMode: "automated",
    consequenceLevel: "consequential",
    rationale: "Advance the example cognitive loop.",
    ...(confirmationBinding === undefined
      ? {}
      : {
          confirmation: {
            actor: { id: human.id, kind: "human" as const },
            confirmedAt: occurredAt,
            objectId: confirmationBinding.objectId,
            targetState: confirmationBinding.targetState,
            eventId,
          },
        }),
  };
}

function advance<T extends ObjectType>(
  object: CognitiveObject<T>,
  targetState: StateByType[T],
  eventId: string,
  confirmed = false,
): CognitiveObject<T> {
  const result = transitionObject(
    object,
    targetState,
    transitionContext(
      eventId,
      confirmed ? { objectId: object.id, targetState } : undefined,
    ),
  );
  successfulEvents.push(result.event);
  return result.object;
}

const activeGoal = advance(goal, "active", "event:goal-active");
const reviewedHypothesis = advance(
  hypothesis,
  "under_review",
  "event:hypothesis-reviewed",
);
const testedHypothesis = advance(
  reviewedHypothesis,
  "testing",
  "event:hypothesis-testing",
);
const activeExperiment = advance(
  experiment,
  "active",
  "event:experiment-active",
);
const completedExperiment = advance(
  activeExperiment,
  "completed",
  "event:experiment-completed",
);
const assessedEvidence = advance(
  evidence,
  "assessed",
  "event:evidence-assessed",
);
const acceptedEvidence = advance(
  assessedEvidence,
  "accepted",
  "event:evidence-accepted",
  true,
);
const proposedDecision = advance(
  decision,
  "proposed",
  "event:decision-proposed",
);

let unconfirmedApprovalError: DomainError | undefined;
try {
  transitionObject(
    proposedDecision,
    "approved",
    transitionContext("event:decision-unconfirmed"),
  );
} catch (error) {
  if (
    !(error instanceof DomainError) ||
    error.code !== DomainErrorCode.CONFIRMATION_REQUIRED
  ) {
    throw error;
  }
  unconfirmedApprovalError = error;
}

if (unconfirmedApprovalError === undefined) {
  throw new Error("Expected unconfirmed decision approval to be rejected.");
}

const approvedDecision = advance(
  proposedDecision,
  "approved",
  "event:decision-approved",
  true,
);
const trialPrinciple = advance(
  principle,
  "trial",
  "event:principle-trial",
);
const adoptedPrinciple = advance(
  trialPrinciple,
  "adopted",
  "event:principle-adopted",
  true,
);

const chain = [
  activeGoal,
  testedHypothesis,
  completedExperiment,
  acceptedEvidence,
  approvedDecision,
  adoptedPrinciple,
];

console.log(`Actors: ${human.id} accountable; ${agent.id} executes`);
console.log(
  `Chain: ${chain
    .map(
      (object) =>
        `${object.type[0].toUpperCase()}${object.type.slice(1)}(${object.id})[${object.state}]`,
    )
    .join(" → ")}`,
);
console.log(
  `Unconfirmed decision approval: rejected (${unconfirmedApprovalError.code})`,
);
console.log(
  `Human-confirmed decision approval: ${approvedDecision.state} by ${human.id}`,
);
console.log(`Successful events: ${successfulEvents.length}`);
