import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DatabaseSync,
  StatementSync,
} from "node:sqlite";
import test, { after } from "node:test";

import {
  createPortableCognitionRecord,
  serializePortableCognitionRecord,
} from "../src/index.ts";
import { runDurableWorkflowStoreConformance } from "../src/workflows/durable.ts";
import { SqliteCognitionWorkflowStore } from "../src/stores/sqlite-workflow.ts";
import type {
  CognitionStoreCommitResult,
  PortableCognitionEventRecord,
  PortableCognitiveObjectRecord,
  TransitionCognitionCommit,
} from "../src/index.ts";
import type {
  CognitionWorkflowStore,
  DurableCognitionCommitResult,
  DurableWorkflowStoreConformanceScenario,
  DurableWorkflowStoreFactory,
  PreparedDurableCognitionCommit,
} from "../src/workflows/durable.ts";
import type { StatementResultingChanges } from "node:sqlite";

// @ts-expect-error Legacy object factory must not be part of the durable subpath.
import type { DurableWorkflowStoreConformanceFactory } from "../src/workflows/durable.ts";

function defensiveModeIsEnforced(): boolean {
  let database: DatabaseSync | undefined;
  try {
    database = new DatabaseSync(":memory:", {
      allowExtension: false,
      defensive: true,
      enableDoubleQuotedStringLiterals: false,
      enableForeignKeyConstraints: true,
    });
    database.enableDefensive(true);
    database.exec("PRAGMA writable_schema = ON");
    const result = database
      .prepare("PRAGMA writable_schema")
      .get() as { readonly writable_schema?: unknown };
    return result.writable_schema === 0;
  } catch {
    return false;
  } finally {
    if (database?.isOpen) database.close();
  }
}

const supportsDefensiveMode =
  typeof DatabaseSync.prototype.enableDefensive === "function" &&
  defensiveModeIsEnforced();
const sqliteTest = supportsDefensiveMode ? test : test.skip;
const sqliteTemporaryDirectories = new Set<string>();

