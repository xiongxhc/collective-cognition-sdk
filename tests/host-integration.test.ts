import assert from "node:assert/strict";
import test from "node:test";

import {
  commitInitialCognition,
  createObject,
  createPortableCognitionRecord,
  deserializeObject,
  DomainError,
  DomainErrorCode,
} from "../src/index.ts";
import type {
  CognitionStore,
  CognitionStoreCommitResult,
  InitialCognitionCommit,
  PortableCognitiveObjectRecord,
} from "../src/index.ts";

type InitialBehavior =
  | CognitionStoreCommitResult
  | ((request: InitialCognitionCommit) => CognitionStoreCommitResult | Promise<CognitionStoreCommitResult>);

function portableGoalRecord(
  overrides: Partial<{ readonly version: number }> = {},
): PortableCognitiveObjectRecord {
  const object = createObject({
    id: "goal:host-integration",
    type: "goal",
    version: 1,
    state: "draft",
    title: "Host integration",
    data: { description: "Verify the host persistence boundary." },
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
        sourceId: "host-integration",
        capturedAt: "2026-07-28T10:00:00.000Z",
      },
    ],
    contextId: "organization:test",
    relationships: [],
  });
  return createPortableCognitionRecord({
    schemaVersion: "0.1.0",
    recordType: "cognitive-object",
    payload: overrides.version === undefined
      ? object
      : deserializeObject(JSON.stringify({ ...object, version: overrides.version })),
  }) as PortableCognitiveObjectRecord;
}

function recordingStore(initialBehavior: InitialBehavior): CognitionStore & {
  readonly initialCalls: InitialCognitionCommit[];
} {
  const initialCalls: InitialCognitionCommit[] = [];
  return {
    initialCalls,
    async commitInitial(request) {
      initialCalls.push(request);
      return typeof initialBehavior === "function"
        ? initialBehavior(request)
        : initialBehavior;
    },
    async commitTransition() {
      return { status: "committed" };
    },
    async getLatestObject() {
      return undefined;
    },
    async getObjectVersion() {
      return undefined;
    },
    async listObjectEvents() {
      return [];
    },
  };
}

function failedCommitOutcome() {
  return {
    status: "failed" as const,
    error: {
      code: "HOST_COMMIT_FAILED",
      message: "Cognition commit failed.",
      objectId: "goal:host-integration",
    },
  };
}

test("commits a validated initial cognitive object", async () => {
  const store = recordingStore({ status: "committed" });
  const outcome = await commitInitialCognition(store, {
    object: portableGoalRecord({ version: 1 }),
  });

  assert.equal(outcome.status, "committed");
  assert.equal(outcome.persistence, "committed");
  assert.equal(store.initialCalls.length, 1);
  assert.equal(Object.isFrozen(store.initialCalls[0].object), true);
});

test("rejects non-version-one initial objects before host invocation", async () => {
  const store = recordingStore({ status: "committed" });

  await assert.rejects(
    commitInitialCognition(store, {
      object: portableGoalRecord({ version: 2 }),
    }),
    (error: unknown) =>
      error instanceof DomainError &&
      error.code === DomainErrorCode.INVALID_HOST_INTEGRATION_REQUEST,
  );
  assert.equal(store.initialCalls.length, 0);
});

test("preserves an exact already committed result", async () => {
  const store = recordingStore({ status: "already_committed" });

  const outcome = await commitInitialCognition(store, {
    object: portableGoalRecord(),
  });

  assert.deepEqual(outcome, {
    status: "committed",
    persistence: "already_committed",
    object: portableGoalRecord(),
  });
});

test("passes a conflict result through unchanged", async () => {
  const conflict = {
    code: "object_revision_collision" as const,
    objectId: "goal:host-integration",
    expectedVersion: 1,
    actualVersion: 2,
  };
  const store = recordingStore({ status: "conflict", conflict });

  const outcome = await commitInitialCognition(store, {
    object: portableGoalRecord(),
  });

  assert.deepEqual(outcome, { status: "conflict", conflict });
});

