import assert from "node:assert/strict";
import test from "node:test";

import {
  createObject,
  createPortableCognitionRecord,
} from "../src/index.ts";
import {
  runCognitionHostConformance,
} from "../src/host-conformance.ts";
import type { CognitionHostConformanceFactory } from "../src/host-conformance.ts";
import {
  InMemoryCognitionEventPublisher,
  InMemoryCognitionStore,
} from "../src/reference-host.ts";
import type {
  CognitionEventPublisher,
  CognitionStore,
  CognitionStoreCommitResult,
  InitialCognitionCommit,
  PortableCognitionEventRecord,
  PortableCognitiveObjectRecord,
  TransitionCognitionCommit,
} from "../src/host-integration.ts";

function objectRecord(
  id = "goal:host-conformance",
): PortableCognitiveObjectRecord {
  return createPortableCognitionRecord({
    schemaVersion: "0.1.0",
    recordType: "cognitive-object",
    payload: createObject({
      id,
      type: "goal",
      version: 1,
      state: "draft",
      title: "Host conformance",
      data: { objective: "Exercise the public host ports." },
      createdAt: "2026-07-28T10:00:00.000Z",
      updatedAt: "2026-07-28T10:00:00.000Z",
      attribution: {
        initiatorId: "human:creator",
        executorId: "human:creator",
        accountableId: "human:owner",
      },
      provenance: [{
        source: "host-conformance-test",
        sourceId: id,
        capturedAt: "2026-07-28T10:00:00.000Z",
      }],
      contextId: "organization:test",
      relationships: [],
    }),
  }) as PortableCognitiveObjectRecord;
}

class BrokenAtomicityStore implements CognitionStore {
  readonly #store = new InMemoryCognitionStore();

  commitInitial(request: InitialCognitionCommit) {
    return this.#store.commitInitial(request);
  }

  async commitTransition(
    request: TransitionCognitionCommit,
  ): Promise<CognitionStoreCommitResult> {
    const result = await this.#store.commitTransition(request);
    if (
      result.status === "conflict" &&
      result.conflict.code === "event_id_collision" &&
      request.object.payload.id === "goal:host-conformance:atomic"
    ) {
      const event = createPortableCognitionRecord({
        schemaVersion: "0.1.0",
        recordType: "cognition-event",
        payload: {
          ...request.event.payload,
          id: `${request.event.payload.id}:partial`,
        },
      }) as PortableCognitionEventRecord;
      await this.#store.commitTransition({ ...request, event });
    }
    return result;
  }

  getLatestObject(objectId: string) {
    return this.#store.getLatestObject(objectId);
  }

  getObjectVersion(objectId: string, version: number) {
    return this.#store.getObjectVersion(objectId, version);
  }

  listObjectEvents(objectId: string) {
    return this.#store.listObjectEvents(objectId);
  }
}

function brokenAtomicityFactory(): CognitionHostConformanceFactory {
  return {
    createStore: () => new BrokenAtomicityStore(),
    createPublisher: () => new InMemoryCognitionEventPublisher(),
  };
}

test("the in-memory host passes every host conformance case", async () => {
  const report = await runCognitionHostConformance({
    createStore: () => new InMemoryCognitionStore(),
    createPublisher: () => new InMemoryCognitionEventPublisher(),
  });

  assert.equal(report.passed, true);
  assert.equal(report.cases.every(({ status }) => status === "passed"), true);
  assert.equal(report.cases.length, 11);
  assert.equal(Object.isFrozen(report), true);
  assert.equal(Object.isFrozen(report.cases), true);
  assert.equal(report.cases.every(Object.isFrozen), true);
  assert.throws(() => {
    (report.cases as unknown as { length: number }).length = 0;
  }, TypeError);
});

test("a non-atomic host fails the atomicity case without aborting the suite", async () => {
  const report = await runCognitionHostConformance(brokenAtomicityFactory());

  assert.equal(report.passed, false);
  assert.equal(
    report.cases.find(({ id }) => id === "HIC-CONF-007")?.status,
    "failed",
  );
  assert.equal(
    report.cases.find(({ id }) => id === "HIC-CONF-011")?.status,
    "passed",
  );
});

test("isolates each case and sends only Portable Cognition records to ports", async () => {
  let stores = 0;
  let publishers = 0;
  const recordTypes: string[] = [];
  const factory: CognitionHostConformanceFactory = {
    createStore: () => {
      stores += 1;
      const store = new InMemoryCognitionStore();
      return {
        async commitInitial(request) {
          recordTypes.push(request.object.recordType);
          return store.commitInitial(request);
        },
        async commitTransition(request) {
          recordTypes.push(request.object.recordType, request.event.recordType);
          return store.commitTransition(request);
        },
        getLatestObject: (objectId) => store.getLatestObject(objectId),
        getObjectVersion: (objectId, version) =>
          store.getObjectVersion(objectId, version),
        listObjectEvents: (objectId) => store.listObjectEvents(objectId),
      } satisfies CognitionStore;
    },
    createPublisher: () => {
      publishers += 1;
      const publisher = new InMemoryCognitionEventPublisher();
      return {
        async publish(event, options) {
          recordTypes.push(event.recordType);
          return publisher.publish(event, options);
        },
      } satisfies CognitionEventPublisher;
    },
  };

  const report = await runCognitionHostConformance(factory);

  assert.equal(report.passed, true);
  assert.equal(stores, 9);
  assert.equal(publishers, 3);
  assert.deepEqual(new Set(recordTypes), new Set([
    "cognitive-object",
    "cognition-event",
  ]));
});

test("sanitizes adapter errors and continues with later conformance cases", async () => {
  let calls = 0;
  const report = await runCognitionHostConformance({
    createStore: () => {
      calls += 1;
      if (calls === 1) {
        const store = new InMemoryCognitionStore();
        return {
          commitInitial() {
            throw new Error("HOST_ADAPTER_SECRET");
          },
          commitTransition: (request) => store.commitTransition(request),
          getLatestObject: (objectId) => store.getLatestObject(objectId),
          getObjectVersion: (objectId, version) =>
            store.getObjectVersion(objectId, version),
          listObjectEvents: (objectId) => store.listObjectEvents(objectId),
        } satisfies CognitionStore;
      }
      return new InMemoryCognitionStore();
    },
    createPublisher: () => new InMemoryCognitionEventPublisher(),
  });

  const first = report.cases.find(({ id }) => id === "HIC-CONF-001");
  assert.equal(first?.status, "failed");
  assert.equal(first?.message, "Host conformance case failed.");
  assert.equal(JSON.stringify(report).includes("HOST_ADAPTER_SECRET"), false);
  assert.equal(
    report.cases.find(({ id }) => id === "HIC-CONF-002")?.status,
    "passed",
  );
});
