import assert from "node:assert/strict";
import test from "node:test";

import {
  createObject,
  createSourceRecord,
  DomainError,
} from "../src/index.ts";
import { prepareDurableCognitionWorkflow } from "../src/workflows/durable.ts";
import type {
  CognitiveObject,
  EvidencePromotionPolicy,
  SourceRecord,
  TransitionContext,
} from "../src/index.ts";
import type { DurableCognitionWorkflowRequest } from "../src/workflows/durable.ts";

interface ProxyInspection {
  count: number;
}

function mutatingInspectionProxy<T extends object>(
  target: T,
  mutate: () => void,
  inspection: ProxyInspection,
): T {
  function inspected(): void {
    inspection.count += 1;
    mutate();
  }

  return new Proxy(target, {
    get(current, property, receiver) {
      inspected();
      return Reflect.get(current, property, receiver);
    },
    getOwnPropertyDescriptor(current, property) {
      inspected();
      return Reflect.getOwnPropertyDescriptor(current, property);
    },
    getPrototypeOf(current) {
      inspected();
      return Reflect.getPrototypeOf(current);
    },
    has(current, property) {
      inspected();
      return Reflect.has(current, property);
    },
    ownKeys(current) {
      inspected();
      return Reflect.ownKeys(current);
    },
  });
}

function sourceRecord(): SourceRecord {
  return createSourceRecord({
    id: "source-record:delivery-review:1",
    source: { system: "test" },
    sourceId: "delivery-review:1",
    revisionId: "1",
    capturedAt: "2026-08-13T09:00:00.000Z",
    mediaType: "application/json",
    content: { summary: "Delivery review evidence." },
  });
}

function hypothesis(): CognitiveObject<"hypothesis"> {
  return createObject({
    id: "hypothesis:delivery-review",
    type: "hypothesis",
    version: 1,
    state: "proposed",
    title: "Delivery review hypothesis",
    data: { statement: "The delivery is ready for review." },
    createdAt: "2026-08-13T08:00:00.000Z",
    updatedAt: "2026-08-13T08:00:00.000Z",
    attribution: {
      initiatorId: "human:author",
      executorId: "human:author",
      accountableId: "human:owner",
    },
    provenance: [
      {
        source: "test",
        sourceId: "delivery-review:hypothesis",
        capturedAt: "2026-08-13T08:00:00.000Z",
      },
    ],
    contextId: "context:delivery-review",
    relationships: [{ type: "supports-goal", targetId: "goal:delivery" }],
  });
}

function transitionContext(): TransitionContext {
  return {
    eventId: "event:delivery-review:1",
    occurredAt: "2026-08-13T10:00:00.000Z",
    initiator: { id: "human:reviewer", kind: "human" },
    executor: { id: "human:reviewer", kind: "human" },
    accountableParty: { id: "human:owner", kind: "human" },
    automationMode: "manual",
    consequenceLevel: "routine",
    rationale: "The delivery is ready for review.",
  };
}

function policy(): EvidencePromotionPolicy {
  return {
    id: "test-policy",
    version: "1",
    map() {
      return {
        title: "Delivery review evidence",
        statement: "Delivery review evidence.",
        evidenceKind: "activity",
        polarity: "neutral",
      };
    },
  };
}

function validRequest(
  overrides: Partial<DurableCognitionWorkflowRequest> = {},
): DurableCognitionWorkflowRequest {
  const currentHypothesis = hypothesis();
  return {
    workflowVersion: "0.1.0",
    workflowId: "workflow:delivery-review:1",
    records: [sourceRecord()],
    hypothesis: currentHypothesis,
    promotion: {
      hypothesisId: currentHypothesis.id,
      contextId: currentHypothesis.contextId,
      rationale: "The evidence is relevant to this hypothesis.",
      promotedAt: "2026-08-13T09:00:00.000Z",
      attribution: {
        initiatorId: "human:reviewer",
        executorId: "human:reviewer",
        accountableId: "human:owner",
      },
    },
    reviewTransition: transitionContext(),
    policy: policy(),
    ...overrides,
  };
}

