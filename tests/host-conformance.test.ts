import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

const hostContractUrl = new URL("../spec/host-integration.md", import.meta.url);
const hostRfcUrl = new URL(
  "../rfcs/0004-host-integration-contract.md",
  import.meta.url,
);
const specificationIndexUrl = new URL("../spec/README.md", import.meta.url);
const rfcIndexUrl = new URL("../rfcs/README.md", import.meta.url);

const expectedRuleIds = Array.from(
  { length: 16 },
  (_, index) => `HIC-${String(index + 1).padStart(3, "0")}`,
);

function markdownSection(text: string, heading: string): string {
  const start = text.indexOf(heading);
  assert.notEqual(start, -1, `Missing ${heading} section.`);
  const end = text.indexOf("\n## ", start + heading.length);
  return text.slice(start, end === -1 ? undefined : end);
}

function extractRuleIds(hostContractText: string): string[] {
  return Array.from(
    markdownSection(hostContractText, "## Normative Rules")
      .matchAll(/^\|\s*`(HIC-\d{3})`\s*\|/gm),
    ([, ruleId]) => ruleId,
  );
}

function extractMappedRuleIds(hostContractText: string): string[] {
  return Array.from(
    markdownSection(hostContractText, "## Rule-to-Check Mapping")
      .matchAll(/^\|\s*`(HIC-\d{3})`\s*\|/gm),
    ([, ruleId]) => ruleId,
  );
}

test("pins the Host Integration Contract rule inventory and links", () => {
  const hostContractText = readFileSync(hostContractUrl, "utf8");
  const hostRfcText = readFileSync(hostRfcUrl, "utf8");
  const specificationIndexText = readFileSync(specificationIndexUrl, "utf8");
  const rfcIndexText = readFileSync(rfcIndexUrl, "utf8");

  assert.deepEqual(extractRuleIds(hostContractText), expectedRuleIds);
  assert.deepEqual(extractMappedRuleIds(hostContractText), expectedRuleIds);
  assert.match(hostContractText, /Contract version: `0\.1\.0`/);
  assert.match(hostContractText, /committed_but_unpublished/);
  assert.match(hostContractText, /SourceRecord MUST NOT/);
  assert.match(
    hostRfcText,
    /\]\(\.\.\/spec\/host-integration\.md\)/,
  );
  assert.match(specificationIndexText, /\]\(host-integration\.md\)/);
  assert.match(
    specificationIndexText,
    /\]\(\.\.\/rfcs\/0004-host-integration-contract\.md\)/,
  );
  assert.match(
    rfcIndexText,
    /\]\(0004-host-integration-contract\.md\)/,
  );
});

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

class ObjectOnlyTransitionStore implements CognitionStore {
  readonly #store = new InMemoryCognitionStore();

  commitInitial(request: InitialCognitionCommit) {
    return this.#store.commitInitial(request);
  }

  commitTransition(request: TransitionCognitionCommit) {
    return this.#store.commitTransition(request);
  }

  getLatestObject(objectId: string) {
    return this.#store.getLatestObject(objectId);
  }

  getObjectVersion(objectId: string, version: number) {
    return this.#store.getObjectVersion(objectId, version);
  }

  async listObjectEvents(): Promise<readonly PortableCognitionEventRecord[]> {
    return Object.freeze([]);
  }
}

class AliasVersionReadStore implements CognitionStore {
  readonly #store = new InMemoryCognitionStore();
  readonly #objects = new Map<string, PortableCognitiveObjectRecord>();

  commitInitial(request: InitialCognitionCommit) {
    return this.#store.commitInitial(request);
  }

  commitTransition(request: TransitionCognitionCommit) {
    return this.#store.commitTransition(request);
  }

  getLatestObject(objectId: string) {
    return this.#store.getLatestObject(objectId);
  }

  async getObjectVersion(
    objectId: string,
    version: number,
  ): Promise<PortableCognitiveObjectRecord | undefined> {
    const key = `${objectId}:${version}`;
    const existing = this.#objects.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const object = await this.#store.getObjectVersion(objectId, version);
    if (object === undefined) {
      return undefined;
    }
    const alias = structuredClone(object) as PortableCognitiveObjectRecord;
    this.#objects.set(key, alias);
    return alias;
  }

