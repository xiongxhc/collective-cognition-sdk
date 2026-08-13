import { createObject } from "../objects.ts";
import { createPortableCognitionRecord, serializePortableCognitionRecord } from "../portable-cognition.ts";
import { createSourceRecord } from "../source-records.ts";
import { prepareDurableCognitionWorkflow } from "./durable-prepare.ts";
import type {
  CognitionWorkflowStore,
  DurableCognitionCommitResult,
  DurableCognitionWorkflowRequest,
  DurableWorkflowConformanceCaseResult,
  DurableWorkflowConformanceReport,
  DurableWorkflowConflictCode,
  DurableWorkflowStoreConformanceScenario,
  DurableWorkflowStoreFactory,
  PreparedDurableCognitionCommit,
} from "./durable-contract.ts";
import type { TransitionCognitionCommit } from "../host-integration.ts";

type FreshStore = (
  scenario?: DurableWorkflowStoreConformanceScenario,
) => Promise<CognitionWorkflowStore>;

interface ConformanceCase {
  readonly id: string;
  readonly run: (createStore: FreshStore) => Promise<void>;
}

function assertConformance(condition: unknown): asserts condition {
  if (!condition) {
    throw new Error("Durable workflow conformance assertion failed.");
  }
}

function policy() {
  return {
    id: "durable-workflow-conformance",
    version: "1",
    map() {
      return {
        title: "Durable workflow conformance evidence",
        statement: "The store satisfies the durable workflow contract.",
        evidenceKind: "activity" as const,
        polarity: "neutral" as const,
      };
    },
  };
}

function prepared({
  workflowId,
  hypothesisId = "hypothesis:durable-workflow-conformance",
  hypothesisTitle = "Durable workflow conformance hypothesis",
  eventId = "event:durable-workflow-conformance",
  sourceId = workflowId,
  sourceSummary = "Durable workflow conformance evidence.",
}: {
  readonly workflowId: string;
  readonly hypothesisId?: string;
  readonly hypothesisTitle?: string;
  readonly eventId?: string;
  readonly sourceId?: string;
  readonly sourceSummary?: string;
}): PreparedDurableCognitionCommit {
  const hypothesis = createObject({
    id: hypothesisId,
    type: "hypothesis",
    version: 1,
    state: "proposed",
    title: hypothesisTitle,
    data: { statement: "The durable workflow store is atomic." },
    createdAt: "2026-08-13T08:00:00.000Z",
    updatedAt: "2026-08-13T08:00:00.000Z",
    attribution: {
      initiatorId: "human:creator",
      executorId: "human:creator",
      accountableId: "human:owner",
    },
    provenance: [{
      source: "durable-workflow-conformance",
      sourceId: `${sourceId}:hypothesis`,
      capturedAt: "2026-08-13T08:00:00.000Z",
    }],
    contextId: `context:${hypothesisId}`,
    relationships: [{ type: "supports-goal", targetId: "goal:durable-workflow" }],
  });
  const request: DurableCognitionWorkflowRequest = {
    workflowVersion: "0.1.0",
    workflowId,
    records: [createSourceRecord({
      id: `source-record:${sourceId}`,
      source: { system: "durable-workflow-conformance" },
      sourceId,
      revisionId: "1",
      capturedAt: "2026-08-13T09:00:00.000Z",
      mediaType: "application/json",
      content: { summary: sourceSummary },
    })],
    hypothesis,
    promotion: {
      hypothesisId: hypothesis.id,
      contextId: hypothesis.contextId,
      rationale: "The record is relevant to the hypothesis.",
      promotedAt: "2026-08-13T09:00:00.000Z",
      attribution: {
        initiatorId: "human:reviewer",
        executorId: "human:reviewer",
        accountableId: "human:owner",
      },
    },
    reviewTransition: {
      eventId,
      occurredAt: "2026-08-13T10:00:00.000Z",
      initiator: { id: "human:reviewer", kind: "human" },
      executor: { id: "human:reviewer", kind: "human" },
      accountableParty: { id: "human:owner", kind: "human" },
      automationMode: "manual",
      consequenceLevel: "routine",
      rationale: "Review the durable workflow hypothesis.",
    },
    policy: policy(),
  };
  return prepareDurableCognitionWorkflow(request);
}

function matches(
  left: Parameters<typeof serializePortableCognitionRecord>[0],
  right: Parameters<typeof serializePortableCognitionRecord>[0],
): boolean {
  return serializePortableCognitionRecord(left) === serializePortableCognitionRecord(right);
}