test("prepares one exact frozen durable workflow", () => {
  const prepared = prepareDurableCognitionWorkflow(validRequest());

  assert.equal(prepared.workflowId, "workflow:delivery-review:1");
  assert.match(prepared.requestDigest, /^[0-9a-f]{64}$/);
  assert.equal(prepared.initialHypothesis.payload.version, 1);
  assert.equal(prepared.reviewedHypothesis.payload.version, 2);
  assert.equal(prepared.reviewedHypothesis.payload.state, "under_review");
  assert.equal(prepared.evidence.payload.type, "evidence");
  assert.equal(
    prepared.event.payload.objectId,
    prepared.reviewedHypothesis.payload.id,
  );
  assert.equal(Object.isFrozen(prepared), true);
  assert.equal(Object.isFrozen(prepared.evidence), true);
});

test("rejects a promotion for another hypothesis before policy invocation", () => {
  let policyCalls = 0;
  const request = validRequest({
    promotion: {
      ...validRequest().promotion,
      hypothesisId: "hypothesis:another",
    },
    policy: {
      id: "test-policy",
      version: "1",
      map() {
        policyCalls += 1;
        return {
          title: "Evidence",
          statement: "Statement",
          evidenceKind: "activity",
          polarity: "neutral",
        };
      },
    },
  });

  assert.throws(
    () => prepareDurableCognitionWorkflow(request),
    (error: unknown) =>
      error instanceof Error &&
      !(error instanceof DomainError) &&
      "code" in error &&
      error.code === "INVALID_DURABLE_WORKFLOW_REQUEST",
  );
  assert.equal(policyCalls, 0);
});

function assertInvalidRequest(
  request: DurableCognitionWorkflowRequest,
): void {
  assert.throws(
    () => prepareDurableCognitionWorkflow(request),
    (error: unknown) =>
      error instanceof Error &&
      !(error instanceof DomainError) &&
      "code" in error &&
      error.code === "INVALID_DURABLE_WORKFLOW_REQUEST",
  );
}

function assertInvalidRequestWithoutOutput(
  operation: () => ReturnType<typeof prepareDurableCognitionWorkflow>,
): void {
  let output: ReturnType<typeof prepareDurableCognitionWorkflow> | undefined;
  assert.throws(
    () => {
      output = operation();
    },
    {
      name: "DurableWorkflowPreparationError",
      message: "Durable workflow request is invalid.",
      code: "INVALID_DURABLE_WORKFLOW_REQUEST",
    },
  );
  assert.equal(output, undefined);
}

test("produces the same prepared digest for reordered JSON keys", () => {
  const request = validRequest();
  const reordered = {
    policy: request.policy,
    reviewTransition: {
      rationale: request.reviewTransition.rationale,
      consequenceLevel: request.reviewTransition.consequenceLevel,
      automationMode: request.reviewTransition.automationMode,
      accountableParty: request.reviewTransition.accountableParty,
      executor: request.reviewTransition.executor,
      initiator: request.reviewTransition.initiator,
      occurredAt: request.reviewTransition.occurredAt,
      eventId: request.reviewTransition.eventId,
    },
    promotion: {
      attribution: request.promotion.attribution,
      promotedAt: request.promotion.promotedAt,
      rationale: request.promotion.rationale,
      contextId: request.promotion.contextId,
      hypothesisId: request.promotion.hypothesisId,
    },
    hypothesis: request.hypothesis,
    records: request.records.map((record) => ({
      content: record.content,
      mediaType: record.mediaType,
      capturedAt: record.capturedAt,
      revisionId: record.revisionId,
      sourceId: record.sourceId,
      source: record.source,
      id: record.id,
      schemaVersion: record.schemaVersion,
    })),
    workflowId: request.workflowId,
    workflowVersion: request.workflowVersion,
  } as DurableCognitionWorkflowRequest;

  assert.equal(
    prepareDurableCognitionWorkflow(reordered).requestDigest,
    prepareDurableCognitionWorkflow(request).requestDigest,
  );
});

test("deduplicates equivalent SourceRecords before policy invocation", () => {
  let receivedRecordCount = 0;
  const request = validRequest({
    records: [sourceRecord(), structuredClone(sourceRecord())],
    policy: {
      id: "test-policy",
      version: "1",
      map(records) {
        receivedRecordCount = records.length;
        return {
          title: "Evidence",
          statement: "Statement",
          evidenceKind: "activity",
          polarity: "neutral",
        };
      },
    },
  });

  prepareDurableCognitionWorkflow(request);

  assert.equal(receivedRecordCount, 1);
});

