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
  PreparedDurableCognitionCommit,
} from "./durable-contract.ts";
import type { TransitionCognitionCommit } from "../host-integration.ts";

type StoreFactory = () => Promise<CognitionWorkflowStore> | CognitionWorkflowStore;
type FreshStore = () => Promise<CognitionWorkflowStore>;

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

function assertConflict(
  result: DurableCognitionCommitResult,
  code: DurableWorkflowConflictCode,
): void {
  assertConformance(result.status === "conflict" && result.conflict.code === code);
}

const conformanceCases: readonly ConformanceCase[] = [
  {
    id: "atomic-commit",
    async run(createStore) {
      const store = await createStore();
      const workflow = prepared({ workflowId: "workflow:conformance:atomic" });
      assertConformance((await store.commitWorkflow(workflow)).status === "committed");
      assertConformance(matches(
        (await store.getObjectVersion(workflow.initialHypothesis.payload.id, 1))!,
        workflow.initialHypothesis,
      ));
      assertConformance(matches(
        (await store.getObjectVersion(workflow.evidence.payload.id, 1))!,
        workflow.evidence,
      ));
      assertConformance(matches(
        (await store.getLatestObject(workflow.reviewedHypothesis.payload.id))!,
        workflow.reviewedHypothesis,
      ));
      const events = await store.listObjectEvents(workflow.reviewedHypothesis.payload.id);
      assertConformance(events.length === 1 && matches(events[0], workflow.event));
    },
  },
  {
    id: "exact-replay",
    async run(createStore) {
      const store = await createStore();
      const workflow = prepared({ workflowId: "workflow:conformance:replay" });
      assertConformance((await store.commitWorkflow(workflow)).status === "committed");
      assertConformance((await store.commitWorkflow(workflow)).status === "already_committed");
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
      assertConflict(await store.commitWorkflow(collision), "workflow_id_collision");
      assertConformance(matches(
        (await store.getLatestObject(first.reviewedHypothesis.payload.id))!,
        first.reviewedHypothesis,
      ));
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
      assertConflict(await store.commitWorkflow(collision), "object_revision_collision");
      assertConformance(
        await store.getObjectVersion(collision.evidence.payload.id, 1) === undefined,
      );
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
      assertConflict(await store.commitWorkflow(collision), "event_id_collision");
      assertConformance(
        await store.getObjectVersion(collision.initialHypothesis.payload.id, 1) === undefined,
      );
    },
  },
  {
    id: "version-conflict",
    async run(createStore) {
      const store = await createStore();
      const workflow = prepared({ workflowId: "workflow:conformance:version" });
      assertConformance(
        (await store.commitInitial({ object: workflow.initialHypothesis })).status === "committed",
      );
      const stale = Object.freeze({
        ...workflow,
        expectedHypothesisVersion: 2,
      }) as unknown as PreparedDurableCognitionCommit;
      assertConflict(await store.commitWorkflow(stale), "version_conflict");
      assertConformance(
        await store.getObjectVersion(workflow.evidence.payload.id, 1) === undefined,
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
      assertConflict(await store.commitWorkflow(workflow), "incomplete_workflow");
    },
  },
  {
    id: "rollback",
    async run(createStore) {
      const store = await createStore();
      const first = prepared({
        workflowId: "workflow:conformance:rollback-first",
        eventId: "event:conformance:rollback-shared",
      });
      const collision = prepared({
        workflowId: "workflow:conformance:rollback-collision",
        hypothesisId: "hypothesis:conformance:rollback-collision",
        eventId: first.event.payload.id,
        sourceId: "conformance:rollback-collision",
      });
      assertConformance((await store.commitWorkflow(first)).status === "committed");
      assertConflict(await store.commitWorkflow(collision), "event_id_collision");
      assertConformance(
        await store.getObjectVersion(collision.initialHypothesis.payload.id, 1) === undefined &&
          await store.getObjectVersion(collision.evidence.payload.id, 1) === undefined &&
          await store.getObjectVersion(collision.reviewedHypothesis.payload.id, 2) === undefined,
      );
    },
  },
  {
    id: "detached-reads",
    async run(createStore) {
      const store = await createStore();
      const workflow = prepared({ workflowId: "workflow:conformance:detached" });
      assertConformance((await store.commitWorkflow(workflow)).status === "committed");
      const object = await store.getLatestObject(workflow.reviewedHypothesis.payload.id);
      const events = await store.listObjectEvents(workflow.reviewedHypothesis.payload.id);
      assertConformance(object !== undefined && events.length === 1);
      assertConformance(isDeepFrozen(object) && isDeepFrozen(events));
      try {
        (object.payload as { title: string }).title = "Caller mutation";
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
  factory: StoreFactory,
): Promise<DurableWorkflowConformanceReport> {
  const seen = new Set<object>();
  const createStore: FreshStore = async () => {
    const store = await factory();
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