function isDeepFrozen(value: unknown): boolean {
  return typeof value !== "object" || value === null || (
    Object.isFrozen(value) && Object.values(value).every(isDeepFrozen)
  );
}

function assertDetachedRecursively(
  callerValue: unknown,
  readValue: unknown,
  seen = new WeakMap<object, WeakSet<object>>(),
): void {
  const callerIsObject = typeof callerValue === "object" && callerValue !== null;
  const readIsObject = typeof readValue === "object" && readValue !== null;
  assertConformance(callerIsObject === readIsObject);
  if (!callerIsObject || !readIsObject) return;

  assertConformance(callerValue !== readValue);
  let pairedReads = seen.get(callerValue);
  if (pairedReads?.has(readValue)) return;
  if (pairedReads === undefined) {
    pairedReads = new WeakSet<object>();
    seen.set(callerValue, pairedReads);
  }
  pairedReads.add(readValue);

  const callerKeys = Reflect.ownKeys(callerValue).filter(
    (key) => Object.getOwnPropertyDescriptor(callerValue, key)?.enumerable,
  );
  const readKeys = Reflect.ownKeys(readValue).filter(
    (key) => Object.getOwnPropertyDescriptor(readValue, key)?.enumerable,
  );
  assertConformance(callerKeys.length === readKeys.length);
  for (const key of callerKeys) {
    const callerDescriptor = Object.getOwnPropertyDescriptor(callerValue, key);
    const readDescriptor = Object.getOwnPropertyDescriptor(readValue, key);
    assertConformance(
      callerDescriptor !== undefined &&
        readDescriptor !== undefined &&
        "value" in callerDescriptor &&
        "value" in readDescriptor,
    );
    assertDetachedRecursively(callerDescriptor.value, readDescriptor.value, seen);
  }
}

function assertConflict(
  result: DurableCognitionCommitResult,
  code: DurableWorkflowConflictCode,
): void {
  assertConformance(result.status === "conflict" && result.conflict.code === code);
}

async function assertRejected(action: () => Promise<unknown>): Promise<void> {
  let rejected = false;
  try {
    await action();
  } catch {
    rejected = true;
  }
  assertConformance(rejected);
}

interface WorkflowReadSnapshot {
  readonly initialHypothesis: string | undefined;
  readonly evidence: string | undefined;
  readonly reviewedHypothesis: string | undefined;
  readonly latestHypothesis: string | undefined;
  readonly events: readonly string[];
}

function snapshotRecord(
  record: Parameters<typeof serializePortableCognitionRecord>[0] | undefined,
): string | undefined {
  return record === undefined
    ? undefined
    : serializePortableCognitionRecord(record);
}

async function snapshotWorkflow(
  store: CognitionWorkflowStore,
  workflow: PreparedDurableCognitionCommit,
): Promise<WorkflowReadSnapshot> {
  return Object.freeze({
    initialHypothesis: snapshotRecord(
      await store.getObjectVersion(workflow.initialHypothesis.payload.id, 1),
    ),
    evidence: snapshotRecord(
      await store.getObjectVersion(workflow.evidence.payload.id, 1),
    ),
    reviewedHypothesis: snapshotRecord(
      await store.getObjectVersion(workflow.reviewedHypothesis.payload.id, 2),
    ),
    latestHypothesis: snapshotRecord(
      await store.getLatestObject(workflow.reviewedHypothesis.payload.id),
    ),
    events: Object.freeze(
      (await store.listObjectEvents(workflow.reviewedHypothesis.payload.id))
        .map(serializePortableCognitionRecord),
    ),
  });
}

async function assertUnchangedWorkflow(
  store: CognitionWorkflowStore,
  workflow: PreparedDurableCognitionCommit,
  before: WorkflowReadSnapshot,
): Promise<void> {
  const after = await snapshotWorkflow(store, workflow);
  assertConformance(
    after.initialHypothesis === before.initialHypothesis &&
      after.evidence === before.evidence &&
      after.reviewedHypothesis === before.reviewedHypothesis &&
      after.latestHypothesis === before.latestHypothesis &&
      after.events.length === before.events.length &&
      after.events.every((event, index) => event === before.events[index]),
  );
}