test("rejects source revision collisions before policy invocation", () => {
  let policyCalls = 0;
  const first = sourceRecord();
  const request = validRequest({
    records: [
      first,
      { ...first, content: { summary: "Changed content." } },
    ],
    policy: {
      id: "test-policy",
      version: "1",
      map() {
        policyCalls += 1;
        return {
          title: "Evidence",
          statement: "Statement",
          evidenceKind: "activity",
          polarity: "neutral",
        };
      },
    },
  });

  assert.throws(
    () => prepareDurableCognitionWorkflow(request),
    (error: unknown) =>
      error instanceof DomainError &&
      error.code === "SOURCE_REVISION_COLLISION",
  );
  assert.equal(policyCalls, 0);
});

test("rejects empty accepted input before policy invocation", () => {
  let policyCalls = 0;
  const request = validRequest({
    records: [],
    policy: {
      id: "test-policy",
      version: "1",
      map() {
        policyCalls += 1;
        return {
          title: "Evidence",
          statement: "Statement",
          evidenceKind: "activity",
          polarity: "neutral",
        };
      },
    },
  });

  assertInvalidRequest(request);
  assert.equal(policyCalls, 0);
});

test("rejects accessors and inherited request fields before policy invocation", () => {
  let policyCalls = 0;
  const request = validRequest({
    policy: {
      id: "test-policy",
      version: "1",
      map() {
        policyCalls += 1;
        return {
          title: "Evidence",
          statement: "Statement",
          evidenceKind: "activity",
          polarity: "neutral",
        };
      },
    },
  });
  const accessorRequest = { ...request } as Record<string, unknown>;
  Object.defineProperty(accessorRequest, "workflowId", {
    enumerable: true,
    get() {
      throw new Error("accessor must not run");
    },
  });
  assertInvalidRequest(
    accessorRequest as unknown as DurableCognitionWorkflowRequest,
  );

  const inheritedRequest = Object.create(request) as DurableCognitionWorkflowRequest;
  assertInvalidRequest(inheritedRequest);
  assert.equal(policyCalls, 0);
});

test("rejects stateful proxy input before policy invocation", () => {
  let policyCalls = 0;
  const request = validRequest({
    policy: {
      id: "test-policy",
      version: "1",
      map() {
        policyCalls += 1;
        return {
          title: "Evidence",
          statement: "Statement",
          evidenceKind: "activity",
          polarity: "neutral",
        };
      },
    },
  });
  const target = { ...request.promotion };
  const promotion = new Proxy(target, {
    getOwnPropertyDescriptor(value, property) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, property);
      if (property === "rationale") {
        value.rationale = "Changed after inspection.";
      }
      return descriptor;
    },
  });

  assertInvalidRequest(validRequest({ ...request, promotion }));
  assert.equal(policyCalls, 0);
});

test("rejects nested proxies that mutate an earlier promotion field", () => {
  let policyCalls = 0;
  const promotion = structuredClone(validRequest().promotion) as {
    hypothesisId: string;
    contextId: string;
    rationale: string;
    promotedAt: string;
    attribution: {
      initiatorId: string;
      executorId: string;
      accountableId: string;
    };
  };
  promotion.attribution = new Proxy(promotion.attribution, {
    getOwnPropertyDescriptor(value, property) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, property);
      if (property === "accountableId") {
        promotion.contextId = "context:changed-after-capture";
      }
      return descriptor;
    },
  });
  const request = validRequest({
    promotion,
    policy: {
      id: "test-policy",
      version: "1",
      map() {
        policyCalls += 1;
        return {
          title: "Evidence",
          statement: "Statement",
          evidenceKind: "activity",
          polarity: "neutral",
        };
      },
    },
  });

  assertInvalidRequest(request);
  assert.equal(policyCalls, 0);
});

