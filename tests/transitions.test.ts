import assert from "node:assert/strict";
import test from "node:test";

import {
  createObject,
  deserializeObject,
  DomainError,
  DomainErrorCode,
  evaluateAuthorization,
  transitionObject,
} from "../src/index.ts";
import type {
  AuthorizationPolicy,
  CognitiveObject,
  CreateObjectInput,
  HumanConfirmation,
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
  identity: "active",
  goal: "draft",
  hypothesis: "proposed",
  experiment: "planned",
  evidence: "collected",
  decision: "draft",
  principle: "proposed",
} as const;

function objectFor<T extends ObjectType>(type: T): CognitiveObject<T> {
  const relationships =
    type === "hypothesis"
      ? [{ type: "supports-goal", targetId: "goal:delivery" }]
      : type === "experiment"
        ? [{ type: "tests-hypothesis", targetId: "hypothesis:delivery" }]
        : type === "evidence"
          ? [{ type: "supports-hypothesis", targetId: "hypothesis:delivery" }]
          : type === "decision"
            ? [
                { type: "supports-goal", targetId: "goal:delivery" },
                { type: "justified-by-evidence", targetId: "evidence:delivery" },
                { type: "considers-option", targetId: "option:ship" },
                { type: "accountable-identity", targetId: "human:owner" },
              ]
            : type === "principle"
              ? [{ type: "justified-by-decision", targetId: "decision:delivery" }]
              : [];

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
  } as CreateObjectInput<T>);
}

function context(overrides: Partial<TransitionContext> = {}): TransitionContext {
  return {
    eventId: "event:1",
    occurredAt: "2026-07-24T11:00:00.000Z",
    initiator: { id: "human:initiator", kind: "human" },
    executor: { id: "human:executor", kind: "human" },
    accountableParty: { id: "human:owner", kind: "human" },
    automationMode: "manual",
    consequenceLevel: "routine",
    rationale: "Validated by the delivery review.",
    ...overrides,
  };
}

function humanConfirmation(
  objectId: string,
  targetState: StateByType[ObjectType],
  eventId: string,
  confirmedAt = "2026-07-24T10:59:00.000Z",
): HumanConfirmation {
  return {
    actor: { id: "human:approver", kind: "human" },
    confirmedAt,
    objectId,
    targetState,
    eventId,
  };
}

type LifecycleCase = {
  [T in ObjectType]: {
    readonly type: T;
    readonly legal: StateByType[T];
    readonly illegal: StateByType[T];
  };
}[ObjectType];

const lifecycleCases: readonly LifecycleCase[] = [
  { type: "identity", legal: "inactive", illegal: "active" },
  { type: "goal", legal: "active", illegal: "achieved" },
  { type: "hypothesis", legal: "under_review", illegal: "testing" },
  { type: "experiment", legal: "active", illegal: "completed" },
  { type: "evidence", legal: "assessed", illegal: "accepted" },
  { type: "decision", legal: "proposed", illegal: "approved" },
  { type: "principle", legal: "trial", illegal: "adopted" },
];

interface LifecycleEdge {
  readonly type: ObjectType;
  readonly from: StateByType[ObjectType];
  readonly to: StateByType[ObjectType];
}

