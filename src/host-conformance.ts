import { createPortableCognitionRecord } from "./portable-cognition.ts";
import { createObject, deserializeObject } from "./objects.ts";
import { transitionObject } from "./transitions.ts";
import { commitCognitionTransition } from "./host-integration.ts";
import type {
  CognitionEventPublisher,
  CognitionStore,
  PortableCognitionEventRecord,
  PortableCognitiveObjectRecord,
  TransitionCognitionCommit,
} from "./host-integration.ts";

export interface CognitionHostConformanceFactory {
  readonly createStore: () => CognitionStore | Promise<CognitionStore>;
  readonly createPublisher:
    () => CognitionEventPublisher | Promise<CognitionEventPublisher>;
}

export interface CognitionHostConformanceCaseResult {
  readonly id: string;
  readonly status: "passed" | "failed";
  readonly message?: string;
}

export interface CognitionHostConformanceReport {
  readonly contractVersion: "0.1.0";
  readonly passed: boolean;
  readonly cases: readonly CognitionHostConformanceCaseResult[];
}

interface ConformanceCase {
  readonly id: string;
  readonly run: (factory: CognitionHostConformanceFactory) => Promise<void>;
}

function assertConformance(condition: unknown): asserts condition {
  if (!condition) {
    throw new Error("Host conformance assertion failed.");
  }
}

function objectRecord({
  id,
  title = "Host conformance",
}: {
  readonly id: string;
  readonly title?: string;
}): PortableCognitiveObjectRecord {
  return createPortableCognitionRecord({
    schemaVersion: "0.1.0",
    recordType: "cognitive-object",
    payload: createObject({
      id,
      type: "goal",
      version: 1,
      state: "draft",
      title,
      data: { objective: "Exercise the public host ports." },
      createdAt: "2026-07-28T10:00:00.000Z",
      updatedAt: "2026-07-28T10:00:00.000Z",
      attribution: {
        initiatorId: "human:creator",
        executorId: "human:creator",
        accountableId: "human:owner",
      },
      provenance: [{
        source: "host-conformance",
        sourceId: id,
        capturedAt: "2026-07-28T10:00:00.000Z",
      }],
      contextId: "organization:host-conformance",
      relationships: [],
    }),
  }) as PortableCognitiveObjectRecord;
}

function transitionCommit(
  object: PortableCognitiveObjectRecord,
  eventId: string,
): TransitionCognitionCommit {
  const transition = transitionObject(
    deserializeObject(JSON.stringify(object.payload)),
    "active",
    {
      eventId,
      occurredAt: "2026-07-28T10:01:00.000Z",
      initiator: { id: "human:creator", kind: "human" },
      executor: { id: "human:creator", kind: "human" },
      accountableParty: { id: "human:owner", kind: "human" },
      automationMode: "manual",
      consequenceLevel: "routine",
      rationale: "Activate the conformance goal.",
    },
  );
  return {
    expectedVersion: 1,
    object: createPortableCognitionRecord({
      schemaVersion: "0.1.0",
      recordType: "cognitive-object",
      payload: transition.object,
    }) as PortableCognitiveObjectRecord,
    event: createPortableCognitionRecord({
      schemaVersion: "0.1.0",
      recordType: "cognition-event",
      payload: transition.event,
    }) as PortableCognitionEventRecord,
  };
}

function changedEvent(
  event: PortableCognitionEventRecord,
): PortableCognitionEventRecord {
  return createPortableCognitionRecord({
    schemaVersion: "0.1.0",
    recordType: "cognition-event",
    payload: { ...event.payload, rationale: "Changed event content." },
  }) as PortableCognitionEventRecord;
}