after(() => {
  for (const directory of sqliteTemporaryDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function copyObject(record: PortableCognitiveObjectRecord): PortableCognitiveObjectRecord {
  return createPortableCognitionRecord(
    structuredClone(record),
  ) as PortableCognitiveObjectRecord;
}

function copyEvent(record: PortableCognitionEventRecord): PortableCognitionEventRecord {
  return createPortableCognitionRecord(
    structuredClone(record),
  ) as PortableCognitionEventRecord;
}

function matches(
  left: PortableCognitiveObjectRecord | PortableCognitionEventRecord,
  right: PortableCognitiveObjectRecord | PortableCognitionEventRecord,
): boolean {
  return serializePortableCognitionRecord(left) === serializePortableCognitionRecord(right);
}

function objectKey(record: PortableCognitiveObjectRecord): string {
  return `${record.payload.id}\u0000${record.payload.version}`;
}

class MemoryWorkflowStore implements CognitionWorkflowStore {
  readonly #objects = new Map<string, PortableCognitiveObjectRecord>();
  readonly #events = new Map<string, PortableCognitionEventRecord>();
  readonly #latest = new Map<string, number>();
  readonly #workflows = new Map<string, string>();
  #failAfterInitialWrite = false;

  configureConformanceStore(
    scenario: "version-conflict" | "rollback",
    workflow: PreparedDurableCognitionCommit,
  ): void {
    if (scenario === "version-conflict") {
      this.#latest.set(workflow.initialHypothesis.payload.id, 2);
      return;
    }
    this.#failAfterInitialWrite = true;
  }

  async commitWorkflow(
    request: PreparedDurableCognitionCommit,
  ): Promise<DurableCognitionCommitResult> {
    const objects = [
      request.initialHypothesis,
      request.evidence,
      request.reviewedHypothesis,
    ];
    const stored = objects.map((record) => this.#objects.get(objectKey(record)));
    const storedEvent = this.#events.get(request.event.payload.id);
    const workflowDigest = this.#workflows.get(request.workflowId);
    const allObjectsMatch = stored.every(
      (record, index) => record !== undefined && matches(record, objects[index]),
    );
    const eventMatches = storedEvent !== undefined && matches(storedEvent, request.event);

    if (workflowDigest !== undefined) {
      if (workflowDigest === request.requestDigest && allObjectsMatch && eventMatches) {
        return { status: "already_committed" };
      }
      return {
        status: "conflict",
        conflict: { code: "workflow_id_collision", workflowId: request.workflowId },
      };
    }
    if (allObjectsMatch && eventMatches) {
      return {
        status: "conflict",
        conflict: { code: "incomplete_workflow", workflowId: request.workflowId },
      };
    }
    if (
      (stored[0] !== undefined && !matches(stored[0], objects[0])) ||
      (stored[1] !== undefined && !matches(stored[1], objects[1]))
    ) {
      return {
        status: "conflict",
        conflict: { code: "object_revision_collision", workflowId: request.workflowId },
      };
    }
    if (stored[2] !== undefined) {
      return {
        status: "conflict",
        conflict: { code: "object_revision_collision", workflowId: request.workflowId },
      };
    }
    if (storedEvent !== undefined) {
      return {
        status: "conflict",
        conflict: { code: "event_id_collision", workflowId: request.workflowId },
      };
    }
    const latest = this.#latest.get(request.initialHypothesis.payload.id);
    if (latest !== undefined && latest !== request.expectedHypothesisVersion) {
      return {
        status: "conflict",
        conflict: { code: "version_conflict", workflowId: request.workflowId },
      };
    }

    const objectsBeforeWrite = new Map(this.#objects);
    const eventsBeforeWrite = new Map(this.#events);
    const latestBeforeWrite = new Map(this.#latest);
    const workflowsBeforeWrite = new Map(this.#workflows);
    try {
      this.#objects.set(objectKey(request.initialHypothesis), copyObject(request.initialHypothesis));
      if (this.#failAfterInitialWrite) {
        this.#failAfterInitialWrite = false;
        throw new Error("Forced post-write failure.");
      }
      this.#objects.set(objectKey(request.evidence), copyObject(request.evidence));
      this.#objects.set(objectKey(request.reviewedHypothesis), copyObject(request.reviewedHypothesis));
      this.#events.set(request.event.payload.id, copyEvent(request.event));
      this.#latest.set(
        request.reviewedHypothesis.payload.id,
        request.reviewedHypothesis.payload.version,
      );
      this.#latest.set(request.evidence.payload.id, request.evidence.payload.version);
      this.#workflows.set(request.workflowId, request.requestDigest);
    } catch (error) {
      this.#objects.clear();
      this.#events.clear();
      this.#latest.clear();
      this.#workflows.clear();
      for (const [key, record] of objectsBeforeWrite) this.#objects.set(key, record);
      for (const [key, event] of eventsBeforeWrite) this.#events.set(key, event);
      for (const [key, version] of latestBeforeWrite) this.#latest.set(key, version);
      for (const [key, digest] of workflowsBeforeWrite) this.#workflows.set(key, digest);
      throw error;
    }
    return { status: "committed" };
  }

  async commitInitial(
    request: { readonly object: PortableCognitiveObjectRecord },
  ): Promise<CognitionStoreCommitResult> {
    const key = objectKey(request.object);
    const existing = this.#objects.get(key);
    if (existing !== undefined) {
      return matches(existing, request.object)
        ? { status: "already_committed" }
        : {
            status: "conflict",
            conflict: {
              code: "object_revision_collision",
              objectId: request.object.payload.id,
            },
          };
    }
    this.#objects.set(key, copyObject(request.object));
    this.#latest.set(request.object.payload.id, request.object.payload.version);
    return { status: "committed" };
  }

  async commitTransition(
    request: TransitionCognitionCommit,
  ): Promise<CognitionStoreCommitResult> {
    const object = this.#objects.get(objectKey(request.object));
    const event = this.#events.get(request.event.payload.id);
    if (object !== undefined || event !== undefined) {
      return {
        status: "conflict",
        conflict: {
          code: event === undefined ? "object_revision_collision" : "event_id_collision",
          objectId: request.object.payload.id,
          ...(event === undefined ? {} : { eventId: request.event.payload.id }),
        } as CognitionStoreCommitResult extends { readonly conflict: infer Conflict } ? Conflict : never,
      };
    }
    const latest = this.#latest.get(request.object.payload.id);
    if (latest !== request.expectedVersion) {
      return {
        status: "conflict",
        conflict: {
          code: "version_conflict",
          objectId: request.object.payload.id,
          expectedVersion: request.expectedVersion,
          actualVersion: latest ?? 0,
        },
      };
    }
    this.#objects.set(objectKey(request.object), copyObject(request.object));
    this.#events.set(request.event.payload.id, copyEvent(request.event));
    this.#latest.set(request.object.payload.id, request.object.payload.version);
    return { status: "committed" };
  }

  async getLatestObject(
    objectId: string,
  ): Promise<PortableCognitiveObjectRecord | undefined> {
    const version = this.#latest.get(objectId);
    return version === undefined ? undefined : this.getObjectVersion(objectId, version);
  }

  async getObjectVersion(
    objectId: string,
    version: number,
  ): Promise<PortableCognitiveObjectRecord | undefined> {
    const record = this.#objects.get(`${objectId}\u0000${version}`);
    return record === undefined ? undefined : copyObject(record);
  }

  async listObjectEvents(
    objectId: string,
  ): Promise<readonly PortableCognitionEventRecord[]> {
    return Object.freeze(
      [...this.#events.values()]
        .filter((event) => event.payload.objectId === objectId)
        .map(copyEvent),
    );
  }
}

class AliasedReadStore extends MemoryWorkflowStore {
  readonly #objects = new Map<string, PortableCognitiveObjectRecord>();
  #events: readonly PortableCognitionEventRecord[] | undefined;

  override async getObjectVersion(
    objectId: string,
    version: number,
  ): Promise<PortableCognitiveObjectRecord | undefined> {
    const key = `${objectId}\u0000${version}`;
    const existing = this.#objects.get(key);
    if (existing !== undefined) return existing;
    const record = await super.getObjectVersion(objectId, version);
    if (record !== undefined) this.#objects.set(key, record);
    return record;
  }

  override async listObjectEvents(
    objectId: string,
  ): Promise<readonly PortableCognitionEventRecord[]> {
    if (this.#events !== undefined) return this.#events;
    this.#events = await super.listObjectEvents(objectId);
    return this.#events;
  }
}

class NestedAliasedReadStore extends MemoryWorkflowStore {
  #reviewedHypothesis: PortableCognitiveObjectRecord | undefined;

  override async commitWorkflow(
    request: PreparedDurableCognitionCommit,
  ): Promise<DurableCognitionCommitResult> {
    const result = await super.commitWorkflow(request);
    if (result.status === "committed") {
      this.#reviewedHypothesis = request.reviewedHypothesis;
    }
    return result;
  }

  override async getObjectVersion(
    objectId: string,
    version: number,
  ): Promise<PortableCognitiveObjectRecord | undefined> {
    const record = await super.getObjectVersion(objectId, version);
    if (
      record === undefined ||
      this.#reviewedHypothesis === undefined ||
      objectId !== this.#reviewedHypothesis.payload.id ||
      version !== this.#reviewedHypothesis.payload.version
    ) {
      return record;
    }
    return Object.freeze({
      ...record,
      payload: Object.freeze({
        ...record.payload,
        data: this.#reviewedHypothesis.payload.data,
      }),
    }) as PortableCognitiveObjectRecord;
  }
}

class CrossWiredReadStore extends MemoryWorkflowStore {
  #event: PortableCognitionEventRecord | undefined;
  #eventReadCount = 0;

  override async commitWorkflow(
    request: PreparedDurableCognitionCommit,
  ): Promise<DurableCognitionCommitResult> {
    const result = await super.commitWorkflow(request);
    if (result.status === "committed") {
      this.#event = request.event;
    }
    return result;
  }

  override async listObjectEvents(
    objectId: string,
  ): Promise<readonly PortableCognitionEventRecord[]> {
    const events = await super.listObjectEvents(objectId);
    if (this.#event === undefined || this.#eventReadCount++ !== 0 || events.length !== 1) {
      return events;
    }
    return Object.freeze([Object.freeze({
      ...events[0],
      payload: Object.freeze({
        ...events[0].payload,
        executor: this.#event.payload.initiator,
      }),
    }) as PortableCognitionEventRecord]);
  }
}

class SharedRevisionReadStore extends MemoryWorkflowStore {
  readonly #reviewedGraphs: PortableCognitiveObjectRecord[] = [];
  #reviewedReadCount = 0;

  override async getObjectVersion(
    objectId: string,
    version: number,
  ): Promise<PortableCognitiveObjectRecord | undefined> {
    const record = await super.getObjectVersion(objectId, version);
    if (record === undefined || version !== 2) return record;
    const pass = Math.floor(this.#reviewedReadCount++ / 2);
    const shared = this.#reviewedGraphs[pass];
    if (shared !== undefined) return shared;
    this.#reviewedGraphs.push(record);
    return record;
  }
}

class ReceiptLeakingConflictStore extends MemoryWorkflowStore {
  readonly #leakedReceipts = new Set<string>();

  override async commitWorkflow(
    request: PreparedDurableCognitionCommit,
  ): Promise<DurableCognitionCommitResult> {
    if (this.#leakedReceipts.has(request.workflowId)) {
      return { status: "already_committed" };
    }
    const result = await super.commitWorkflow(request);
    if (result.status === "conflict") {
      this.#leakedReceipts.add(request.workflowId);
    }
    return result;
  }
}

class ReceiptLeakingRollbackStore extends MemoryWorkflowStore {
  readonly #leakedReceipts = new Set<string>();

  override async commitWorkflow(
    request: PreparedDurableCognitionCommit,
  ): Promise<DurableCognitionCommitResult> {
    if (this.#leakedReceipts.has(request.workflowId)) {
      return { status: "already_committed" };
    }
    try {
      return await super.commitWorkflow(request);
    } catch (error) {
      this.#leakedReceipts.add(request.workflowId);
      throw error;
    }
  }
}

function conformanceFactory(
  calls: Array<DurableWorkflowStoreConformanceScenario | undefined> = [],
  createStore: () => MemoryWorkflowStore = () => new MemoryWorkflowStore(),
): DurableWorkflowStoreFactory {
  return (scenario) => {
    calls.push(scenario);
    const store = createStore();
    if (scenario !== undefined) {
      store.configureConformanceStore(scenario.kind, scenario.workflow);
    }
    return store;
  };
}

test("the in-memory workflow store passes every durable conformance case", async () => {
  const calls: Array<DurableWorkflowStoreConformanceScenario | undefined> = [];
  const report = await runDurableWorkflowStoreConformance(conformanceFactory(calls));

  assert.deepEqual(
    report.cases.map(({ id, status }) => ({ id, status })),
    [
      { id: "atomic-commit", status: "passed" },
      { id: "exact-replay", status: "passed" },
      { id: "workflow-id-collision", status: "passed" },
      { id: "object-collision", status: "passed" },
      { id: "event-collision", status: "passed" },
      { id: "version-conflict", status: "passed" },
      { id: "incomplete-workflow", status: "passed" },
      { id: "rollback", status: "passed" },
      { id: "detached-reads", status: "passed" },
      { id: "factory-isolation", status: "passed" },
    ],
  );
  assert.equal(report.passed, true);
  assert.deepEqual(calls.map((scenario) => scenario?.kind), [
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    "version-conflict",
    undefined,
    "rollback",
    undefined,
    undefined,
  ]);
  assert.equal(calls[5]?.workflow.workflowId, "workflow:conformance:version");
  assert.equal(calls[7]?.workflow.workflowId, "workflow:conformance:rollback");
});

test("reports every conformance case when a factory cannot provide isolated stores", async () => {
  const singleton = new MemoryWorkflowStore();
  const report = await runDurableWorkflowStoreConformance(() => singleton);

  assert.equal(report.passed, false);
  assert.equal(report.cases.length, 10);
  assert.equal(
    report.cases.find(({ id }) => id === "factory-isolation")?.status,
    "failed",
  );
});

test("requires explicit fixtures for stored-version conflicts and post-write rollback", async () => {
  const noFixtureFactory: DurableWorkflowStoreFactory = () => new MemoryWorkflowStore();

  const report = await runDurableWorkflowStoreConformance(noFixtureFactory);

  assert.equal(report.passed, false);
  assert.equal(report.cases.find(({ id }) => id === "version-conflict")?.status, "failed");
  assert.equal(report.cases.find(({ id }) => id === "rollback")?.status, "failed");
});

test("requires detached record and array identities across repeated reads", async () => {
  const report = await runDurableWorkflowStoreConformance(
    conformanceFactory([], () => new AliasedReadStore()),
  );

  assert.equal(report.passed, false);
  assert.equal(
    report.cases.find(({ id }) => id === "detached-reads")?.status,
    "failed",
  );
});

test("requires recursive detachment when only nested payload data aliases prepared input", async () => {
  const report = await runDurableWorkflowStoreConformance(
    conformanceFactory([], () => new NestedAliasedReadStore()),
  );

  assert.equal(report.passed, false);
  assert.equal(
    report.cases.find(({ id }) => id === "detached-reads")?.status,
    "failed",
  );
});

test("requires graph-wide detachment across equal-valued caller paths", async () => {
  const report = await runDurableWorkflowStoreConformance(
    conformanceFactory([], () => new CrossWiredReadStore()),
  );

  assert.equal(report.passed, false);
  assert.equal(
    report.cases.find(({ id }) => id === "detached-reads")?.status,
    "failed",
  );
});

test("requires every separately returned graph to be identity-disjoint", async () => {
  const report = await runDurableWorkflowStoreConformance(
    conformanceFactory([], () => new SharedRevisionReadStore()),
  );

  assert.equal(report.passed, false);
  assert.equal(
    report.cases.find(({ id }) => id === "detached-reads")?.status,
    "failed",
  );
});

test("rejects stores that insert a receipt while reporting a conflict", async () => {
  const report = await runDurableWorkflowStoreConformance(
    conformanceFactory([], () => new ReceiptLeakingConflictStore()),
  );

  assert.equal(report.passed, false);
  assert.equal(
    report.cases.find(({ id }) => id === "workflow-id-collision")?.status,
    "failed",
  );
});

test("rejects stores that retain a receipt after rollback failure", async () => {
  const report = await runDurableWorkflowStoreConformance(
    conformanceFactory([], () => new ReceiptLeakingRollbackStore()),
  );

  assert.equal(report.passed, false);
  assert.equal(
    report.cases.find(({ id }) => id === "rollback")?.status,
    "failed",
  );
});

function temporarySqliteWorkflowPath(): string {
  const directory = mkdtempSync(
    join(tmpdir(), "collective-cognition-workflow-conformance-"),
  );
  sqliteTemporaryDirectories.add(directory);
  return join(directory, "cognition.db");
}

function installOneShotWorkflowInsertFailure(): () => void {
  const statementPrototype = StatementSync.prototype as unknown as {
    readonly sourceSQL: string;
    run: (...parameters: unknown[]) => StatementResultingChanges;
  };
  const originalRun = statementPrototype.run;
  let active = true;
  const restore = () => {
    if (active) {
      active = false;
      statementPrototype.run = originalRun;
    }
  };
  statementPrototype.run = function (
    ...parameters: unknown[]
  ): StatementResultingChanges {
    const result = Reflect.apply(originalRun, this, parameters);
    if (/^\s*INSERT INTO cognition_objects/i.test(this.sourceSQL)) {
      restore();
      throw new Error("Forced post-insert workflow failure.");
    }
    return result;
  };
  return restore;
}

function insertVersionConflictFixture(
  databasePath: string,
  workflow: PreparedDurableCognitionCommit,
): void {
  const latest = createPortableCognitionRecord({
    ...structuredClone(workflow.reviewedHypothesis),
    payload: {
      ...structuredClone(workflow.reviewedHypothesis.payload),
      version: 3,
    },
  }) as PortableCognitiveObjectRecord;
  const database = new DatabaseSync(databasePath);
  try {
    database.prepare(`
      INSERT INTO cognition_objects (
        object_id,
        object_version,
        object_type,
        record_json
      ) VALUES (?, ?, ?, ?)
    `).run(
      latest.payload.id,
      latest.payload.version,
      latest.payload.type,
      serializePortableCognitionRecord(latest),
    );
  } finally {
    database.close();
  }
}

sqliteTest("the SQLite workflow store passes every durable conformance case", async () => {
  const stores: SqliteCognitionWorkflowStore[] = [];
  const restoreHooks: Array<() => void> = [];
  const factory: DurableWorkflowStoreFactory = (scenario) => {
    const databasePath = temporarySqliteWorkflowPath();
    let store = new SqliteCognitionWorkflowStore({
      databasePath,
      createIfMissing: true,
    });
    if (scenario?.kind === "version-conflict") {
      store.close();
      insertVersionConflictFixture(databasePath, scenario.workflow);
      store = new SqliteCognitionWorkflowStore({ databasePath });
    } else if (scenario?.kind === "rollback") {
      restoreHooks.push(installOneShotWorkflowInsertFailure());
    }
    stores.push(store);
    return store;
  };

  try {
    const report = await runDurableWorkflowStoreConformance(factory);
    assert.deepEqual(
      report.cases.map(({ id, status }) => ({ id, status })),
      [
        { id: "atomic-commit", status: "passed" },
        { id: "exact-replay", status: "passed" },
        { id: "workflow-id-collision", status: "passed" },
        { id: "object-collision", status: "passed" },
        { id: "event-collision", status: "passed" },
        { id: "version-conflict", status: "passed" },
        { id: "incomplete-workflow", status: "passed" },
        { id: "rollback", status: "passed" },
        { id: "detached-reads", status: "passed" },
        { id: "factory-isolation", status: "passed" },
      ],
    );
    assert.equal(report.passed, true);
  } finally {
    for (const restore of restoreHooks) restore();
    for (const store of stores) store.close();
  }
});