const lifecycleEdges: readonly LifecycleEdge[] = [
  { type: "identity", from: "active", to: "inactive" },
  { type: "identity", from: "inactive", to: "active" },
  { type: "goal", from: "draft", to: "active" },
  { type: "goal", from: "active", to: "at_risk" },
  { type: "goal", from: "active", to: "paused" },
  { type: "goal", from: "active", to: "achieved" },
  { type: "goal", from: "active", to: "abandoned" },
  { type: "goal", from: "active", to: "revised" },
  { type: "hypothesis", from: "proposed", to: "under_review" },
  { type: "hypothesis", from: "under_review", to: "testing" },
  { type: "hypothesis", from: "testing", to: "supported" },
  { type: "hypothesis", from: "testing", to: "refuted" },
  { type: "hypothesis", from: "testing", to: "inconclusive" },
  { type: "experiment", from: "planned", to: "active" },
  { type: "experiment", from: "planned", to: "cancelled" },
  { type: "experiment", from: "active", to: "completed" },
  { type: "experiment", from: "active", to: "cancelled" },
  { type: "evidence", from: "collected", to: "assessed" },
  { type: "evidence", from: "assessed", to: "accepted" },
  { type: "evidence", from: "assessed", to: "disputed" },
  { type: "evidence", from: "assessed", to: "rejected" },
  { type: "evidence", from: "assessed", to: "expired" },
  { type: "decision", from: "draft", to: "proposed" },
  { type: "decision", from: "proposed", to: "approved" },
  { type: "decision", from: "proposed", to: "rejected" },
  { type: "decision", from: "approved", to: "active" },
  { type: "decision", from: "active", to: "superseded" },
  { type: "decision", from: "superseded", to: "archived" },
  { type: "principle", from: "proposed", to: "trial" },
  { type: "principle", from: "proposed", to: "rejected" },
  { type: "principle", from: "trial", to: "adopted" },
  { type: "principle", from: "trial", to: "rejected" },
  { type: "principle", from: "adopted", to: "revised" },
  { type: "principle", from: "adopted", to: "retired" },
];

function objectAtState(
  type: ObjectType,
  state: StateByType[ObjectType],
): CognitiveObject {
  const object = objectFor(type);
  if (object.state === state) {
    return object;
  }
  return deserializeObject(JSON.stringify({ ...object, state, version: 2 }));
}

for (const edge of lifecycleEdges) {
  test(`allows ${edge.type} ${edge.from} -> ${edge.to}`, () => {
    const object = objectAtState(edge.type, edge.from);
    const eventId = `event:${edge.type}:${edge.from}:${edge.to}`;
    const result = transitionObject(
      object,
      edge.to,
      context({
        eventId,
        consequenceLevel: "consequential",
        confirmation: humanConfirmation(object.id, edge.to, eventId),
      }),
    );

    assert.equal(result.object.state, edge.to);
    assert.equal(result.object.version, object.version + 1);
    assert.equal(result.event.objectType, edge.type);
    assert.equal(result.event.previousState, edge.from);
    assert.equal(result.event.nextState, edge.to);
  });
}

test("rejects one invalid initial transition for every lifecycle", () => {
  for (const lifecycle of lifecycleCases) {
    assert.throws(
      () =>
        transitionObject(
          objectFor(lifecycle.type),
          lifecycle.illegal,
          context({ eventId: `event:invalid:${lifecycle.type}` }),
        ),
      (error: unknown) =>
        error instanceof DomainError && error.code === DomainErrorCode.INVALID_TRANSITION,
    );
  }
});

test("creates an immutable next version and a matching event", () => {
  const original = objectFor("decision");
  const proposed = transitionObject(
    original,
    "proposed",
    context({ eventId: "event:decision-proposed" }),
  ).object;
  const transitionContext = context({
    eventId: "event:decision-approved",
    occurredAt: "2026-07-24T12:00:00.000Z",
    initiator: { id: "human:reviewer", kind: "human" },
    executor: { id: "human:reviewer", kind: "human" },
    accountableParty: { id: "human:owner", kind: "human" },
    consequenceLevel: "consequential",
    confirmation: humanConfirmation(
      proposed.id,
      "approved",
      "event:decision-approved",
    ),
  });

  const result = transitionObject(proposed, "approved", transitionContext);

  assert.notEqual(result.object, proposed);
  assert.equal(proposed.version, 2);
  assert.equal(proposed.state, "proposed");
  assert.equal(result.object.version, 3);
  assert.equal(result.object.state, "approved");
  assert.equal(result.object.createdAt, original.createdAt);
  assert.equal(result.object.updatedAt, transitionContext.occurredAt);
  assert.deepEqual(result.object.attribution, {
    initiatorId: "human:reviewer",
    executorId: "human:reviewer",
    accountableId: "human:owner",
  });
  assert.equal(Object.isFrozen(result.object), true);
  assert.deepEqual(result.event, {
    id: "event:decision-approved",
    type: "DecisionApproved",
    schemaVersion: "0.1.0",
    objectId: proposed.id,
    objectType: "decision",
    objectVersion: 3,
    previousState: "proposed",
    nextState: "approved",
    occurredAt: "2026-07-24T12:00:00.000Z",
    contextId: proposed.contextId,
    initiator: transitionContext.initiator,
    executor: transitionContext.executor,
    accountableParty: transitionContext.accountableParty,
    automationMode: "manual",
    consequenceLevel: "consequential",
    rationale: "Validated by the delivery review.",
    provenance: proposed.provenance,
    humanConfirmation: humanConfirmation(
      proposed.id,
      "approved",
      "event:decision-approved",
    ),
  });
  assert.equal(Object.isFrozen(result.event), true);
});

