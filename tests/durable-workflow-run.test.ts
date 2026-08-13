import assert from "node:assert/strict";
import test from "node:test";

import {
  createObject,
  createSourceRecord,
} from "../src/index.ts";
import { prepareDurableCognitionWorkflow } from "../src/workflows/durable.ts";
import { runDurableCognitionWorkflow } from "../src/workflows/durable.ts";
import type {
  CognitiveObject,
  CognitionEventPublisher,
  EvidencePromotionPolicy,
  SourceRecord,
  TransitionContext,
} from "../src/index.ts";
import type {
  CognitionWorkflowStore,
  DurableCognitionCommitResult,
  DurableCognitionProjector,
  DurableCognitionWorkflowHost,
  DurableCognitionWorkflowRequest,
  DurableCognitionWorkflowResult,
} from "../src/workflows/durable.ts";

const impossibleCompletedWorkflow: DurableCognitionWorkflowResult = {
  status: "committed",
  persistence: "committed",
  // @ts-expect-error A completed workflow cannot report failed publication.
  publication: "failed",
  projection: "projected",
  workflowId: "workflow:impossible",
  requestDigest: "0".repeat(64),
  records: [],
};
void impossibleCompletedWorkflow;

function validRequest(): DurableCognitionWorkflowRequest {
  const hypothesis = createObject({
    id: "hypothesis:durable-run",
    type: "hypothesis",
    version: 1,
    state: "proposed",
    title: "Durable workflow hypothesis",
    data: { statement: "The workflow has durable evidence." },
    createdAt: "2026-08-13T08:00:00.000Z",
    updatedAt: "2026-08-13T08:00:00.000Z",
    attribution: {
      initiatorId: "human:author",
      executorId: "human:author",
      accountableId: "human:owner",
    },
    provenance: [{
      source: "test",
      sourceId: "durable-run:hypothesis",
      capturedAt: "2026-08-13T08:00:00.000Z",
    }],
    contextId: "context:durable-run",
    relationships: [{ type: "supports-goal", targetId: "goal:durable-run" }],
  }) as CognitiveObject<"hypothesis">;
  const record = createSourceRecord({
    id: "source-record:durable-run:1",
    source: { system: "test" },
    sourceId: "durable-run:1",
    revisionId: "1",
    capturedAt: "2026-08-13T09:00:00.000Z",
    mediaType: "application/json",
    content: { summary: "Durable workflow evidence." },
  }) as SourceRecord;
  const transition: TransitionContext = {
    eventId: "event:durable-run:1",
    occurredAt: "2026-08-13T10:00:00.000Z",
    initiator: { id: "human:reviewer", kind: "human" },
    executor: { id: "human:reviewer", kind: "human" },
    accountableParty: { id: "human:owner", kind: "human" },
    automationMode: "manual",
    consequenceLevel: "routine",
    rationale: "The evidence is ready for review.",
  };
  const policy: EvidencePromotionPolicy = {
    id: "durable-run-policy",
    version: "1",
    map() {
      return {
        title: "Durable workflow evidence",
        statement: "Durable workflow evidence.",
        evidenceKind: "activity",
        polarity: "neutral",
      };
    },
  };
  return {
    workflowVersion: "0.1.0",
    workflowId: "workflow:durable-run:1",
    records: [record],
    hypothesis,
    promotion: {
      hypothesisId: hypothesis.id,
      contextId: hypothesis.contextId,
      rationale: "The evidence is relevant to this hypothesis.",
      promotedAt: "2026-08-13T09:00:00.000Z",
      attribution: {
        initiatorId: "human:reviewer",
        executorId: "human:reviewer",
        accountableId: "human:owner",
      },
    },
    reviewTransition: transition,
    policy,
  };
}

class RecordingStore implements CognitionWorkflowStore {
  readonly commits: unknown[] = [];
  private readonly result: DurableCognitionCommitResult | unknown;
  private readonly onCommit: (() => void) | undefined;

  constructor(
    result: DurableCognitionCommitResult | unknown = { status: "committed" },
    onCommit?: () => void,
  ) {
    this.result = result;
    this.onCommit = onCommit;
  }

  async commitWorkflow(request: unknown): Promise<DurableCognitionCommitResult> {
    this.commits.push(request);
    this.onCommit?.();
    return this.result as DurableCognitionCommitResult;
  }