  listObjectEvents(objectId: string) {
    return this.#store.listObjectEvents(objectId);
  }
}

class AliasLatestReadStore implements CognitionStore {
  readonly #store = new InMemoryCognitionStore();
  readonly #objects = new Map<string, PortableCognitiveObjectRecord>();

  commitInitial(request: InitialCognitionCommit) {
    return this.#store.commitInitial(request);
  }

  commitTransition(request: TransitionCognitionCommit) {
    return this.#store.commitTransition(request);
  }

  async getLatestObject(
    objectId: string,
  ): Promise<PortableCognitiveObjectRecord | undefined> {
    const existing = this.#objects.get(objectId);
    if (existing !== undefined) {
      return existing;
    }
    const object = await this.#store.getLatestObject(objectId);
    if (object === undefined) {
      return undefined;
    }
    const alias = structuredClone(object) as PortableCognitiveObjectRecord;
    this.#objects.set(objectId, alias);
    return alias;
  }

  getObjectVersion(objectId: string, version: number) {
    return this.#store.getObjectVersion(objectId, version);
  }

  listObjectEvents(objectId: string) {
    return this.#store.listObjectEvents(objectId);
  }
}

class AliasEventReadStore implements CognitionStore {
  readonly #store = new InMemoryCognitionStore();
  readonly #events = new Map<string, PortableCognitionEventRecord[]>();

  commitInitial(request: InitialCognitionCommit) {
    return this.#store.commitInitial(request);
  }

  commitTransition(request: TransitionCognitionCommit) {
    return this.#store.commitTransition(request);
  }

  getLatestObject(objectId: string) {
    return this.#store.getLatestObject(objectId);
  }

  getObjectVersion(objectId: string, version: number) {
    return this.#store.getObjectVersion(objectId, version);
  }

  async listObjectEvents(
    objectId: string,
  ): Promise<readonly PortableCognitionEventRecord[]> {
    const existing = this.#events.get(objectId);
    if (existing !== undefined) {
      return existing;
    }
    const events = structuredClone(
      await this.#store.listObjectEvents(objectId),
    ) as PortableCognitionEventRecord[];
    this.#events.set(objectId, events);
    return events;
  }
}

class CallerAliasingInitialStore implements CognitionStore {
  readonly #store = new InMemoryCognitionStore();
  readonly #initials = new Map<string, PortableCognitiveObjectRecord>();

  async commitInitial(request: InitialCognitionCommit) {
    const result = await this.#store.commitInitial(request);
    if (result.status === "committed") {
      this.#initials.set(request.object.payload.id, request.object);
    }
    return result;
  }

  commitTransition(request: TransitionCognitionCommit) {
    return this.#store.commitTransition(request);
  }

  async getLatestObject(objectId: string) {
    const latest = await this.#store.getLatestObject(objectId);
    return latest?.payload.version === 1
      ? this.#initials.get(objectId)
      : latest;
  }

  getObjectVersion(objectId: string, version: number) {
    return version === 1
      ? Promise.resolve(this.#initials.get(objectId))
      : this.#store.getObjectVersion(objectId, version);
  }

  listObjectEvents(objectId: string) {
    return this.#store.listObjectEvents(objectId);
  }
}

class VersionOneAliasReadStore implements CognitionStore {
  readonly #store = new InMemoryCognitionStore();
  readonly #latest = new Map<string, PortableCognitiveObjectRecord>();
  readonly #versions = new Map<string, PortableCognitiveObjectRecord>();

  commitInitial(request: InitialCognitionCommit) {
    return this.#store.commitInitial(request);
  }

  commitTransition(request: TransitionCognitionCommit) {
    return this.#store.commitTransition(request);
  }

  async getLatestObject(
    objectId: string,
  ): Promise<PortableCognitiveObjectRecord | undefined> {
    const object = await this.#store.getLatestObject(objectId);
    if (object?.payload.version !== 1) {
      return object;
    }
    const existing = this.#latest.get(objectId);
    if (existing !== undefined) {
      return existing;
    }
    const alias = structuredClone(object) as PortableCognitiveObjectRecord;
    this.#latest.set(objectId, alias);
    return alias;
  }

