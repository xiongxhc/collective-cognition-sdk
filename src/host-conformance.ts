import { createPortableCognitionRecord } from "./portable-cognition.ts";
import { createObject, deserializeObject } from "./objects.ts";
import { transitionObject } from "./transitions.ts";
import { commitCognitionTransition } from "./host-integration.ts";
import type { JsonValue } from "./types.ts";
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

async function assertRejected(action: () => Promise<unknown>): Promise<void> {
  let rejected = false;
  try {
    await action();
  } catch {
    rejected = true;
  }
  assertConformance(rejected);
}

function isDeepFrozen(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return true;
  }
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

function canonicalizeJson(value: JsonValue): string {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeJson).join(",")}]`;
  }
  const object = value as Record<string, JsonValue>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalizeJson(object[key])}`)
    .join(",")}}`;
}

function recordsMatch(
  left: PortableCognitiveObjectRecord | PortableCognitionEventRecord,
  right: PortableCognitiveObjectRecord | PortableCognitionEventRecord,
): boolean {
  return canonicalizeJson(left as unknown as JsonValue) ===
    canonicalizeJson(right as unknown as JsonValue);
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
      data: {
        objective: "Exercise the public host ports.",
        nested: {
          entries: [{
            label: "nested conformance data",
            tags: ["host", "conformance"],
            metadata: { source: "harness" },
          }],
        },
      },
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
      relationships: [{
        type: "supports-goal",
        targetId: "goal:host-conformance:parent",
      }],
    }),
  }) as PortableCognitiveObjectRecord;
}

function transitionCommit(
  object: PortableCognitiveObjectRecord,
  eventId: string,
  expectedVersion = 1,
): TransitionCognitionCommit {
  const transition = transitionObject(
    deserializeObject(JSON.stringify({
      ...object.payload,
      version: expectedVersion,
    })),
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
    expectedVersion,
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

function changedObject(
  object: PortableCognitiveObjectRecord,
): PortableCognitiveObjectRecord {
  return createPortableCognitionRecord({
    schemaVersion: "0.1.0",
    recordType: "cognitive-object",
    payload: { ...object.payload, title: "Changed object content." },
  }) as PortableCognitiveObjectRecord;
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

function reorderRecord<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(reorderRecord) as T;
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  const reordered: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort().reverse()) {
    reordered[key] = reorderRecord((value as Record<string, unknown>)[key]);
  }
  return reordered as T;
}

const conformanceCases: readonly ConformanceCase[] = [
  {
    id: "HIC-CONF-001",
    async run(factory) {
      const store = await factory.createStore();
      const object = objectRecord({ id: "goal:host-conformance:initial" });
      const result = await store.commitInitial({ object });
      assertConformance(result.status === "committed");
      const latest = await store.getLatestObject(object.payload.id);
      const version = await store.getObjectVersion(object.payload.id, 1);
      assertConformance(latest !== undefined && recordsMatch(latest, object));
      assertConformance(version !== undefined && recordsMatch(version, object));
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
      const latest = await store.getLatestObject(id);
      const version = await store.getObjectVersion(id, 1);
      const events = await store.listObjectEvents(id);
      assertConformance(latest !== undefined && recordsMatch(latest, objectRecord({ id })));
      assertConformance(version !== undefined && recordsMatch(version, objectRecord({ id })));
      assertConformance(events.length === 0);
    },
  },
  {
    id: "HIC-CONF-004",
    async run(factory) {
      const store = await factory.createStore();
      const object = objectRecord({ id: "goal:host-conformance:stale" });
      assertConformance((await store.commitInitial({ object })).status === "committed");
      const stale = transitionCommit(
        object,
        "event:host-conformance:stale",
        2,
      );
      const result = await store.commitTransition(
        stale,
      );
      assertConformance(
        result.status === "conflict" && result.conflict.code === "version_conflict" &&
          result.conflict.expectedVersion === 2 && result.conflict.actualVersion === 1,
      );
      const latest = await store.getLatestObject(object.payload.id);
      const initial = await store.getObjectVersion(object.payload.id, 1);
      const target = await store.getObjectVersion(object.payload.id, 3);
      const events = await store.listObjectEvents(object.payload.id);
      assertConformance(latest !== undefined && recordsMatch(latest, object));
      assertConformance(initial !== undefined && recordsMatch(initial, object));
      assertConformance(target === undefined);
      assertConformance(events.length === 0);
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
        result.status === "conflict" &&
          result.conflict.code === "event_id_collision" &&
          result.conflict.eventId === eventId,
      );
      const latest = await store.getLatestObject(second.payload.id);
      const initial = await store.getObjectVersion(second.payload.id, 1);
      const target = await store.getObjectVersion(second.payload.id, 2);
      const events = await store.listObjectEvents(second.payload.id);
      assertConformance(latest !== undefined && recordsMatch(latest, second));
      assertConformance(initial !== undefined && recordsMatch(initial, second));
      assertConformance(target === undefined);
      assertConformance(events.length === 0);
    },
  },
  {
    id: "HIC-CONF-006",
    async run(factory) {
      const store = await factory.createStore();
      const initial = objectRecord({ id: "goal:host-conformance:immutable" });
      const object = structuredClone(
        initial,
      ) as PortableCognitiveObjectRecord;
      assertConformance((await store.commitInitial({ object })).status === "committed");
      (object.payload as { title: string }).title = "Caller mutation";
      (
        object.payload.data as unknown as {
          nested: { entries: { tags: string[] }[] };
        }
      ).nested.entries[0].tags[0] = "caller mutation";
      (object.payload.provenance as unknown as { source: string }[])[0].source =
        "caller mutation";
      (object.payload.relationships as unknown as { targetId: string }[])[0].targetId =
        "goal:caller-mutation";
      const initialLatest = await store.getLatestObject(initial.payload.id);
      const initialVersion = await store.getObjectVersion(initial.payload.id, 1);
      assertConformance(initialLatest !== undefined && recordsMatch(initialLatest, initial));
      assertConformance(initialVersion !== undefined && recordsMatch(initialVersion, initial));
      assertConformance(isDeepFrozen(initialLatest));
      assertConformance(isDeepFrozen(initialVersion));
      const transition = transitionCommit(initial, "event:host-conformance:immutable");
      assertConformance((await store.commitTransition(transition)).status === "committed");
      const latest = await store.getLatestObject(initial.payload.id);
      const version = await store.getObjectVersion(initial.payload.id, 2);
      const events = await store.listObjectEvents(initial.payload.id);
      assertConformance(latest !== undefined && recordsMatch(latest, transition.object));
      assertConformance(version !== undefined && recordsMatch(version, transition.object));
      assertConformance(events.length === 1 && recordsMatch(events[0], transition.event));
      assertConformance(isDeepFrozen(latest));
      assertConformance(isDeepFrozen(version));
      assertConformance(isDeepFrozen(events));
      try {
        (latest.payload as { title: string }).title = "Latest mutation";
      } catch {
      }
      try {
        (
          version.payload.data as unknown as {
            nested: { entries: { tags: string[] }[] };
          }
        ).nested.entries[0].tags[0] = "Version mutation";
      } catch {
      }
      try {
        (latest.payload.provenance as unknown as { source: string }[])[0].source =
          "Latest mutation";
      } catch {
      }
      try {
        (version.payload.relationships as unknown as { targetId: string }[])[0].targetId =
          "goal:version-mutation";
      } catch {
      }
      try {
        (events[0].payload.provenance as unknown as { source: string }[])[0].source =
          "Event mutation";
      } catch {
      }
      assertConformance(
        recordsMatch(
          (await store.getLatestObject(initial.payload.id)) ?? initial,
          transition.object,
        ),
      );
      assertConformance(
        recordsMatch(
          (await store.getObjectVersion(initial.payload.id, 2)) ?? initial,
          transition.object,
        ),
      );
      const rereadEvents = await store.listObjectEvents(initial.payload.id);
      assertConformance(
        rereadEvents.length === 1 && recordsMatch(rereadEvents[0], transition.event),
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
      const firstTransition = transitionCommit(first, eventId);
      assertConformance((await store.commitTransition(firstTransition)).status === "committed");
      const latest = await store.getLatestObject(first.payload.id);
      const version = await store.getObjectVersion(first.payload.id, 2);
      const events = await store.listObjectEvents(first.payload.id);
      assertConformance(latest !== undefined && recordsMatch(latest, firstTransition.object));
      assertConformance(version !== undefined && recordsMatch(version, firstTransition.object));
      assertConformance(events.length === 1 && recordsMatch(events[0], firstTransition.event));
      assertConformance((await store.commitInitial({ object: second })).status === "committed");
      const result = await store.commitTransition(transitionCommit(second, eventId));
      assertConformance(
        result.status === "conflict" &&
          result.conflict.code === "event_id_collision" &&
          result.conflict.eventId === eventId,
      );
      const secondLatest = await store.getLatestObject(second.payload.id);
      assertConformance(await store.getObjectVersion(second.payload.id, 2) === undefined);
      assertConformance((await store.listObjectEvents(second.payload.id)).length === 0);
      assertConformance(
        secondLatest !== undefined && recordsMatch(secondLatest, second),
      );
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
      const latest = await store.getLatestObject(object.payload.id);
      const events = await store.listObjectEvents(object.payload.id);
      assertConformance(
        latest !== undefined && recordsMatch(latest, request.object),
      );
      assertConformance(
        events.length === 1 && recordsMatch(events[0], request.event),
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
  {
    id: "HIC-CONF-012",
    async run(factory) {
      const store = await factory.createStore();
      const initial = objectRecord({ id: "goal:host-conformance:canonical-replay" });
      const reorderedInitial = reorderRecord(initial);
      assertConformance((await store.commitInitial({ object: initial })).status === "committed");
      assertConformance(
        (await store.commitInitial({ object: reorderedInitial })).status ===
          "already_committed",
      );
      const transition = transitionCommit(
        initial,
        "event:host-conformance:canonical-replay",
      );
      const reorderedTransition: TransitionCognitionCommit = {
        expectedVersion: transition.expectedVersion,
        object: reorderRecord(transition.object),
        event: reorderRecord(transition.event),
      };
      assertConformance((await store.commitTransition(transition)).status === "committed");
      assertConformance(
        (await store.commitTransition(reorderedTransition)).status ===
          "already_committed",
      );
    },
  },
  {
    id: "HIC-CONF-013",
    async run(factory) {
      const store = await factory.createStore();
      const object = objectRecord({
        id: "goal:host-conformance:object-collision",
      });
      const transition = transitionCommit(
        object,
        "event:host-conformance:object-collision",
      );
      assertConformance((await store.commitInitial({ object })).status === "committed");
      assertConformance((await store.commitTransition(transition)).status === "committed");
      const result = await store.commitTransition({
        ...transition,
        object: changedObject(transition.object),
      });
      assertConformance(
        result.status === "conflict" &&
          result.conflict.code === "object_revision_collision",
      );
      const latest = await store.getLatestObject(object.payload.id);
      const initial = await store.getObjectVersion(object.payload.id, 1);
      const target = await store.getObjectVersion(object.payload.id, 2);
      const events = await store.listObjectEvents(object.payload.id);
      assertConformance(latest !== undefined && recordsMatch(latest, transition.object));
      assertConformance(initial !== undefined && recordsMatch(initial, object));
      assertConformance(target !== undefined && recordsMatch(target, transition.object));
      assertConformance(
        events.length === 1 && recordsMatch(events[0], transition.event),
      );
    },
  },
  {
    id: "HIC-CONF-014",
    async run(factory) {
      const store = await factory.createStore();
      const publisher = await factory.createPublisher();
      const malformedObject = {
        ...objectRecord({ id: "goal:host-conformance:malformed" }),
        schemaVersion: "9.9.9",
      };
      const sourceRecordShape = {
        schemaVersion: "0.1.0",
        id: "source-record:host-conformance",
        source: { system: "host-conformance" },
        sourceId: "source-item:host-conformance",
        revisionId: "revision:1",
        capturedAt: "2026-07-28T10:00:00.000Z",
        mediaType: "application/json",
        content: { neutral: true },
      };
      const validObject = objectRecord({
        id: "goal:host-conformance:malformed-transition",
      });
      const validTransition = transitionCommit(
        validObject,
        "event:host-conformance:malformed-transition",
      );

      await assertRejected(() =>
        store.commitInitial({
          object: malformedObject as unknown as PortableCognitiveObjectRecord,
        })
      );
      await assertRejected(() =>
        store.commitInitial({
          object: sourceRecordShape as unknown as PortableCognitiveObjectRecord,
        })
      );
      await assertRejected(() =>
        store.commitTransition({
          ...validTransition,
          event: sourceRecordShape as unknown as PortableCognitionEventRecord,
        })
      );
      await assertRejected(() =>
        publisher.publish(
          sourceRecordShape as unknown as PortableCognitionEventRecord,
          { idempotencyKey: sourceRecordShape.id },
        )
      );
      assertConformance(
        await store.getLatestObject("goal:host-conformance:malformed") === undefined,
      );
      assertConformance(
        await store.getObjectVersion("goal:host-conformance:malformed", 1) ===
          undefined,
      );
      assertConformance(
        (await store.listObjectEvents("goal:host-conformance:malformed")).length ===
          0,
      );
    },
  },
  {
    id: "HIC-CONF-015",
    async run(factory) {
      const store = await factory.createStore();
      const replayInitial = objectRecord({
        id: "goal:host-conformance:precedence:replay",
      });
      const replaySecond = transitionCommit(
        replayInitial,
        "event:host-conformance:precedence:replay:2",
      );
      const replayThird = transitionCommit(
        replayInitial,
        "event:host-conformance:precedence:replay:3",
        2,
      );
      assertConformance(
        (await store.commitInitial({ object: replayInitial })).status ===
          "committed",
      );
      assertConformance(
        (await store.commitTransition(replaySecond)).status === "committed",
      );
      assertConformance(
        (await store.commitTransition(replayThird)).status === "committed",
      );
      assertConformance(
        (await store.commitTransition(replaySecond)).status ===
          "already_committed",
      );

      const overlappingObjectCollision = transitionCommit(
        replayInitial,
        replaySecond.event.payload.id,
        2,
      );
      const objectCollision = await store.commitTransition({
        ...overlappingObjectCollision,
        object: changedObject(overlappingObjectCollision.object),
      });
      assertConformance(
        objectCollision.status === "conflict" &&
          objectCollision.conflict.code === "object_revision_collision",
      );

      const eventOwner = objectRecord({
        id: "goal:host-conformance:precedence:event-owner",
      });
      const sharedEventId = "event:host-conformance:precedence:shared";
      assertConformance(
        (await store.commitInitial({ object: eventOwner })).status === "committed",
      );
      assertConformance(
        (await store.commitTransition(
          transitionCommit(eventOwner, sharedEventId),
        )).status === "committed",
      );
      const staleTarget = objectRecord({
        id: "goal:host-conformance:precedence:stale-target",
      });
      assertConformance(
        (await store.commitInitial({ object: staleTarget })).status === "committed",
      );
      const eventCollision = await store.commitTransition(
        transitionCommit(staleTarget, sharedEventId, 2),
      );
      assertConformance(
        eventCollision.status === "conflict" &&
          eventCollision.conflict.code === "event_id_collision" &&
          eventCollision.conflict.eventId === sharedEventId,
      );
      const staleConflict = await store.commitTransition(
        transitionCommit(
          staleTarget,
          "event:host-conformance:precedence:stale",
          2,
        ),
      );
      assertConformance(
        staleConflict.status === "conflict" &&
          staleConflict.conflict.code === "version_conflict" &&
          staleConflict.conflict.expectedVersion === 2 &&
          staleConflict.conflict.actualVersion === 1,
      );

      const replayLatest = await store.getLatestObject(replayInitial.payload.id);
      const replayEvents = await store.listObjectEvents(replayInitial.payload.id);
      const staleLatest = await store.getLatestObject(staleTarget.payload.id);
      const staleEvents = await store.listObjectEvents(staleTarget.payload.id);
      assertConformance(
        replayLatest !== undefined && recordsMatch(replayLatest, replayThird.object),
      );
      assertConformance(
        replayEvents.length === 2 &&
          recordsMatch(replayEvents[0], replaySecond.event) &&
          recordsMatch(replayEvents[1], replayThird.event),
      );
      assertConformance(
        staleLatest !== undefined && recordsMatch(staleLatest, staleTarget),
      );
      assertConformance(
        await store.getObjectVersion(staleTarget.payload.id, 3) === undefined,
      );
      assertConformance(staleEvents.length === 0);
    },
  },
  {
    id: "HIC-CONF-016",
    async run(factory) {
      const first = await factory.createStore();
      const second = await factory.createStore();
      assertConformance(first !== second);
    },
  },
  {
    id: "HIC-CONF-017",
    async run(factory) {
      const first = await factory.createPublisher();
      const second = await factory.createPublisher();
      assertConformance(first !== second);
    },
  },
];

function requireFreshInstances(
  factory: CognitionHostConformanceFactory,
): CognitionHostConformanceFactory {
  const stores = new WeakSet<CognitionStore>();
  const publishers = new WeakSet<CognitionEventPublisher>();
  return {
    async createStore() {
      const store = await factory.createStore();
      assertConformance(!stores.has(store));
      stores.add(store);
      return store;
    },
    async createPublisher() {
      const publisher = await factory.createPublisher();
      assertConformance(!publishers.has(publisher));
      publishers.add(publisher);
      return publisher;
    },
  };
}

export async function runCognitionHostConformance(
  factory: CognitionHostConformanceFactory,
): Promise<CognitionHostConformanceReport> {
  const cases: CognitionHostConformanceCaseResult[] = [];
  const freshFactory = requireFreshInstances(factory);
  for (const conformanceCase of conformanceCases) {
    try {
      await conformanceCase.run(freshFactory);
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