async function assertConflictWithoutMutation(
  store: CognitionWorkflowStore,
  request: PreparedDurableCognitionCommit,
  code: DurableWorkflowConflictCode,
  workflows: readonly PreparedDurableCognitionCommit[],
  receiptOwners: readonly PreparedDurableCognitionCommit[] = [],
): Promise<void> {
  const snapshots = await Promise.all(
    workflows.map((workflow) => snapshotWorkflow(store, workflow)),
  );
  assertConflict(await store.commitWorkflow(request), code);
  await Promise.all(
    workflows.map((workflow, index) =>
      assertUnchangedWorkflow(store, workflow, snapshots[index])
    ),
  );
  for (const workflow of receiptOwners) {
    assertConformance((await store.commitWorkflow(workflow)).status === "already_committed");
    await assertWorkflowIntact(store, workflow);
  }
  assertConflict(await store.commitWorkflow(request), code);
  await Promise.all(
    workflows.map((workflow, index) =>
      assertUnchangedWorkflow(store, workflow, snapshots[index])
    ),
  );
}

async function assertRejectedWithoutMutation(
  store: CognitionWorkflowStore,
  request: PreparedDurableCognitionCommit,
): Promise<void> {
  const before = await snapshotWorkflow(store, request);
  await assertRejected(() => store.commitWorkflow(request));
  await assertUnchangedWorkflow(store, request, before);
  assertConformance((await store.commitWorkflow(request)).status === "committed");
  await assertWorkflowIntact(store, request);
  assertConformance((await store.commitWorkflow(request)).status === "already_committed");
  await assertWorkflowIntact(store, request);
}

async function assertWorkflowIntact(
  store: CognitionWorkflowStore,
  workflow: PreparedDurableCognitionCommit,
): Promise<void> {
  assertConformance(matches(
    (await store.getObjectVersion(workflow.initialHypothesis.payload.id, 1))!,
    workflow.initialHypothesis,
  ));
  assertConformance(matches(
    (await store.getObjectVersion(workflow.evidence.payload.id, 1))!,
    workflow.evidence,
  ));
  assertConformance(matches(
    (await store.getObjectVersion(workflow.reviewedHypothesis.payload.id, 2))!,
    workflow.reviewedHypothesis,
  ));
  assertConformance(matches(
    (await store.getLatestObject(workflow.reviewedHypothesis.payload.id))!,
    workflow.reviewedHypothesis,
  ));
  const events = await store.listObjectEvents(workflow.reviewedHypothesis.payload.id);
  assertConformance(events.length === 1 && matches(events[0], workflow.event));
}

