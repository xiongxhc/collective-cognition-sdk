import assert from "node:assert/strict";
import test from "node:test";

import {
  commitCognitionTransition,
  commitInitialCognition,
  createObject,
  createPortableCognitionRecord,
  deserializeObject,
  DomainError,
  DomainErrorCode,
  transitionObject,
} from "../src/index.ts";
import type {
  CognitionEventPublisher,
  CognitionHost,
  CognitionPublicationStatus,
  CognitionStore,
  CognitionStoreCommitResult,
  InitialCognitionCommit,
  PortableCognitionEventRecord,
  PortableCognitiveObjectRecord,
  TransitionCognitionCommit,
} from "../src/index.ts";

type InitialBehavior =
  | CognitionStoreCommitResult
  | ((request: InitialCognitionCommit) => CognitionStoreCommitResult | Promise<CognitionStoreCommitResult>);

type TransitionBehavior =
  | CognitionStoreCommitResult
  | ((request: TransitionCognitionCommit) => CognitionStoreCommitResult | Promise<CognitionStoreCommitResult>);

type PublicationBehavior =
  | CognitionPublicationStatus
  | ((
      event: PortableCognitionEventRecord,
      options: { readonly idempotencyKey: string },
    ) => CognitionPublicationStatus | Promise<CognitionPublicationStatus>);

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

