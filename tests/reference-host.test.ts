import assert from "node:assert/strict";
import test from "node:test";

import {
  createObject,
  createPortableCognitionRecord,
  deserializeObject,
  DomainError,
  DomainErrorCode,
  transitionObject,
} from "../src/index.ts";
import {
  InMemoryCognitionEventPublisher,
  InMemoryCognitionStore,
} from "../src/reference-host.ts";
import type {
  PortableCognitionEventRecord,
  PortableCognitiveObjectRecord,
  TransitionCognitionCommit,
} from "../src/host-integration.ts";

function objectRecord({
  id = "goal:reference-host",
  version = 1,
  title = "Reference host",
}: {
  readonly id?: string;
  readonly version?: number;
  readonly title?: string;
} = {}): PortableCognitiveObjectRecord {
  const object = createObject({
    id,
    type: "goal",
    version: 1,
    state: "draft",
    title,
    data: { objective: "Verify the in-memory reference host." },
    createdAt: "2026-07-28T10:00:00.000Z",
    updatedAt: "2026-07-28T10:00:00.000Z",
    attribution: {
      initiatorId: "human:creator",
      executorId: "human:creator",
      accountableId: "human:owner",
    },
    provenance: [
      {
        source: "test",
        sourceId: id,
        capturedAt: "2026-07-28T10:00:00.000Z",
      },
    ],
    contextId: "organization:test",
    relationships: [],
  });
  return createPortableCognitionRecord({
    schemaVersion: "0.1.0",
    recordType: "cognitive-object",
    payload: version === 1
      ? object
      : deserializeObject(JSON.stringify({ ...object, version })),
  }) as PortableCognitiveObjectRecord;
}