  async commitInitial(): Promise<never> { throw new Error("not used"); }
  async commitTransition(): Promise<never> { throw new Error("not used"); }
  async getLatestObject(): Promise<undefined> { return undefined; }
  async getObjectVersion(): Promise<undefined> { return undefined; }
  async listObjectEvents(): Promise<readonly []> { return []; }
}

function recordingHost({
  result,
  onCommit,
  onPublish,
  onProject,
  publication = "published",
  projection = "projected",
}: {
  readonly result?: DurableCognitionCommitResult | unknown;
  readonly onCommit?: () => void;
  readonly onPublish?: () => void;
  readonly onProject?: () => void;
  readonly publication?: "published" | "already_published" | unknown;
  readonly projection?: "projected" | "unchanged" | unknown;
} = {}): DurableCognitionWorkflowHost & {
  readonly store: RecordingStore;
  readonly publisher: CognitionEventPublisher;
  readonly projector: DurableCognitionProjector;
  readonly published: unknown[];
  readonly projected: unknown[];
} {
  const store = new RecordingStore(result, onCommit);
  const published: unknown[] = [];
  const projected: unknown[] = [];
  return {
    store,
    publisher: {
      async publish(event, options) {
        onPublish?.();
        published.push({ event, options });
        return publication as "published" | "already_published";
      },
    },
    projector: {
      async project(records) {
        onProject?.();
        projected.push(records);
        return projection as "projected" | "unchanged";
      },
    },
    published,
    projected,
  };
}

test("commits before publishing and projects exactly the prepared workflow", async () => {
  const order: string[] = [];
  const host = recordingHost({
    onCommit: () => order.push("commit"),
    onPublish: () => order.push("publish"),
    onProject: () => order.push("project"),
  });
  const request = validRequest();
  const prepared = prepareDurableCognitionWorkflow(request);

  const result = await runDurableCognitionWorkflow(host, request);

  assert.equal(result.status, "committed");
  assert.deepEqual(order, ["commit", "publish", "project"]);
  assert.equal(result.persistence, "committed");
  assert.equal(result.publication, "published");
  assert.equal(result.projection, "projected");
  assert.deepEqual(host.store.commits, [prepared]);
  assert.deepEqual(host.published, [{
    event: prepared.event,
    options: { idempotencyKey: prepared.event.payload.id },
  }]);
  assert.equal(host.projected.length, 1);
  assert.equal(Object.isFrozen(host.projected[0]), true);
  assert.deepEqual(host.projected[0], [
    prepared.initialHypothesis,
    prepared.evidence,
    prepared.reviewedHypothesis,
    prepared.event,
  ]);
});

test("does not invoke downstream stages after a valid workflow conflict", async () => {
  const host = recordingHost({
    result: {
      status: "conflict",
      conflict: {
        code: "workflow_id_collision",
        workflowId: "workflow:durable-run:1",
      },
    },
  });

  const result = await runDurableCognitionWorkflow(host, validRequest());

  assert.equal(result.status, "conflict");
  assert.equal(host.published.length, 0);
  assert.equal(host.projected.length, 0);
});

test("reports absent downstream stages as not requested", async () => {
  const host = new RecordingStore();

  const result = await runDurableCognitionWorkflow({ store: host }, validRequest());

  assert.equal(result.status, "committed");
  assert.equal(result.publication, "not_requested");
  assert.equal(result.projection, "not_requested");
});