  async getObjectVersion(
    objectId: string,
    version: number,
  ): Promise<PortableCognitiveObjectRecord | undefined> {
    const object = await this.#store.getObjectVersion(objectId, version);
    if (object === undefined || version !== 1) {
      return object;
    }
    const key = `${objectId}:${version}`;
    const existing = this.#versions.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const alias = structuredClone(object) as PortableCognitiveObjectRecord;
    this.#versions.set(key, alias);
    return alias;
  }

  listObjectEvents(objectId: string) {
    return this.#store.listObjectEvents(objectId);
  }
}

function shallowFreezeRecord<T>(record: T): T {
  if (typeof record !== "object" || record === null) {
    return record;
  }
  const value = structuredClone(record) as { payload?: unknown };
  return Object.freeze({
    ...value,
    ...(value.payload === undefined ? {} : { payload: Object.freeze({ ...value.payload }) }),
  }) as T;
}

class ShallowFrozenReadStore implements CognitionStore {
  readonly #store = new InMemoryCognitionStore();

  commitInitial(request: InitialCognitionCommit) {
    return this.#store.commitInitial(request);
  }

  commitTransition(request: TransitionCognitionCommit) {
    return this.#store.commitTransition(request);
  }

  async getLatestObject(objectId: string) {
    const object = await this.#store.getLatestObject(objectId);
    return object === undefined ? undefined : shallowFreezeRecord(object);
  }

  async getObjectVersion(objectId: string, version: number) {
    const object = await this.#store.getObjectVersion(objectId, version);
    return object === undefined ? undefined : shallowFreezeRecord(object);
  }

  async listObjectEvents(objectId: string) {
    const events = await this.#store.listObjectEvents(objectId);
    return Object.freeze(events.map(shallowFreezeRecord));
  }
}

function reorderAndFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(reorderAndFreeze)) as T;
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  const reordered: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort().reverse()) {
    reordered[key] = reorderAndFreeze((value as Record<string, unknown>)[key]);
  }
  return Object.freeze(reordered) as T;
}

class ReorderedReadStore implements CognitionStore {
  readonly #store = new InMemoryCognitionStore();

  commitInitial(request: InitialCognitionCommit) {
    return this.#store.commitInitial(request);
  }

  commitTransition(request: TransitionCognitionCommit) {
    return this.#store.commitTransition(request);
  }

  async getLatestObject(objectId: string) {
    const object = await this.#store.getLatestObject(objectId);
    return object === undefined ? undefined : reorderAndFreeze(object);
  }

  async getObjectVersion(objectId: string, version: number) {
    const object = await this.#store.getObjectVersion(objectId, version);
    return object === undefined ? undefined : reorderAndFreeze(object);
  }

  async listObjectEvents(objectId: string) {
    const events = await this.#store.listObjectEvents(objectId);
    return Object.freeze(events.map(reorderAndFreeze));
  }
}

class InsertionOrderReplayStore implements CognitionStore {
  readonly #store = new InMemoryCognitionStore();
  readonly #objects = new Map<string, string>();
  readonly #events = new Map<string, string>();

  async commitInitial(request: InitialCognitionCommit) {
    const objectId = request.object.payload.id;
    const version = request.object.payload.version;
    const key = `${objectId}\u0000${version}`;
    const serialized = JSON.stringify(request.object);
    const existing = this.#objects.get(key);
    if (existing !== undefined && existing !== serialized) {
      return {
        status: "conflict" as const,
        conflict: {
          code: "object_revision_collision" as const,
          objectId,
        },
      };
    }
    const result = await this.#store.commitInitial(request);
    if (result.status === "committed") {
      this.#objects.set(key, serialized);
    }
    return result;
  }