const conformanceCases: readonly ConformanceCase[] = [
  {
    id: "HIC-CONF-001",
    async run(factory) {
      const store = await factory.createStore();
      const object = objectRecord({ id: "goal:host-conformance:initial" });
      const result = await store.commitInitial({ object });
      assertConformance(result.status === "committed");
      assertConformance(
        JSON.stringify(await store.getLatestObject(object.payload.id)) === JSON.stringify(object),
      );
      assertConformance(
        JSON.stringify(await store.getObjectVersion(object.payload.id, 1)) === JSON.stringify(object),
      );
    },
  },
  {
    id: "HIC-CONF-002",
    async run(factory) {
      const store = await factory.createStore();
      const object = objectRecord({ id: "goal:host-conformance:replay" });
      assertConformance((await store.commitInitial({ object })).status === "committed");
      assertConformance(
        (await store.commitInitial({ object })).status === "already_committed",
      );
    },
  },
  {
    id: "HIC-CONF-003",
    async run(factory) {
      const store = await factory.createStore();
      const id = "goal:host-conformance:collision";
      assertConformance(
        (await store.commitInitial({ object: objectRecord({ id }) })).status === "committed",
      );
      const result = await store.commitInitial({
        object: objectRecord({ id, title: "Changed host conformance" }),
      });
      assertConformance(
        result.status === "conflict" && result.conflict.code === "object_revision_collision",
      );
    },
  },
  {
    id: "HIC-CONF-004",
    async run(factory) {
      const store = await factory.createStore();
      const object = objectRecord({ id: "goal:host-conformance:stale" });
      assertConformance((await store.commitInitial({ object })).status === "committed");
      assertConformance((await store.commitTransition(
        transitionCommit(object, "event:host-conformance:stale:first"),
      )).status === "committed");
      const result = await store.commitTransition(
        transitionCommit(object, "event:host-conformance:stale:retry"),
      );
      assertConformance(
        result.status === "conflict" && result.conflict.code === "version_conflict" &&
          result.conflict.expectedVersion === 1 && result.conflict.actualVersion === 2,
      );
    },
  },
  {
    id: "HIC-CONF-005",
    async run(factory) {
      const store = await factory.createStore();
      const eventId = "event:host-conformance:collision";
      const first = objectRecord({ id: "goal:host-conformance:event:first" });
      const second = objectRecord({ id: "goal:host-conformance:event:second" });
      assertConformance((await store.commitInitial({ object: first })).status === "committed");
      assertConformance((await store.commitTransition(transitionCommit(first, eventId))).status === "committed");
      assertConformance((await store.commitInitial({ object: second })).status === "committed");
      const result = await store.commitTransition(transitionCommit(second, eventId));
      assertConformance(
        result.status === "conflict" && result.conflict.code === "event_id_collision",
      );
    },
  },
  {
    id: "HIC-CONF-006",
    async run(factory) {
      const store = await factory.createStore();
      const object = structuredClone(
        objectRecord({ id: "goal:host-conformance:immutable" }),
      ) as PortableCognitiveObjectRecord;
      assertConformance((await store.commitInitial({ object })).status === "committed");
      (object.payload as { title: string }).title = "Caller mutation";
      const read = await store.getLatestObject(object.payload.id);
      assertConformance(read !== undefined);
      assertConformance(read.payload.title === "Host conformance");
      assertConformance(Object.isFrozen(read));
      assertConformance(Object.isFrozen(read.payload));
      try {
        (read.payload as { title: string }).title = "Read mutation";
      } catch {
      }
      assertConformance(
        (await store.getLatestObject(object.payload.id))?.payload.title === "Host conformance",
      );
    },
  },
  {
    id: "HIC-CONF-007",
    async run(factory) {
      const store = await factory.createStore();
      const eventId = "event:host-conformance:atomic";
      const first = objectRecord({ id: "goal:host-conformance:atomic:first" });
      const second = objectRecord({ id: "goal:host-conformance:atomic" });
      assertConformance((await store.commitInitial({ object: first })).status === "committed");
      assertConformance((await store.commitTransition(transitionCommit(first, eventId))).status === "committed");
      assertConformance((await store.commitInitial({ object: second })).status === "committed");
      const result = await store.commitTransition(transitionCommit(second, eventId));
      assertConformance(
        result.status === "conflict" && result.conflict.code === "event_id_collision",
      );
      assertConformance(await store.getObjectVersion(second.payload.id, 2) === undefined);
      assertConformance((await store.listObjectEvents(second.payload.id)).length === 0);
    },
  },
  {
    id: "HIC-CONF-008",
    async run(factory) {
      const publisher = await factory.createPublisher();
      const event = transitionCommit(
        objectRecord({ id: "goal:host-conformance:publisher:replay" }),
        "event:host-conformance:publisher:replay",
      ).event;
      assertConformance(
        await publisher.publish(event, { idempotencyKey: event.payload.id }) === "published",
      );
      assertConformance(
        await publisher.publish(event, { idempotencyKey: event.payload.id }) === "already_published",
      );
    },
  },
  {
    id: "HIC-CONF-009",
    async run(factory) {
      const publisher = await factory.createPublisher();
      const event = transitionCommit(
        objectRecord({ id: "goal:host-conformance:publisher:collision" }),
        "event:host-conformance:publisher:collision",
      ).event;
      await publisher.publish(event, { idempotencyKey: event.payload.id });
      let rejected = false;
      try {
        await publisher.publish(changedEvent(event), { idempotencyKey: event.payload.id });
      } catch {
        rejected = true;
      }
      assertConformance(rejected);
    },
  },
  {
    id: "HIC-CONF-010",
    async run(factory) {
      const store = await factory.createStore();
      const object = objectRecord({ id: "goal:host-conformance:partial" });
      const request = transitionCommit(object, "event:host-conformance:partial");
      assertConformance((await store.commitInitial({ object })).status === "committed");
      const interrupted: CognitionEventPublisher = {
        async publish() {
          throw new Error("Interrupted publication.");
        },
      };
      const outcome = await commitCognitionTransition({ store, publisher: interrupted }, request);
      assertConformance(outcome.status === "committed_but_unpublished");
      assertConformance(
        JSON.stringify(await store.getLatestObject(object.payload.id)) === JSON.stringify(request.object),
      );
    },
  },
  {
    id: "HIC-CONF-011",
    async run(factory) {
      const store = await factory.createStore();
      const publisher = await factory.createPublisher();
      const object = objectRecord({ id: "goal:host-conformance:recovery" });
      const request = transitionCommit(object, "event:host-conformance:recovery");
      assertConformance((await store.commitInitial({ object })).status === "committed");
      const interrupted: CognitionEventPublisher = {
        async publish() {
          throw new Error("Interrupted publication.");
        },
      };
      const first = await commitCognitionTransition({ store, publisher: interrupted }, request);
      const retry = await commitCognitionTransition({ store, publisher }, request);
      assertConformance(first.status === "committed_but_unpublished");
      assertConformance(
        retry.status === "committed" && retry.persistence === "already_committed" &&
          retry.publication === "published",
      );
    },
  },
];

export async function runCognitionHostConformance(
  factory: CognitionHostConformanceFactory,
): Promise<CognitionHostConformanceReport> {
  const cases: CognitionHostConformanceCaseResult[] = [];
  for (const conformanceCase of conformanceCases) {
    try {
      await conformanceCase.run(factory);
      cases.push(Object.freeze({ id: conformanceCase.id, status: "passed" }));
    } catch {
      cases.push(Object.freeze({
        id: conformanceCase.id,
        status: "failed",
        message: "Host conformance case failed.",
      }));
    }
  }
  return Object.freeze({
    contractVersion: "0.1.0",
    passed: cases.every(({ status }) => status === "passed"),
    cases: Object.freeze(cases),
  });
}