test("classifies downstream failures without exposing adapter errors", async () => {
  const secret = "private adapter failure";
  const host = recordingHost({});
  host.publisher.publish = async () => { throw new Error(secret); };
  host.projector.project = async () => { throw new Error(secret); };

  const result = await runDurableCognitionWorkflow(host, validRequest());

  assert.equal(result.status, "committed_but_unpublished_and_unprojected");
  assert.equal(result.publication, "failed");
  assert.equal(result.projection, "failed");
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test("fails closed on malformed commit results before downstream stages", async () => {
  const secret = "malformed store response";
  const host = recordingHost({ result: { status: "committed", secret } });

  const result = await runDurableCognitionWorkflow(host, validRequest());

  assert.equal(result.status, "failed");
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(host.published.length, 0);
  assert.equal(host.projected.length, 0);
});

test("rejects preparation before accessing the workflow host", async () => {
  const host = recordingHost({});
  const request = { ...validRequest(), records: [] };

  const result = await runDurableCognitionWorkflow(host, request);

  assert.equal(result.status, "failed");
  assert.equal(host.store.commits.length, 0);
  assert.equal(host.published.length, 0);
  assert.equal(host.projected.length, 0);
});

test("retries requested downstream stages after an already committed replay", async () => {
  const host = recordingHost({
    result: { status: "already_committed" },
    publication: "already_published",
    projection: "unchanged",
  });

  const result = await runDurableCognitionWorkflow(host, validRequest());

  assert.equal(result.status, "committed");
  assert.equal(result.persistence, "already_committed");
  assert.equal(result.publication, "already_published");
  assert.equal(result.projection, "unchanged");
  assert.equal(host.published.length, 1);
  assert.equal(host.projected.length, 1);
});

test("does not invoke downstream stages for every valid conflict code", async () => {
  for (const code of [
    "workflow_id_collision",
    "object_revision_collision",
    "event_id_collision",
    "version_conflict",
    "incomplete_workflow",
  ] as const) {
    const host = recordingHost({
      result: {
        status: "conflict",
        conflict: { code, workflowId: "workflow:durable-run:1" },
      },
    });

    const result = await runDurableCognitionWorkflow(host, validRequest());

    assert.equal(result.status, "conflict", code);
    assert.equal(result.conflict.code, code);
    assert.equal(host.published.length, 0, code);
    assert.equal(host.projected.length, 0, code);
  }
});

test("fails closed on malformed conflict results before downstream stages", async () => {
  const malformed = [
    {
      status: "conflict",
      conflict: {
        code: "workflow_id_collision",
        workflowId: "workflow:another",
      },
    },
    {
      status: "conflict",
      conflict: {
        code: "unknown_conflict",
        workflowId: "workflow:durable-run:1",
      },
    },
    {
      status: "conflict",
      conflict: {
        code: "workflow_id_collision",
        workflowId: "workflow:durable-run:1",
        secret: "malformed conflict",
      },
    },
  ];
  for (const result of malformed) {
    const host = recordingHost({ result });

    const outcome = await runDurableCognitionWorkflow(host, validRequest());

    assert.equal(outcome.status, "failed");
    assert.equal(host.published.length, 0);
    assert.equal(host.projected.length, 0);
  }
});

test("classifies each publication and projection outcome independently", async () => {
  const cases = [
    {
      publication: "unexpected-publication",
      projection: "projected",
      status: "committed_but_unpublished",
      expectedPublication: "failed",
      expectedProjection: "projected",
    },
    {
      publication: "published",
      projection: "unexpected-projection",
      status: "committed_but_unprojected",
      expectedPublication: "published",
      expectedProjection: "failed",
    },
    {
      publication: "already_published",
      projection: "unchanged",
      status: "committed",
      expectedPublication: "already_published",
      expectedProjection: "unchanged",
    },
  ] as const;
  for (const expected of cases) {
    const host = recordingHost(expected);

    const result = await runDurableCognitionWorkflow(host, validRequest());

    assert.equal(result.status, expected.status);
    assert.equal(result.publication, expected.expectedPublication);
    assert.equal(result.projection, expected.expectedProjection);
    assert.equal(host.published.length, 1);
    assert.equal(host.projected.length, 1);
  }
});

test("classifies individual publisher and projector exceptions", async () => {
  const publisherFailure = recordingHost({});
  publisherFailure.publisher.publish = async () => {
    throw new Error("publisher failure");
  };
  const unpublished = await runDurableCognitionWorkflow(
    publisherFailure,
    validRequest(),
  );
  assert.equal(unpublished.status, "committed_but_unpublished");
  assert.equal(unpublished.publication, "failed");
  assert.equal(unpublished.projection, "projected");

  const projectorFailure = recordingHost({});
  projectorFailure.projector.project = async () => {
    throw new Error("projector failure");
  };
  const unprojected = await runDurableCognitionWorkflow(
    projectorFailure,
    validRequest(),
  );
  assert.equal(unprojected.status, "committed_but_unprojected");
  assert.equal(unprojected.publication, "published");
  assert.equal(unprojected.projection, "failed");
});