test("requires a human confirmation for consequential transitions", () => {
  const activeGoal = transitionObject(
    objectFor("goal"),
    "active",
    context({ eventId: "event:goal-active" }),
  ).object;

  const unconfirmed = context({ eventId: "event:goal-achieved" });
  assert.deepEqual(evaluateAuthorization(activeGoal, "achieved", unconfirmed), {
    status: "confirmation_required",
    reason: "A human confirmation is required for this transition.",
    requiredActorKind: "human",
  });
  assert.throws(
    () => transitionObject(activeGoal, "achieved", unconfirmed),
    (error: unknown) =>
      error instanceof DomainError && error.code === DomainErrorCode.CONFIRMATION_REQUIRED,
  );

  const confirmed = transitionObject(
    activeGoal,
    "achieved",
    context({
      eventId: "event:goal-achieved-confirmed",
      confirmation: humanConfirmation(
        activeGoal.id,
        "achieved",
        "event:goal-achieved-confirmed",
      ),
    }),
  );
  assert.equal(confirmed.object.state, "achieved");
});

test("rejects an agent confirmation before it can satisfy a human confirmation requirement", () => {
  const activeGoal = transitionObject(
    objectFor("goal"),
    "active",
    context({ eventId: "event:goal-active" }),
  ).object;
  const agentConfirmation = {
    actor: { id: "agent:recommender", kind: "agent" },
    confirmedAt: "2026-07-24T10:59:00.000Z",
  } as unknown as HumanConfirmation;
  const automatedContext = context({
    eventId: "event:goal-achieved-agent",
    executor: { id: "agent:recommender", kind: "agent" },
    automationMode: "automated",
    confirmation: agentConfirmation,
  });

  assert.throws(
    () => evaluateAuthorization(activeGoal, "achieved", automatedContext),
    (error: unknown) =>
      error instanceof DomainError && error.code === DomainErrorCode.INVALID_OBJECT,
  );
  assert.throws(
    () => transitionObject(activeGoal, "achieved", automatedContext),
    (error: unknown) =>
      error instanceof DomainError && error.code === DomainErrorCode.INVALID_OBJECT,
  );
});

test("rejects an agent confirmation before a routine transition creates an event", () => {
  const agentConfirmation = {
    actor: { id: "agent:recommender", kind: "agent" },
    confirmedAt: "2026-07-24T10:59:00.000Z",
  } as unknown as HumanConfirmation;
  const routineContext = context({
    eventId: "event:goal-active-agent-confirmation",
    confirmation: agentConfirmation,
  });

  assert.throws(
    () => transitionObject(objectFor("goal"), "active", routineContext),
    (error: unknown) =>
      error instanceof DomainError && error.code === DomainErrorCode.INVALID_OBJECT,
  );
});

test("rejects malformed transition contexts with domain errors", () => {
  const malformedContexts: unknown[] = [
    null,
    "not-a-context",
    { ...context(), initiator: null },
    { ...context(), confirmation: null },
    {
      ...context(),
      confirmation: { actor: null, confirmedAt: "2026-07-24T10:59:00.000Z" },
    },
  ];

  for (const malformedContext of malformedContexts) {
    assert.throws(
      () =>
        transitionObject(
          objectFor("goal"),
          "active",
          malformedContext as TransitionContext,
        ),
      (error: unknown) =>
        error instanceof DomainError && error.code === DomainErrorCode.INVALID_OBJECT,
    );
  }
});