  async commitTransition(request: TransitionCognitionCommit) {
    const objectId = request.object.payload.id;
    const version = request.object.payload.version;
    const objectKey = `${objectId}\u0000${version}`;
    const object = JSON.stringify(request.object);
    const event = JSON.stringify(request.event);
    const existingObject = this.#objects.get(objectKey);
    const existingEvent = this.#events.get(request.event.payload.id);
    if (existingObject !== undefined && existingObject !== object) {
      return {
        status: "conflict" as const,
        conflict: {
          code: "object_revision_collision" as const,
          objectId,
        },
      };
    }
    if (existingEvent !== undefined && existingEvent !== event) {
      return {
        status: "conflict" as const,
        conflict: {
          code: "event_id_collision" as const,
          objectId,
          eventId: request.event.payload.id,
        },
      };
    }
    const result = await this.#store.commitTransition(request);
    if (result.status === "committed") {
      this.#objects.set(objectKey, object);
      this.#events.set(request.event.payload.id, event);
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

class OverwriteAfterCollisionStore implements CognitionStore {
  readonly #store = new InMemoryCognitionStore();
  readonly #overwritten = new Map<string, PortableCognitiveObjectRecord>();

  async commitInitial(request: InitialCognitionCommit) {
    const result = await this.#store.commitInitial(request);
    if (
      result.status === "conflict" &&
      result.conflict.code === "object_revision_collision"
    ) {
      this.#overwritten.set(request.object.payload.id, request.object);
    }
    return result;
  }

  commitTransition(request: TransitionCognitionCommit) {
    return this.#store.commitTransition(request);
  }

  async getLatestObject(objectId: string) {
    return this.#overwritten.get(objectId) ??
      await this.#store.getLatestObject(objectId);
  }

  async getObjectVersion(objectId: string, version: number) {
    return version === 1 && this.#overwritten.has(objectId)
      ? this.#overwritten.get(objectId)
      : this.#store.getObjectVersion(objectId, version);
  }

  listObjectEvents(objectId: string) {
    return this.#store.listObjectEvents(objectId);
  }
}

class ExtraEventAfterStaleConflictStore implements CognitionStore {
  readonly #store = new InMemoryCognitionStore();
  readonly #extraEvents = new Map<string, PortableCognitionEventRecord[]>();

  commitInitial(request: InitialCognitionCommit) {
    return this.#store.commitInitial(request);
  }

  async commitTransition(request: TransitionCognitionCommit) {
    const result = await this.#store.commitTransition(request);
    if (
      result.status === "conflict" &&
      result.conflict.code === "version_conflict"
    ) {
      const events = this.#extraEvents.get(request.object.payload.id) ?? [];
      events.push(request.event);
      this.#extraEvents.set(request.object.payload.id, events);
    }
    return result;
  }

  getLatestObject(objectId: string) {
    return this.#store.getLatestObject(objectId);
  }

  getObjectVersion(objectId: string, version: number) {
    return this.#store.getObjectVersion(objectId, version);
  }

  async listObjectEvents(objectId: string) {
    return Object.freeze([
      ...await this.#store.listObjectEvents(objectId),
      ...(this.#extraEvents.get(objectId) ?? []),
    ]);
  }
}

class MalformedAcceptingStore implements CognitionStore {
  readonly #store = new InMemoryCognitionStore();

  async commitInitial(request: InitialCognitionCommit) {
    try {
      return await this.#store.commitInitial(request);
    } catch {
      return { status: "committed" as const };
    }
  }

  async commitTransition(request: TransitionCognitionCommit) {
    try {
      return await this.#store.commitTransition(request);
    } catch {
      return { status: "committed" as const };
    }
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

class StaleFirstStore implements CognitionStore {
  readonly #store = new InMemoryCognitionStore();

  commitInitial(request: InitialCognitionCommit) {
    return this.#store.commitInitial(request);
  }

  async commitTransition(request: TransitionCognitionCommit) {
    const latest = await this.#store.getLatestObject(request.object.payload.id);
    if (
      latest !== undefined &&
      latest.payload.version !== request.expectedVersion
    ) {
      return {
        status: "conflict" as const,
        conflict: {
          code: "version_conflict" as const,
          objectId: request.object.payload.id,
          expectedVersion: request.expectedVersion,
          actualVersion: latest.payload.version,
        },
      };
    }
    return this.#store.commitTransition(request);
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

class EventFirstConflictStore implements CognitionStore {
  readonly #store = new InMemoryCognitionStore();
  readonly #events = new Map<string, string>();

  commitInitial(request: InitialCognitionCommit) {
    return this.#store.commitInitial(request);
  }

  async commitTransition(request: TransitionCognitionCommit) {
    const eventId = request.event.payload.id;
    const event = JSON.stringify(request.event);
    const existingEvent = this.#events.get(eventId);
    if (existingEvent !== undefined && existingEvent !== event) {
      return {
        status: "conflict" as const,
        conflict: {
          code: "event_id_collision" as const,
          objectId: request.object.payload.id,
          eventId,
        },
      };
    }
    const result = await this.#store.commitTransition(request);
    if (result.status === "committed") {
      this.#events.set(eventId, event);
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
  assert.equal(report.cases.length, 17);
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

test("requires object and event read-back after successful and partial transitions", async () => {
  const report = await runCognitionHostConformance({
    createStore: () => new ObjectOnlyTransitionStore(),
    createPublisher: () => new InMemoryCognitionEventPublisher(),
  });

  assert.equal(
    report.cases.find(({ id }) => id === "HIC-CONF-007")?.status,
    "failed",
  );
  assert.equal(
    report.cases.find(({ id }) => id === "HIC-CONF-010")?.status,
    "failed",
  );
  assert.equal(
    report.cases.find(({ id }) => id === "HIC-CONF-011")?.status,
    "passed",
  );
});

test("rejects aliased latest, version, event, and caller reads without aborting", async () => {
  const factories: readonly [string, () => CognitionStore][] = [
    ["latest", () => new AliasLatestReadStore()],
    ["version", () => new AliasVersionReadStore()],
    ["event", () => new AliasEventReadStore()],
    ["caller", () => new CallerAliasingInitialStore()],
    ["version-one", () => new VersionOneAliasReadStore()],
    ["shallow", () => new ShallowFrozenReadStore()],
  ];
  for (const [description, createStore] of factories) {
    const report = await runCognitionHostConformance({
      createStore,
      createPublisher: () => new InMemoryCognitionEventPublisher(),
    });

    assert.equal(
      report.cases.find(({ id }) => id === "HIC-CONF-006")?.status,
      "failed",
      description,
    );
    assert.equal(
      report.cases.find(({ id }) => id === "HIC-CONF-011")?.status,
      "passed",
      description,
    );
  }
});

test("accepts semantically identical records with reordered object keys", async () => {
  const report = await runCognitionHostConformance({
    createStore: () => new ReorderedReadStore(),
    createPublisher: () => new InMemoryCognitionEventPublisher(),
  });

  assert.equal(report.passed, true);
});

test("requires canonical replay equality from host stores", async () => {
  const canonical = await runCognitionHostConformance({
    createStore: () => new InMemoryCognitionStore(),
    createPublisher: () => new InMemoryCognitionEventPublisher(),
  });
  const insertionOrderSensitive = await runCognitionHostConformance({
    createStore: () => new InsertionOrderReplayStore(),
    createPublisher: () => new InMemoryCognitionEventPublisher(),
  });

  assert.equal(
    canonical.cases.find(({ id }) => id === "HIC-CONF-012")?.status,
    "passed",
  );
  assert.equal(
    insertionOrderSensitive.cases.find(({ id }) => id === "HIC-CONF-012")?.status,
    "failed",
  );
  assert.equal(
    insertionOrderSensitive.cases.find(({ id }) => id === "HIC-CONF-011")?.status,
    "passed",
  );
});

test("rejects stores that mutate state after returned conflicts", async () => {
  const overwritten = await runCognitionHostConformance({
    createStore: () => new OverwriteAfterCollisionStore(),
    createPublisher: () => new InMemoryCognitionEventPublisher(),
  });
  const extraEvent = await runCognitionHostConformance({
    createStore: () => new ExtraEventAfterStaleConflictStore(),
    createPublisher: () => new InMemoryCognitionEventPublisher(),
  });

  assert.equal(
    overwritten.cases.find(({ id }) => id === "HIC-CONF-003")?.status,
    "failed",
  );
  assert.equal(
    extraEvent.cases.find(({ id }) => id === "HIC-CONF-004")?.status,
    "failed",
  );
});

test("rejects stores that accept malformed or SourceRecord-shaped runtime input", async () => {
  const report = await runCognitionHostConformance({
    createStore: () => new MalformedAcceptingStore(),
    createPublisher: () => new InMemoryCognitionEventPublisher(),
  });

  assert.equal(
    report.cases.find(({ id }) => id === "HIC-CONF-014")?.status,
    "failed",
  );
});

test("rejects stale-first and event-first conflict precedence", async () => {
  const reference = await runCognitionHostConformance({
    createStore: () => new InMemoryCognitionStore(),
    createPublisher: () => new InMemoryCognitionEventPublisher(),
  });
  const staleFirst = await runCognitionHostConformance({
    createStore: () => new StaleFirstStore(),
    createPublisher: () => new InMemoryCognitionEventPublisher(),
  });
  const eventFirst = await runCognitionHostConformance({
    createStore: () => new EventFirstConflictStore(),
    createPublisher: () => new InMemoryCognitionEventPublisher(),
  });

  assert.equal(
    reference.cases.find(({ id }) => id === "HIC-CONF-015")?.status,
    "passed",
  );
  assert.equal(
    staleFirst.cases.find(({ id }) => id === "HIC-CONF-015")?.status,
    "failed",
  );
  assert.equal(
    eventFirst.cases.find(({ id }) => id === "HIC-CONF-015")?.status,
    "failed",
  );
});

test("rejects singleton store and publisher factories", async () => {
  const singletonStore = new InMemoryCognitionStore();
  const reusedStore = await runCognitionHostConformance({
    createStore: () => singletonStore,
    createPublisher: () => new InMemoryCognitionEventPublisher(),
  });
  const singletonPublisher = new InMemoryCognitionEventPublisher();
  const reusedPublisher = await runCognitionHostConformance({
    createStore: () => new InMemoryCognitionStore(),
    createPublisher: () => singletonPublisher,
  });

  assert.equal(
    reusedStore.cases.find(({ id }) => id === "HIC-CONF-016")?.status,
    "failed",
  );
  assert.equal(
    reusedPublisher.cases.find(({ id }) => id === "HIC-CONF-017")?.status,
    "failed",
  );
});

test("rejects nonadjacent store and publisher instance reuse across cases", async () => {
  let storeCalls = 0;
  let firstStore: InMemoryCognitionStore | undefined;
  const reusedStore = await runCognitionHostConformance({
    createStore: () => {
      storeCalls += 1;
      if (storeCalls === 1) {
        firstStore = new InMemoryCognitionStore();
        return firstStore;
      }
      if (storeCalls === 3) {
        return firstStore as InMemoryCognitionStore;
      }
      return new InMemoryCognitionStore();
    },
    createPublisher: () => new InMemoryCognitionEventPublisher(),
  });

  let publisherCalls = 0;
  let firstPublisher: InMemoryCognitionEventPublisher | undefined;
  const reusedPublisher = await runCognitionHostConformance({
    createStore: () => new InMemoryCognitionStore(),
    createPublisher: () => {
      publisherCalls += 1;
      if (publisherCalls === 1) {
        firstPublisher = new InMemoryCognitionEventPublisher();
        return firstPublisher;
      }
      if (publisherCalls === 3) {
        return firstPublisher as InMemoryCognitionEventPublisher;
      }
      return new InMemoryCognitionEventPublisher();
    },
  });

  assert.equal(reusedStore.passed, false);
  assert.equal(
    reusedStore.cases.find(({ id }) => id === "HIC-CONF-003")?.status,
    "failed",
  );
  assert.equal(
    reusedStore.cases.find(({ id }) => id === "HIC-CONF-016")?.status,
    "passed",
  );
  assert.equal(reusedPublisher.passed, false);
  assert.equal(
    reusedPublisher.cases.find(({ id }) => id === "HIC-CONF-011")?.status,
    "failed",
  );
  assert.equal(
    reusedPublisher.cases.find(({ id }) => id === "HIC-CONF-017")?.status,
    "passed",
  );
});

test("isolates each case and keeps SourceRecord outside the port types", async () => {
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
  assert.equal(stores, 15);
  assert.equal(publishers, 6);
  assert.deepEqual(
    new Set(recordTypes.filter((recordType) => recordType !== undefined)),
    new Set(["cognitive-object", "cognition-event"]),
  );
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