test("rejects mutating proxies across the complete preparation input before trap or policy access", () => {
  const cases = [
    {
      name: "record proxy mutates hypothesis",
      run() {
        let policyCalls = 0;
        const request = validRequest({
          policy: {
            ...policy(),
            map() {
              policyCalls += 1;
              return policy().map([]);
            },
          },
        });
        const mutableRequest = request as unknown as {
          hypothesis: DurableCognitionWorkflowRequest["hypothesis"];
          records: DurableCognitionWorkflowRequest["records"];
        };
        const originalHypothesis = request.hypothesis;
        const inspection = { count: 0 };
        const record = mutatingInspectionProxy(
          structuredClone(sourceRecord()),
          () => {
            mutableRequest.hypothesis = {
              ...structuredClone(originalHypothesis),
              title: "Mutated by record proxy",
            };
          },
          inspection,
        );
        mutableRequest.records = [record];

        assertInvalidRequestWithoutOutput(() =>
          prepareDurableCognitionWorkflow(request)
        );
        assert.equal(inspection.count, 0);
        assert.equal(policyCalls, 0);
        assert.equal(request.hypothesis, originalHypothesis);
      },
    },
    {
      name: "hypothesis proxy mutates promotion and records",
      run() {
        let policyCalls = 0;
        const request = validRequest({
          policy: {
            ...policy(),
            map() {
              policyCalls += 1;
              return policy().map([]);
            },
          },
        });
        const mutableRequest = request as unknown as {
          hypothesis: DurableCognitionWorkflowRequest["hypothesis"];
          promotion: DurableCognitionWorkflowRequest["promotion"];
          records: DurableCognitionWorkflowRequest["records"];
        };
        const originalPromotion = request.promotion;
        const originalRecords = request.records;
        const inspection = { count: 0 };
        mutableRequest.hypothesis = mutatingInspectionProxy(
          structuredClone(request.hypothesis),
          () => {
            mutableRequest.promotion = {
              ...structuredClone(originalPromotion),
              contextId: "context:mutated-by-hypothesis-proxy",
            };
            mutableRequest.records = [];
          },
          inspection,
        );

        assertInvalidRequestWithoutOutput(() =>
          prepareDurableCognitionWorkflow(request)
        );
        assert.equal(inspection.count, 0);
        assert.equal(policyCalls, 0);
        assert.equal(request.promotion, originalPromotion);
        assert.equal(request.records, originalRecords);
      },
    },
    {
      name: "policy proxy mutates hypothesis data",
      run() {
        let policyCalls = 0;
        const mutableHypothesis = structuredClone(hypothesis());
        const request = validRequest({
          hypothesis: mutableHypothesis,
        });
        const mutableRequest = request as unknown as {
          policy: DurableCognitionWorkflowRequest["policy"];
        };
        const inspection = { count: 0 };
        const policyTarget: EvidencePromotionPolicy = {
          ...policy(),
          map() {
            policyCalls += 1;
            return policy().map([]);
          },
        };
        mutableRequest.policy = mutatingInspectionProxy(
          policyTarget,
          () => {
            (mutableHypothesis.data as { statement: string }).statement =
              "Mutated by policy proxy";
          },
          inspection,
        );

        assertInvalidRequestWithoutOutput(() =>
          prepareDurableCognitionWorkflow(request)
        );
        assert.equal(inspection.count, 0);
        assert.equal(policyCalls, 0);
        assert.deepEqual(mutableHypothesis.data, {
          statement: "The delivery is ready for review.",
        });
      },
    },
    {
      name: "options proxy mutates request",
      run() {
        let policyCalls = 0;
        const request = validRequest({
          policy: {
            ...policy(),
            map() {
              policyCalls += 1;
              return policy().map([]);
            },
          },
        });
        const mutableRequest = request as unknown as { workflowId: string };
        const originalWorkflowId = request.workflowId;
        const inspection = { count: 0 };
        const options = mutatingInspectionProxy(
          { maxRecords: 1 },
          () => {
            mutableRequest.workflowId = "workflow:mutated-by-options-proxy";
          },
          inspection,
        );

        assertInvalidRequestWithoutOutput(() =>
          prepareDurableCognitionWorkflow(request, options)
        );
        assert.equal(inspection.count, 0);
        assert.equal(policyCalls, 0);
        assert.equal(request.workflowId, originalWorkflowId);
      },
    },
    {
      name: "existing records proxy mutates request",
      run() {
        let policyCalls = 0;
        const request = validRequest({
          policy: {
            ...policy(),
            map() {
              policyCalls += 1;
              return policy().map([]);
            },
          },
        });
        const mutableRequest = request as unknown as { workflowId: string };
        const originalWorkflowId = request.workflowId;
        const inspection = { count: 0 };
        const existingRecords = mutatingInspectionProxy(
          [structuredClone(sourceRecord())],
          () => {
            mutableRequest.workflowId =
              "workflow:mutated-by-existing-records-proxy";
          },
          inspection,
        );

        assertInvalidRequestWithoutOutput(() =>
          prepareDurableCognitionWorkflow(request, { existingRecords })
        );
        assert.equal(inspection.count, 0);
        assert.equal(policyCalls, 0);
        assert.equal(request.workflowId, originalWorkflowId);
      },
    },
  ] as const;

  for (const testCase of cases) {
    assert.doesNotThrow(testCase.run, testCase.name);
  }
});