test("returns no object or event when authorization denies a transition", () => {
  const activeGoal = transitionObject(
    objectFor("goal"),
    "active",
    context({ eventId: "event:goal-active" }),
  ).object;
  const invalidContext = context({
    eventId: "event:goal-achieved-invalid-confirmation",
    executor: { id: "agent:executor", kind: "agent" },
    confirmation: {
      actor: { id: "agent:executor", kind: "human" },
      confirmedAt: "2026-07-24T10:59:00.000Z",
      objectId: activeGoal.id,
      targetState: "achieved",
      eventId: "event:goal-achieved-invalid-confirmation",
    },
  });

  assert.deepEqual(evaluateAuthorization(activeGoal, "achieved", invalidContext), {
    status: "denied",
    reason: "An agent executor cannot confirm its own transition.",
  });
  assert.throws(
    () => transitionObject(activeGoal, "achieved", invalidContext),
    (error: unknown) =>
      error instanceof DomainError && error.code === DomainErrorCode.AUTHORIZATION_DENIED,
  );
});

test("honors an injected authorization denial", () => {
  const object = objectFor("goal");
  const policy: AuthorizationPolicy = () => ({
    status: "denied",
    reason: "Denied by the integrated authorization policy.",
  });

  assert.throws(
    () =>
      transitionObject(
        object,
        "active",
        context({ eventId: "event:policy-denial" }),
        policy,
      ),
    (error: unknown) =>
      error instanceof DomainError &&
      error.code === DomainErrorCode.AUTHORIZATION_DENIED &&
      error.message === "Denied by the integrated authorization policy.",
  );
  assert.equal(object.state, "draft");
  assert.equal(object.version, 1);
});

test("passes an immutable context snapshot to injected authorization policies", () => {
  const transitionContext = {
    eventId: "event:authorization-snapshot",
    occurredAt: "2026-07-24T11:00:00.000Z",
    initiator: { id: "human:initiator", kind: "human" as const },
    executor: { id: "agent:executor", kind: "agent" as const },
    accountableParty: { id: "human:owner", kind: "human" as const },
    automationMode: "automated" as const,
    consequenceLevel: "routine" as const,
    rationale: "Use the validated authorization snapshot.",
  };
  const policy: AuthorizationPolicy = (_object, _targetState, snapshot) => {
    assert.notEqual(snapshot, transitionContext);
    assert.equal(Object.isFrozen(snapshot), true);
    assert.equal(Object.isFrozen(snapshot.initiator), true);
    assert.equal(Object.isFrozen(snapshot.executor), true);
    assert.equal(Object.isFrozen(snapshot.accountableParty), true);

    transitionContext.occurredAt = "not-a-timestamp";
    transitionContext.initiator.id = "human:mutated";
    transitionContext.executor.id = "agent:mutated";
    transitionContext.accountableParty.id = "human:mutated";
    transitionContext.rationale = "";
    return { status: "allowed" };
  };

  const result = transitionObject(
    objectFor("goal"),
    "active",
    transitionContext,
    policy,
  );

  assert.equal(result.object.updatedAt, "2026-07-24T11:00:00.000Z");
  assert.deepEqual(result.object.attribution, {
    initiatorId: "human:initiator",
    executorId: "agent:executor",
    accountableId: "human:owner",
  });
  assert.equal(
    result.event.rationale,
    "Use the validated authorization snapshot.",
  );
});

test("fails closed when an authorization policy mutates its context", () => {
  const object = objectFor("goal");
  const policy: AuthorizationPolicy = (_object, _targetState, snapshot) => {
    (snapshot.executor as { id: string }).id = "agent:attacker";
    return { status: "allowed" };
  };

  assert.throws(
    () =>
      transitionObject(
        object,
        "active",
        context({ eventId: "event:policy-mutation" }),
        policy,
      ),
    (error: unknown) =>
      error instanceof DomainError &&
      error.code === DomainErrorCode.AUTHORIZATION_DENIED &&
      error.message === "Authorization policy failed." &&
      Object.keys(error.details).length === 0,
  );
  assert.equal(object.state, "draft");
  assert.equal(object.version, 1);
});