function transitionCommit({
  id = "goal:reference-host",
  expectedVersion = 1,
  eventId = `event:${id}:${expectedVersion + 1}`,
}: {
  readonly id?: string;
  readonly expectedVersion?: number;
  readonly eventId?: string;
} = {}): TransitionCognitionCommit {
  const previous = deserializeObject(
    JSON.stringify(objectRecord({ id, version: expectedVersion }).payload),
  );
  const transition = transitionObject(previous, "active", {
    eventId,
    occurredAt: "2026-07-28T10:01:00.000Z",
    initiator: { id: "human:creator", kind: "human" },
    executor: { id: "human:creator", kind: "human" },
    accountableParty: { id: "human:owner", kind: "human" },
    automationMode: "manual",
    consequenceLevel: "routine",
    rationale: "Activate the reference-host goal.",
  });
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

function mutateTitle(record: PortableCognitiveObjectRecord, title: string) {
  const value = structuredClone(record) as unknown as {
    payload: Record<string, unknown>;
  };
  value.payload.title = title;
  return value as unknown as PortableCognitiveObjectRecord;
}

function mutateEventRationale(
  record: PortableCognitionEventRecord,
  rationale: string,
) {
  const value = structuredClone(record) as unknown as {
    payload: Record<string, unknown>;
  };
  value.payload.rationale = rationale;
  return value as unknown as PortableCognitionEventRecord;
}

function mutateEvent(
  record: PortableCognitionEventRecord,
  fields: Record<string, unknown>,
): PortableCognitionEventRecord {
  const value = structuredClone(record) as unknown as {
    payload: Record<string, unknown>;
  };
  Object.assign(value.payload, fields);
  return value as unknown as PortableCognitionEventRecord;
}

function isInvalidHostRequest(error: unknown): boolean {
  return error instanceof DomainError &&
    error.code === DomainErrorCode.INVALID_HOST_INTEGRATION_REQUEST;
}

test("commits a version-one object and reads its latest and version records", async () => {
  const store = new InMemoryCognitionStore();
  const object = objectRecord();

  assert.deepEqual(await store.commitInitial({ object }), { status: "committed" });
  assert.deepEqual(await store.getLatestObject(object.payload.id), object);
  assert.deepEqual(await store.getObjectVersion(object.payload.id, 1), object);
});

test("rejects a non-version-one initial object without changing store state", async () => {
  const store = new InMemoryCognitionStore();
  const object = objectRecord({ version: 2 });

  await assert.rejects(store.commitInitial({ object }), isInvalidHostRequest);

  assert.equal(await store.getLatestObject(object.payload.id), undefined);
  assert.equal(await store.getObjectVersion(object.payload.id, 2), undefined);
});

test("classifies an exact initial replay as already committed", async () => {
  const store = new InMemoryCognitionStore();
  const object = objectRecord();

  await store.commitInitial({ object });

  assert.deepEqual(await store.commitInitial({ object }), {
    status: "already_committed",
  });
});

test("rejects a changed initial revision with the same object ID and version", async () => {
  const store = new InMemoryCognitionStore();
  const object = objectRecord();
  await store.commitInitial({ object });

  assert.deepEqual(
    await store.commitInitial({ object: mutateTitle(object, "Changed title") }),
    {
      status: "conflict",
      conflict: {
        code: "object_revision_collision",
        objectId: object.payload.id,
        expectedVersion: 1,
        actualVersion: 1,
      },
    },
  );
});

test("commits a transition object and event together", async () => {
  const store = new InMemoryCognitionStore();
  const initial = objectRecord();
  const transition = transitionCommit();
  await store.commitInitial({ object: initial });

  assert.deepEqual(await store.commitTransition(transition), { status: "committed" });
  assert.deepEqual(
    await store.getLatestObject(initial.payload.id),
    transition.object,
  );
  assert.deepEqual(await store.listObjectEvents(initial.payload.id), [transition.event]);
});

test("rejects a non-successor transition version without partial state", async () => {
  const store = new InMemoryCognitionStore();
  const initial = objectRecord();
  const nonSuccessor = transitionCommit({ expectedVersion: 2 });
  await store.commitInitial({ object: initial });

  await assert.rejects(
    store.commitTransition({ ...nonSuccessor, expectedVersion: 1 }),
    isInvalidHostRequest,
  );

  assert.deepEqual(await store.getLatestObject(initial.payload.id), initial);
  assert.equal(await store.getObjectVersion(initial.payload.id, 3), undefined);
  assert.deepEqual(await store.listObjectEvents(initial.payload.id), []);
});

test("rejects incoherent transition events without partial state", async () => {
  const mismatches: readonly [string, Record<string, unknown>][] = [
    ["object ID", { objectId: "goal:other" }],
    ["object type", { objectType: "hypothesis" }],
    ["object version", { objectVersion: 3 }],
    ["object state", { nextState: "paused" }],
    ["object time", { occurredAt: "2026-07-28T10:02:00.000Z" }],
  ];

  for (const [description, fields] of mismatches) {
    const store = new InMemoryCognitionStore();
    const initial = objectRecord();
    const transition = transitionCommit();
    await store.commitInitial({ object: initial });

    await assert.rejects(
      store.commitTransition({ ...transition, event: mutateEvent(transition.event, fields) }),
      isInvalidHostRequest,
      description,
    );

    assert.deepEqual(await store.getLatestObject(initial.payload.id), initial);
    assert.equal(await store.getObjectVersion(initial.payload.id, 2), undefined);
    assert.deepEqual(await store.listObjectEvents(initial.payload.id), []);
  }
});

test("retains prior object versions after a transition advances latest", async () => {
  const store = new InMemoryCognitionStore();
  const initial = objectRecord();
  const transition = transitionCommit();
  await store.commitInitial({ object: initial });
  await store.commitTransition(transition);

  assert.deepEqual(await store.getObjectVersion(initial.payload.id, 1), initial);
  assert.deepEqual(await store.getObjectVersion(initial.payload.id, 2), transition.object);
});

test("classifies an exact transition replay as already committed", async () => {
  const store = new InMemoryCognitionStore();
  const initial = objectRecord();
  const transition = transitionCommit();
  await store.commitInitial({ object: initial });
  await store.commitTransition(transition);

  assert.deepEqual(await store.commitTransition(transition), {
    status: "already_committed",
  });
});

test("returns a version conflict when the expected version is not latest", async () => {
  const store = new InMemoryCognitionStore();
  const initial = objectRecord();
  const future = transitionCommit({ expectedVersion: 2 });
  await store.commitInitial({ object: initial });

  assert.deepEqual(
    await store.commitTransition(future),
    {
      status: "conflict",
      conflict: {
        code: "version_conflict",
        objectId: initial.payload.id,
        expectedVersion: 2,
        actualVersion: 1,
      },
    },
  );
});

test("rejects a changed target revision without advancing latest", async () => {
  const store = new InMemoryCognitionStore();
  const initial = objectRecord();
  const second = transitionCommit();
  const third = transitionCommit({ expectedVersion: 2 });
  await store.commitInitial({ object: initial });
  await store.commitTransition(second);
  await store.commitTransition(third);

  assert.deepEqual(
    await store.commitTransition({
      ...third,
      expectedVersion: 2,
      object: mutateTitle(third.object, "Changed version three"),
    }),
    {
      status: "conflict",
      conflict: {
        code: "object_revision_collision",
        objectId: initial.payload.id,
        expectedVersion: 3,
        actualVersion: 3,
      },
    },
  );
  assert.deepEqual(await store.getLatestObject(initial.payload.id), third.object);
});

test("rejects an event ID collision without committing its object", async () => {
  const store = new InMemoryCognitionStore();
  const initial = objectRecord();
  const transition = transitionCommit();
  const otherInitial = objectRecord({ id: "goal:other" });
  const collision = transitionCommit({ id: "goal:other", eventId: transition.event.payload.id });
  await store.commitInitial({ object: initial });
  await store.commitTransition(transition);
  await store.commitInitial({ object: otherInitial });

  assert.deepEqual(await store.commitTransition(collision), {
    status: "conflict",
    conflict: {
      code: "event_id_collision",
      objectId: otherInitial.payload.id,
    },
  });
  assert.deepEqual(await store.getLatestObject(otherInitial.payload.id), otherInitial);
  assert.deepEqual(await store.listObjectEvents(otherInitial.payload.id), []);
});

test("keeps transition writes atomic when a staged check fails", async () => {
  const store = new InMemoryCognitionStore();
  const initial = objectRecord();
  const transition = transitionCommit();
  const otherInitial = objectRecord({ id: "goal:atomic" });
  const collision = transitionCommit({ id: "goal:atomic", eventId: transition.event.payload.id });
  await store.commitInitial({ object: initial });
  await store.commitTransition(transition);
  await store.commitInitial({ object: otherInitial });

  await store.commitTransition(collision);

  assert.deepEqual(await store.getObjectVersion(otherInitial.payload.id, 2), undefined);
  assert.deepEqual(await store.listObjectEvents(otherInitial.payload.id), []);
});

test("lists object events in object-version order", async () => {
  const store = new InMemoryCognitionStore();
  const initial = objectRecord();
  const second = transitionCommit();
  const thirdObject = deserializeObject(JSON.stringify(second.object.payload));
  const thirdTransition = transitionObject(thirdObject, "paused", {
    eventId: "event:goal:reference-host:3",
    occurredAt: "2026-07-28T10:02:00.000Z",
    initiator: { id: "human:creator", kind: "human" },
    executor: { id: "human:creator", kind: "human" },
    accountableParty: { id: "human:owner", kind: "human" },
    automationMode: "manual",
    consequenceLevel: "routine",
    rationale: "Pause the reference-host goal.",
  });
  const third: TransitionCognitionCommit = {
    expectedVersion: 2,
    object: createPortableCognitionRecord({
      schemaVersion: "0.1.0",
      recordType: "cognitive-object",
      payload: thirdTransition.object,
    }) as PortableCognitiveObjectRecord,
    event: createPortableCognitionRecord({
      schemaVersion: "0.1.0",
      recordType: "cognition-event",
      payload: thirdTransition.event,
    }) as PortableCognitionEventRecord,
  };
  await store.commitInitial({ object: initial });
  await store.commitTransition(second);
  await store.commitTransition(third);

  assert.deepEqual(await store.listObjectEvents(initial.payload.id), [
    second.event,
    third.event,
  ]);
});

test("detaches caller values and read results from stored objects", async () => {
  const store = new InMemoryCognitionStore();
  const mutable = structuredClone(objectRecord()) as PortableCognitiveObjectRecord;
  await store.commitInitial({ object: mutable });
  (mutable.payload as { title: string }).title = "Caller mutation";
  const firstRead = await store.getLatestObject(mutable.payload.id);
  assert.ok(firstRead);
  assert.equal(firstRead.payload.title, "Reference host");
  assert.equal(Object.isFrozen(firstRead), true);
  assert.equal(Object.isFrozen(firstRead.payload), true);
  assert.throws(() => {
    (firstRead.payload as { title: string }).title = "Read mutation";
  }, TypeError);
  assert.equal(
    (await store.getLatestObject(mutable.payload.id))?.payload.title,
    "Reference host",
  );
});

test("publishes an event once and reports exact replays", async () => {
  const publisher = new InMemoryCognitionEventPublisher();
  const event = transitionCommit().event;

  assert.equal(
    await publisher.publish(event, { idempotencyKey: "publish:1" }),
    "published",
  );
  assert.equal(
    await publisher.publish(event, { idempotencyKey: "publish:1" }),
    "already_published",
  );
});

test("rejects changed event content for an existing idempotency key", async () => {
  const publisher = new InMemoryCognitionEventPublisher();
  const event = transitionCommit().event;
  await publisher.publish(event, { idempotencyKey: "publish:1" });

  await assert.rejects(
    publisher.publish(mutateEventRationale(event, "Changed publication."), {
      idempotencyKey: "publish:1",
    }),
  );
});

test("lists publications in first-acceptance order as detached frozen events", async () => {
  const publisher = new InMemoryCognitionEventPublisher();
  const first = transitionCommit().event;
  const second = transitionCommit({ id: "goal:publisher" }).event;
  await publisher.publish(first, { idempotencyKey: "publish:1" });
  await publisher.publish(second, { idempotencyKey: "publish:2" });

  const published = publisher.publishedEvents();
  assert.deepEqual(published, [first, second]);
  assert.notStrictEqual(published[0], first);
  assert.equal(Object.isFrozen(published), true);
  assert.equal(Object.isFrozen(published[0]), true);
  assert.equal(Object.isFrozen(published[0].payload), true);
  assert.throws(() => {
    (published[0].payload as { rationale: string }).rationale = "Read mutation";
  }, TypeError);
  assert.equal(publisher.publishedEvents()[0].payload.rationale, first.payload.rationale);
});