test("captures policy identity before a mapper mutates its caller-owned object", () => {
  const mutablePolicy: EvidencePromotionPolicy = {
    id: "test-policy",
    version: "1",
    map() {
      (mutablePolicy as { id: string }).id = "mutated-policy";
      return {
        title: "Evidence",
        statement: "Statement",
        evidenceKind: "activity",
        polarity: "neutral",
      };
    },
  };
  const prepared = prepareDurableCognitionWorkflow(
    validRequest({ policy: mutablePolicy }),
  );

  assert.equal(mutablePolicy.id, "mutated-policy");
  assert.deepEqual(
    prepared.evidence.payload.extensions?.["collective-cognition:promotion"],
    {
      sourceRevisionKeys: [
        '["test",null,"delivery-review:1","1"]',
      ],
      policy: { id: "test-policy", version: "1" },
      rationale: "The evidence is relevant to this hypothesis.",
    },
  );
  assert.match(prepared.requestDigest, /^[0-9a-f]{64}$/);
});

test("rejects malformed policy mappings and mismatched workflow correlations", () => {
  assertInvalidRequest(validRequest({
    policy: {
      id: "test-policy",
      version: "1",
      map() {
        return { title: "Incomplete" } as never;
      },
    },
  }));
  assertInvalidRequest(validRequest({
    promotion: {
      ...validRequest().promotion,
      contextId: "context:another",
    },
  }));
  assertInvalidRequest(validRequest({
    promotion: {
      ...validRequest().promotion,
      attribution: {
        ...validRequest().promotion.attribution,
        executorId: "human:another",
      },
    },
  }));
});

test("rejects invalid transition confirmation before policy invocation", () => {
  let policyCalls = 0;
  const request = validRequest({
    reviewTransition: {
      ...transitionContext(),
      confirmation: {
        actor: { id: "human:reviewer", kind: "human" },
        confirmedAt: "2026-08-13T09:59:00.000Z",
        objectId: "hypothesis:delivery-review",
        targetState: "under_review",
        eventId: "event:another",
      },
    },
    policy: {
      id: "test-policy",
      version: "1",
      map() {
        policyCalls += 1;
        return {
          title: "Evidence",
          statement: "Statement",
          evidenceKind: "activity",
          polarity: "neutral",
        };
      },
    },
  });

  assertInvalidRequest(request);
  assert.equal(policyCalls, 0);
});

test("propagates configured SourceRecord limits while enforcing fail-fast ingestion", () => {
  const request = validRequest({ records: [sourceRecord(), sourceRecord()] });

  assert.throws(
    () => prepareDurableCognitionWorkflow(request, { mode: "collect-all", maxRecords: 1 }),
    (error: unknown) =>
      error instanceof DomainError &&
      error.code === "INGESTION_LIMIT_EXCEEDED",
  );
  assert.throws(
    () => prepareDurableCognitionWorkflow(validRequest(), { maxRecordBytes: 16 }),
    (error: unknown) =>
      error instanceof DomainError &&
      error.code === "INGESTION_LIMIT_EXCEEDED",
  );
});