test("accepts only exact closed authorization decisions", () => {
  const invalidDecisions: readonly unknown[] = [
    { status: "allow" },
    { status: "allowed", reason: "Unexpected field." },
    { status: "denied" },
    { status: "denied", reason: "Denied.", extra: true },
    {
      status: "confirmation_required",
      reason: "Confirmation required.",
      requiredActorKind: "agent",
    },
    null,
  ];

  for (const decision of invalidDecisions) {
    const policy = (() => decision) as AuthorizationPolicy;
    assert.throws(
      () =>
        transitionObject(
          objectFor("goal"),
          "active",
          context({ eventId: "event:invalid-policy-decision" }),
          policy,
        ),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === DomainErrorCode.AUTHORIZATION_DENIED &&
        error.message ===
          "Authorization policy returned an invalid decision." &&
        Object.keys(error.details).length === 0,
      JSON.stringify(decision),
    );
  }
});

test("rejects confirmations replayed across objects, states, or events", () => {
  const activeGoal = transitionObject(
    objectFor("goal"),
    "active",
    context({ eventId: "event:goal-active-for-binding" }),
  ).object;
  const eventId = "event:goal-achieved-binding";
  const validConfirmation = humanConfirmation(
    activeGoal.id,
    "achieved",
    eventId,
  );
  const mismatches: readonly HumanConfirmation[] = [
    { ...validConfirmation, objectId: "goal:another" },
    { ...validConfirmation, targetState: "abandoned" },
    { ...validConfirmation, eventId: "event:replayed" },
  ];

  for (const confirmation of mismatches) {
    const transitionContext = context({ eventId, confirmation });
    assert.throws(
      () => evaluateAuthorization(activeGoal, "achieved", transitionContext),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === DomainErrorCode.INVALID_OBJECT,
    );
    assert.throws(
      () => transitionObject(activeGoal, "achieved", transitionContext),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === DomainErrorCode.INVALID_OBJECT,
    );
  }
});

test("rejects transitions occurring before the current object version", () => {
  const activeGoal = transitionObject(
    objectFor("goal"),
    "active",
    context({
      eventId: "event:goal-active-for-chronology",
      occurredAt: "2026-07-24T11:00:00.000Z",
    }),
  ).object;

  assert.throws(
    () =>
      transitionObject(
        activeGoal,
        "paused",
        context({
          eventId: "event:goal-paused-in-the-past",
          occurredAt: "2026-07-24T10:59:59.999Z",
        }),
      ),
    (error: unknown) =>
      error instanceof DomainError &&
      error.code === DomainErrorCode.INVALID_OBJECT,
  );
});

test("rejects confirmations made after their transition event", () => {
  const activeGoal = transitionObject(
    objectFor("goal"),
    "active",
    context({ eventId: "event:goal-active-for-confirmation-time" }),
  ).object;
  const eventId = "event:goal-achieved-future-confirmation";

  assert.throws(
    () =>
      transitionObject(
        activeGoal,
        "achieved",
        context({
          eventId,
          occurredAt: "2026-07-24T12:00:00.000Z",
          confirmation: humanConfirmation(
            activeGoal.id,
            "achieved",
            eventId,
            "2026-07-24T12:00:00.001Z",
          ),
        }),
      ),
    (error: unknown) =>
      error instanceof DomainError &&
      error.code === DomainErrorCode.INVALID_OBJECT,
  );
});

test("accepts equal object, event, and confirmation timestamps", () => {
  const original = objectFor("goal");
  const active = transitionObject(
    original,
    "active",
    context({
      eventId: "event:goal-active-at-creation",
      occurredAt: original.updatedAt,
    }),
  ).object;
  const eventId = "event:goal-achieved-at-same-time";
  const achieved = transitionObject(
    active,
    "achieved",
    context({
      eventId,
      occurredAt: active.updatedAt,
      confirmation: humanConfirmation(
        active.id,
        "achieved",
        eventId,
        active.updatedAt,
      ),
    }),
  );

  assert.equal(achieved.object.updatedAt, active.updatedAt);
  assert.equal(achieved.event.humanConfirmation?.confirmedAt, active.updatedAt);
});