function portableTransitionCommit(): TransitionCognitionCommit {
  const previous = deserializeObject(JSON.stringify(portableGoalRecord().payload));
  const transition = transitionObject(previous, "active", {
    eventId: "event:goal-host-integration-active",
    occurredAt: "2026-07-28T10:01:00.000Z",
    initiator: { id: "human:creator", kind: "human" },
    executor: { id: "human:creator", kind: "human" },
    accountableParty: { id: "human:owner", kind: "human" },
    automationMode: "manual",
    consequenceLevel: "routine",
    rationale: "Activate the host integration goal.",
  });
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

function portableEvent(
  overrides: Record<string, unknown>,
): PortableCognitionEventRecord {
  const event = structuredClone(portableTransitionCommit().event) as unknown as {
    payload: Record<string, unknown>;
  };
  return createPortableCognitionRecord({
    schemaVersion: "0.1.0",
    recordType: "cognition-event",
    payload: { ...event.payload, ...overrides },
  } as unknown as PortableCognitionEventRecord) as PortableCognitionEventRecord;
}

function recordingHost({
  transitionBehavior = { status: "committed" },
  publicationBehavior = "published",
  onCommit,
  onPublish,
}: {
  readonly transitionBehavior?: TransitionBehavior;
  readonly publicationBehavior?: PublicationBehavior;
  readonly onCommit?: () => void;
  readonly onPublish?: () => void;
} = {}): CognitionHost & {
  readonly transitionCalls: TransitionCognitionCommit[];
  readonly publishCalls: {
    readonly event: PortableCognitionEventRecord;
    readonly options: { readonly idempotencyKey: string };
  }[];
} {
  const transitionCalls: TransitionCognitionCommit[] = [];
  const publishCalls: {
    event: PortableCognitionEventRecord;
    options: { readonly idempotencyKey: string };
  }[] = [];
  const store: CognitionStore = {
    async commitInitial() {
      return { status: "committed" };
    },
    async commitTransition(request) {
      transitionCalls.push(request);
      onCommit?.();
      return typeof transitionBehavior === "function"
        ? transitionBehavior(request)
        : transitionBehavior;
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
  const publisher: CognitionEventPublisher = {
    async publish(event, options) {
      publishCalls.push({ event, options });
      onPublish?.();
      return typeof publicationBehavior === "function"
        ? publicationBehavior(event, options)
        : publicationBehavior;
    },
  };
  return { store, publisher, transitionCalls, publishCalls };
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

test("accepts only the initial object collision for the requested object", async () => {
  const conflict = {
    code: "object_revision_collision" as const,
    objectId: "goal:host-integration",
  };
  const store = recordingStore({ status: "conflict", conflict });

  const outcome = await commitInitialCognition(store, {
    object: portableGoalRecord(),
  });

  assert.deepEqual(outcome, { status: "conflict", conflict });
});

test("fails closed on invalid or mis-correlated initial conflicts", async () => {
  const hostileConflict = {
    code: "object_revision_collision",
    objectId: "goal:host-integration",
  };
  Object.defineProperty(hostileConflict, "objectId", {
    enumerable: true,
    get() {
      throw new Error("HOSTILE_CONFLICT_SECRET");
    },
  });
  const invalidConflicts: readonly [string, unknown][] = [
    ["version conflict", {
      code: "version_conflict",
      objectId: "goal:host-integration",
      expectedVersion: 1,
      actualVersion: 2,
    }],
    ["event collision", {
      code: "event_id_collision",
      objectId: "goal:host-integration",
    }],
    ["cross-object collision", {
      code: "object_revision_collision",
      objectId: "goal:other",
    }],
    ["unrelated version claims", {
      code: "object_revision_collision",
      objectId: "goal:host-integration",
      expectedVersion: 1,
      actualVersion: 1,
    }],
    ["descriptor-hostile collision", hostileConflict],
  ];

  for (const [description, conflict] of invalidConflicts) {
    const store = recordingStore({
      status: "conflict",
      conflict,
    } as unknown as CognitionStoreCommitResult);
    const outcome = await commitInitialCognition(store, {
      object: portableGoalRecord(),
    });

    assert.deepEqual(outcome, failedCommitOutcome(), description);
  }
});

test("detaches conflict outcomes from mutable host aliases", async () => {
  const conflict = {
    code: "object_revision_collision" as const,
    objectId: "goal:host-integration",
  };
  const store = recordingStore({ status: "conflict", conflict });

  const outcome = await commitInitialCognition(store, {
    object: portableGoalRecord(),
  });
  conflict.objectId = "goal:mutated";

  assert.equal(outcome.status, "conflict");
  assert.notStrictEqual(outcome.conflict, conflict);
  assert.equal(Object.isFrozen(outcome.conflict), true);
  assert.deepEqual(outcome.conflict, {
    code: "object_revision_collision",
    objectId: "goal:host-integration",
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

test("stores a transition before publishing its event", async () => {
  const calls: string[] = [];
  const host = recordingHost({
    onCommit: () => calls.push("commit"),
    onPublish: () => calls.push("publish"),
  });
  const request = portableTransitionCommit();

  const outcome = await commitCognitionTransition(host, request);

  assert.equal(outcome.status, "committed");
  assert.deepEqual(calls, ["commit", "publish"]);
  assert.equal(host.publishCalls[0].options.idempotencyKey, request.event.payload.id);
  assert.equal(Object.isFrozen(host.publishCalls[0].options), true);
});

test("commits only a coherent transition request", async () => {
  const request = portableTransitionCommit();
  const host = recordingHost();

  const outcome = await commitCognitionTransition(host, request);

  assert.equal(outcome.status, "committed");
  assert.equal(outcome.object.payload.version, request.expectedVersion + 1);
  assert.equal(outcome.event.payload.objectId, outcome.object.payload.id);
  assert.equal(outcome.event.payload.objectType, outcome.object.payload.type);
  assert.equal(outcome.event.payload.objectVersion, outcome.object.payload.version);
  assert.equal(outcome.event.payload.nextState, outcome.object.payload.state);
  assert.equal(outcome.event.payload.occurredAt, outcome.object.payload.updatedAt);
});

test("rejects every incoherent transition before invoking an adapter", async () => {
  const request = portableTransitionCommit();
  const invalidRequests: TransitionCognitionCommit[] = [
    { ...request, expectedVersion: 0 },
    { ...request, expectedVersion: Number.MAX_SAFE_INTEGER + 1 },
    { ...request, object: portableGoalRecord({ version: 1 }) },
    { ...request, event: portableEvent({ objectId: "goal:other" }) },
    {
      ...request,
      event: portableEvent({
        objectType: "identity",
        previousState: "active",
        nextState: "inactive",
        type: "IdentityInactive",
      }),
    },
    { ...request, event: portableEvent({ objectVersion: 3 }) },
    {
      ...request,
      event: portableEvent({
        previousState: "active",
        nextState: "at_risk",
        type: "GoalAtRisk",
      }),
    },
    { ...request, event: portableEvent({ occurredAt: "2026-07-28T10:02:00.000Z" }) },
  ];

  for (const invalidRequest of invalidRequests) {
    const host = recordingHost();
    await assert.rejects(
      commitCognitionTransition(host, invalidRequest),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === DomainErrorCode.INVALID_HOST_INTEGRATION_REQUEST,
    );
    assert.equal(host.transitionCalls.length, 0);
    assert.equal(host.publishCalls.length, 0);
  }
});

test("does not publish a store conflict", async () => {
  const host = recordingHost({
    transitionBehavior: {
      status: "conflict",
      conflict: {
        code: "version_conflict",
        objectId: "goal:host-integration",
        expectedVersion: 1,
        actualVersion: 2,
      },
    },
  });

  const outcome = await commitCognitionTransition(host, portableTransitionCommit());

  assert.equal(outcome.status, "conflict");
  assert.equal(host.publishCalls.length, 0);
});

test("accepts only operation-specific transition conflicts", async () => {
  const request = portableTransitionCommit();
  const conflicts = [
    {
      code: "version_conflict",
      objectId: request.object.payload.id,
      expectedVersion: request.expectedVersion,
      actualVersion: request.expectedVersion + 1,
    },
    {
      code: "object_revision_collision",
      objectId: request.object.payload.id,
    },
    {
      code: "event_id_collision",
      objectId: request.object.payload.id,
      eventId: request.event.payload.id,
    },
  ] as const;

  for (const conflict of conflicts) {
    const host = recordingHost({
      transitionBehavior: {
        status: "conflict",
        conflict,
      } as unknown as CognitionStoreCommitResult,
    });

    assert.deepEqual(
      await commitCognitionTransition(host, request),
      { status: "conflict", conflict },
    );
    assert.equal(host.publishCalls.length, 0);
  }
});

test("fails closed on invalid or mis-correlated transition conflicts", async () => {
  const request = portableTransitionCommit();
  const hostileConflict = {
    code: "event_id_collision",
    objectId: request.object.payload.id,
    eventId: request.event.payload.id,
  };
  Object.defineProperty(hostileConflict, "eventId", {
    enumerable: true,
    get() {
      throw new Error("HOSTILE_CONFLICT_SECRET");
    },
  });
  const invalidConflicts: readonly [string, unknown][] = [
    ["cross-object version conflict", {
      code: "version_conflict",
      objectId: "goal:other",
      expectedVersion: 1,
      actualVersion: 2,
    }],
    ["wrong expected version", {
      code: "version_conflict",
      objectId: request.object.payload.id,
      expectedVersion: 2,
      actualVersion: 3,
    }],
    ["equal actual version", {
      code: "version_conflict",
      objectId: request.object.payload.id,
      expectedVersion: 1,
      actualVersion: 1,
    }],
    ["unsafe actual version", {
      code: "version_conflict",
      objectId: request.object.payload.id,
      expectedVersion: 1,
      actualVersion: Number.MAX_SAFE_INTEGER + 1,
    }],
    ["object collision with version claims", {
      code: "object_revision_collision",
      objectId: request.object.payload.id,
      expectedVersion: 2,
      actualVersion: 2,
    }],
    ["cross-object revision collision", {
      code: "object_revision_collision",
      objectId: "goal:other",
    }],
    ["event collision without event identity", {
      code: "event_id_collision",
      objectId: request.object.payload.id,
    }],
    ["cross-event collision", {
      code: "event_id_collision",
      objectId: request.object.payload.id,
      eventId: "event:other",
    }],
    ["cross-object event collision", {
      code: "event_id_collision",
      objectId: "goal:other",
      eventId: request.event.payload.id,
    }],
    ["descriptor-hostile event collision", hostileConflict],
  ];

  for (const [description, conflict] of invalidConflicts) {
    const host = recordingHost({
      transitionBehavior: {
        status: "conflict",
        conflict,
      } as unknown as CognitionStoreCommitResult,
    });

    assert.deepEqual(
      await commitCognitionTransition(host, request),
      failedCommitOutcome(),
      description,
    );
    assert.equal(host.publishCalls.length, 0, description);
  }
});

test("returns a failed outcome without publishing when the store throws", async () => {
  const host = recordingHost({
    transitionBehavior: () => {
      throw new Error("HOST_STORE_SECRET");
    },
  });

  const outcome = await commitCognitionTransition(host, portableTransitionCommit());

  assert.equal(outcome.status, "failed");
  assert.equal(outcome.error.code, "HOST_COMMIT_FAILED");
  assert.equal(host.publishCalls.length, 0);
  assert.equal(JSON.stringify(outcome).includes("HOST_STORE_SECRET"), false);
});

test("preserves successful publication statuses", async () => {
  for (const publicationBehavior of ["published", "already_published"] as const) {
    const host = recordingHost({ publicationBehavior });

    const outcome = await commitCognitionTransition(host, portableTransitionCommit());

    assert.deepEqual(outcome.status, "committed");
    if (outcome.status === "committed") {
      assert.equal(outcome.persistence, "committed");
      assert.equal(outcome.publication, publicationBehavior);
    }
  }
});

test("returns a frozen partial success when publication throws", async () => {
  const request = portableTransitionCommit();
  const host = recordingHost({
    publicationBehavior: () => {
      throw new Error("HOST_PUBLICATION_SECRET");
    },
  });

  const outcome = await commitCognitionTransition(host, request);

  assert.equal(outcome.status, "committed_but_unpublished");
  if (outcome.status === "committed_but_unpublished") {
    assert.equal(outcome.error.code, "HOST_PUBLICATION_FAILED");
    assert.equal(Object.isFrozen(outcome.object), true);
    assert.equal(Object.isFrozen(outcome.event), true);
    assert.notStrictEqual(outcome.object, request.object);
    assert.notStrictEqual(outcome.event, request.event);
  }
  assert.equal(JSON.stringify(outcome).includes("HOST_PUBLICATION_SECRET"), false);
});

test("returns a sanitized partial success when publication returns an invalid status", async () => {
  const request = portableTransitionCommit();
  const host = recordingHost({
    publicationBehavior: () =>
      "HOST_PUBLICATION_SECRET" as unknown as CognitionPublicationStatus,
  });

  const outcome = await commitCognitionTransition(host, request);

  assert.equal(outcome.status, "committed_but_unpublished");
  if (outcome.status === "committed_but_unpublished") {
    assert.deepEqual(outcome.error, {
      code: "HOST_PUBLICATION_FAILED",
      message: "Cognition publication failed.",
      objectId: "goal:host-integration",
      eventId: "event:goal-host-integration-active",
    });
  }
  assert.equal(JSON.stringify(outcome).includes("HOST_PUBLICATION_SECRET"), false);
});

test("recovers an identical request after publication failure", async () => {
  const request = portableTransitionCommit();
  let retried = false;
  const host = recordingHost({
    transitionBehavior: () => {
      const status = retried ? "already_committed" : "committed";
      retried = true;
      return { status };
    },
    publicationBehavior: (() => {
      let failed = false;
      return () => {
        if (!failed) {
          failed = true;
          throw new Error("HOST_PUBLICATION_SECRET");
        }
        return "published";
      };
    })(),
  });

  const first = await commitCognitionTransition(host, request);
  const retry = await commitCognitionTransition(host, request);

  assert.equal(first.status, "committed_but_unpublished");
  assert.equal(retry.status, "committed");
  if (retry.status === "committed") {
    assert.equal(retry.persistence, "already_committed");
    assert.equal(retry.publication, "published");
  }
  assert.equal(host.transitionCalls.length, 2);
  assert.equal(host.publishCalls.length, 2);
});