test("fails closed on invalid conflict versions", async () => {
  const invalidVersions = [NaN, Infinity, -Infinity, 0, -1, 1.5];

  for (const field of ["expectedVersion", "actualVersion"] as const) {
    for (const value of invalidVersions) {
      const store = recordingStore({
        status: "conflict",
        conflict: {
          code: "version_conflict",
          objectId: "goal:host-integration",
          expectedVersion: 1,
          actualVersion: 1,
          [field]: value,
        },
      } as unknown as CognitionStoreCommitResult);

      const outcome = await commitInitialCognition(store, {
        object: portableGoalRecord(),
      });

      assert.deepEqual(outcome, failedCommitOutcome());
    }
  }
});

test("detaches conflict outcomes from mutable host aliases", async () => {
  const conflict = {
    code: "version_conflict" as const,
    objectId: "goal:host-integration",
    expectedVersion: 1,
    actualVersion: 2,
  };
  const store = recordingStore({ status: "conflict", conflict });

  const outcome = await commitInitialCognition(store, {
    object: portableGoalRecord(),
  });
  conflict.objectId = "goal:mutated";
  conflict.expectedVersion = 9;

  assert.equal(outcome.status, "conflict");
  assert.notStrictEqual(outcome.conflict, conflict);
  assert.equal(Object.isFrozen(outcome.conflict), true);
  assert.deepEqual(outcome.conflict, {
    code: "version_conflict",
    objectId: "goal:host-integration",
    expectedVersion: 1,
    actualVersion: 2,
  });
});

test("isolates the caller and outcome from host request mutation", async () => {
  const callerObject = structuredClone(portableGoalRecord()) as {
    payload: { title: string };
  } as PortableCognitiveObjectRecord;
  const store = recordingStore((request) => {
    try {
      (request.object.payload as { title: string }).title = "Mutated by host";
    } catch {}
    return { status: "committed" };
  });

  const outcome = await commitInitialCognition(store, { object: callerObject });
  (callerObject.payload as { title: string }).title = "Mutated by caller";

  assert.equal(callerObject.payload.title, "Mutated by caller");
  assert.equal(Object.isFrozen(store.initialCalls[0]), true);
  assert.equal(Object.isFrozen(store.initialCalls[0].object), true);
  assert.equal(store.initialCalls[0].object.payload.title, "Host integration");
  assert.equal(outcome.status, "committed");
  assert.equal(outcome.object.payload.title, "Host integration");
});

test("rejects hostile input before host invocation", async () => {
  const store = recordingStore({ status: "committed" });
  const accessorObject = structuredClone(portableGoalRecord());
  Object.defineProperty(accessorObject, "payload", {
    enumerable: true,
    get() {
      throw new Error("HOSTILE_ACCESSOR_SECRET");
    },
  });
  const reflectionFailure = new Proxy(structuredClone(portableGoalRecord()), {
    ownKeys() {
      throw new Error("HOSTILE_PROXY_SECRET");
    },
  });

  for (const object of [accessorObject, reflectionFailure]) {
    await assert.rejects(
      commitInitialCognition(store, {
        object: object as PortableCognitiveObjectRecord,
      }),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === DomainErrorCode.INVALID_HOST_INTEGRATION_REQUEST,
    );
  }
  assert.equal(store.initialCalls.length, 0);
});

test("sanitizes host commit exceptions", async () => {
  const store = recordingStore(() => {
    throw new Error("HOST_COMMIT_SECRET");
  });

  const outcome = await commitInitialCognition(store, {
    object: portableGoalRecord(),
  });

  assert.deepEqual(outcome, {
    status: "failed",
    error: {
      code: "HOST_COMMIT_FAILED",
      message: "Cognition commit failed.",
      objectId: "goal:host-integration",
    },
  });
  assert.equal(JSON.stringify(outcome).includes("HOST_COMMIT_SECRET"), false);
});