const conformanceCases: readonly ConformanceCase[] = [
  {
    id: "atomic-commit",
    async run(createStore) {
      const store = await createStore();
      const workflow = prepared({ workflowId: "workflow:conformance:atomic" });
      assertConformance((await store.commitWorkflow(workflow)).status === "committed");
      await assertWorkflowIntact(store, workflow);
    },
  },
  {
    id: "exact-replay",
    async run(createStore) {
      const store = await createStore();
      const workflow = prepared({ workflowId: "workflow:conformance:replay" });
      assertConformance((await store.commitWorkflow(workflow)).status === "committed");
      assertConformance((await store.commitWorkflow(workflow)).status === "already_committed");
      await assertWorkflowIntact(store, workflow);
    },
  },
  {
    id: "workflow-id-collision",
    async run(createStore) {
      const store = await createStore();
      const first = prepared({ workflowId: "workflow:conformance:workflow-collision" });
      const collision = prepared({
        workflowId: first.workflowId,
        sourceSummary: "Changed workflow content.",
      });
      assertConformance((await store.commitWorkflow(first)).status === "committed");
      await assertConflictWithoutMutation(
        store,
        collision,
        "workflow_id_collision",
        [first, collision],
        [first],
      );
    },
  },
  {
    id: "object-collision",
    async run(createStore) {
      const store = await createStore();
      const first = prepared({ workflowId: "workflow:conformance:object-first" });
      const collision = prepared({
        workflowId: "workflow:conformance:object-collision",
        hypothesisTitle: "Changed workflow hypothesis",
        eventId: "event:conformance:object-collision",
        sourceId: "conformance:object-collision",
      });
      assertConformance((await store.commitWorkflow(first)).status === "committed");
      await assertConflictWithoutMutation(
        store,
        collision,
        "object_revision_collision",
        [first, collision],
        [first],
      );
      const reviewedCollision = prepared({
        workflowId: "workflow:conformance:reviewed-collision",
        eventId: "event:conformance:reviewed-collision",
        sourceId: first.workflowId,
      });
      await assertConflictWithoutMutation(
        store,
        reviewedCollision,
        "object_revision_collision",
        [first, reviewedCollision],
        [first],
      );
      const overlappingCollision = prepared({
        workflowId: "workflow:conformance:overlapping-collision",
        hypothesisTitle: "Changed overlapping workflow hypothesis",
        eventId: first.event.payload.id,
        sourceId: "conformance:overlapping-collision",
      });
      await assertConflictWithoutMutation(
        store,
        overlappingCollision,
        "object_revision_collision",
        [first, overlappingCollision],
        [first],
      );
      await assertWorkflowIntact(store, first);
    },
  },
  {
    id: "event-collision",
    async run(createStore) {
      const store = await createStore();
      const first = prepared({
        workflowId: "workflow:conformance:event-first",
        eventId: "event:conformance:shared",
      });
      const collision = prepared({
        workflowId: "workflow:conformance:event-collision",
        hypothesisId: "hypothesis:conformance:event-collision",
        eventId: first.event.payload.id,
        sourceId: "conformance:event-collision",
      });
      assertConformance((await store.commitWorkflow(first)).status === "committed");
      await assertConflictWithoutMutation(
        store,
        collision,
        "event_id_collision",
        [first, collision],
        [first],
      );
    },
  },
  {
    id: "version-conflict",
    async run(createStore) {
      const workflow = prepared({ workflowId: "workflow:conformance:version" });
      const store = await createStore({ kind: "version-conflict", workflow });
      await assertConflictWithoutMutation(
        store,
        workflow,
        "version_conflict",
        [workflow],
      );
    },
  },
  {
    id: "incomplete-workflow",
    async run(createStore) {
      const store = await createStore();
      const workflow = prepared({ workflowId: "workflow:conformance:incomplete" });
      assertConformance(
        (await store.commitInitial({ object: workflow.initialHypothesis })).status === "committed",
      );
      assertConformance(
        (await store.commitInitial({ object: workflow.evidence })).status === "committed",
      );
      const transition: TransitionCognitionCommit = {
        expectedVersion: workflow.expectedHypothesisVersion,
        object: workflow.reviewedHypothesis,
        event: workflow.event,
      };
      assertConformance((await store.commitTransition(transition)).status === "committed");
      await assertConflictWithoutMutation(
        store,
        workflow,
        "incomplete_workflow",
        [workflow],
      );
    },
  },
  {
    id: "rollback",
    async run(createStore) {
      const workflow = prepared({ workflowId: "workflow:conformance:rollback" });
      const store = await createStore({ kind: "rollback", workflow });
      await assertRejectedWithoutMutation(store, workflow);
    },
  },
  {
    id: "detached-reads",
    async run(createStore) {
      const store = await createStore();
      const workflow = prepared({ workflowId: "workflow:conformance:detached" });
      assertConformance((await store.commitWorkflow(workflow)).status === "committed");
      const object = await store.getLatestObject(workflow.reviewedHypothesis.payload.id);
      const initial = await store.getObjectVersion(workflow.initialHypothesis.payload.id, 1);
      const evidence = await store.getObjectVersion(workflow.evidence.payload.id, 1);
      const reviewed = await store.getObjectVersion(workflow.reviewedHypothesis.payload.id, 2);
      const events = await store.listObjectEvents(workflow.reviewedHypothesis.payload.id);
      const repeatedObject = await store.getLatestObject(workflow.reviewedHypothesis.payload.id);
      const repeatedInitial = await store.getObjectVersion(workflow.initialHypothesis.payload.id, 1);
      const repeatedEvidence = await store.getObjectVersion(workflow.evidence.payload.id, 1);
      const repeatedReviewed = await store.getObjectVersion(workflow.reviewedHypothesis.payload.id, 2);
      const repeatedEvents = await store.listObjectEvents(workflow.reviewedHypothesis.payload.id);
      assertConformance(
        object !== undefined && initial !== undefined && evidence !== undefined &&
          reviewed !== undefined && events.length === 1 && repeatedObject !== undefined &&
          repeatedInitial !== undefined && repeatedEvidence !== undefined &&
          repeatedReviewed !== undefined && repeatedEvents.length === 1,
      );
      const preparedEvents = Object.freeze([workflow.event]);
      assertDetachedRecursively(object, workflow.reviewedHypothesis);
      assertDetachedRecursively(initial, workflow.initialHypothesis);
      assertDetachedRecursively(evidence, workflow.evidence);
      assertDetachedRecursively(reviewed, workflow.reviewedHypothesis);
      assertDetachedRecursively(events, preparedEvents);
      assertDetachedRecursively(object, repeatedObject);
      assertDetachedRecursively(initial, repeatedInitial);
      assertDetachedRecursively(evidence, repeatedEvidence);
      assertDetachedRecursively(reviewed, repeatedReviewed);
      assertDetachedRecursively(events, repeatedEvents);
      assertConformance(
        isDeepFrozen(object) && isDeepFrozen(initial) && isDeepFrozen(evidence) &&
          isDeepFrozen(reviewed) && isDeepFrozen(events) &&
          isDeepFrozen(repeatedObject) && isDeepFrozen(repeatedInitial) &&
          isDeepFrozen(repeatedEvidence) && isDeepFrozen(repeatedReviewed) &&
          isDeepFrozen(repeatedEvents),
      );
      assertConformance(
        object !== workflow.reviewedHypothesis &&
          object.payload !== workflow.reviewedHypothesis.payload &&
          initial !== workflow.initialHypothesis &&
          initial.payload !== workflow.initialHypothesis.payload &&
          evidence !== workflow.evidence &&
          evidence.payload !== workflow.evidence.payload &&
          reviewed !== workflow.reviewedHypothesis &&
          reviewed.payload !== workflow.reviewedHypothesis.payload &&
          events[0] !== workflow.event &&
          events[0].payload !== workflow.event.payload,
      );
      assertConformance(
        object !== repeatedObject && initial !== repeatedInitial &&
          evidence !== repeatedEvidence && reviewed !== repeatedReviewed &&
          events !== repeatedEvents && events[0] !== repeatedEvents[0],
      );
      try {
        (object.payload as { title: string }).title = "Caller mutation";
      } catch {
      }
      try {
        (initial.payload as { title: string }).title = "Caller mutation";
      } catch {
      }
      try {
        (evidence.payload as { title: string }).title = "Caller mutation";
      } catch {
      }
      try {
        (reviewed.payload as { title: string }).title = "Caller mutation";
      } catch {
      }
      try {
        (events[0].payload as { rationale: string }).rationale = "Caller mutation";
      } catch {
      }
      assertConformance(matches(
        (await store.getLatestObject(workflow.reviewedHypothesis.payload.id))!,
        workflow.reviewedHypothesis,
      ));
      assertConformance(matches(
        (await store.getObjectVersion(workflow.initialHypothesis.payload.id, 1))!,
        workflow.initialHypothesis,
      ));
      assertConformance(matches(
        (await store.getObjectVersion(workflow.evidence.payload.id, 1))!,
        workflow.evidence,
      ));
      assertConformance(matches(
        (await store.getObjectVersion(workflow.reviewedHypothesis.payload.id, 2))!,
        workflow.reviewedHypothesis,
      ));
      assertConformance(matches(
        (await store.listObjectEvents(workflow.reviewedHypothesis.payload.id))[0],
        workflow.event,
      ));
    },
  },
  {
    id: "factory-isolation",
    async run(createStore) {
      await createStore();
    },
  },
];

export async function runDurableWorkflowStoreConformance(
  factory: DurableWorkflowStoreFactory,
): Promise<DurableWorkflowConformanceReport> {
  const seen = new Set<object>();
  const createStore: FreshStore = async (scenario) => {
    const store = await factory(scenario);
    if (typeof store !== "object" || store === null || seen.has(store)) {
      throw new Error("Durable workflow store factory is invalid.");
    }
    seen.add(store);
    return store;
  };
  const results: DurableWorkflowConformanceCaseResult[] = [];
  for (const conformanceCase of conformanceCases) {
    try {
      await conformanceCase.run(createStore);
      results.push(Object.freeze({ id: conformanceCase.id, status: "passed" }));
    } catch {
      results.push(Object.freeze({
        id: conformanceCase.id,
        status: "failed",
        message: "Durable workflow conformance case failed.",
      }));
    }
  }
  const cases = Object.freeze(results);
  return Object.freeze({
    contractVersion: "0.1.0",
    passed: cases.every((result) => result.status === "passed"),
    cases,
  });
}
