import {
  deserializePortableCognitionRecord,
  serializePortableCognitionRecord,
} from "./portable-cognition.ts";
import {
  prepareInitialCognitionCommit,
  prepareTransitionCognitionCommit,
} from "./host-integration.ts";
import type { PortableCognitionRecord } from "./portable-cognition.ts";
import type { JsonValue } from "./types.ts";
import type {
  CognitionEventPublisher,
  CognitionPublicationStatus,
  CognitionStore,
  CognitionStoreCommitResult,
  InitialCognitionCommit,
  PortableCognitionEventRecord,
  PortableCognitiveObjectRecord,
  TransitionCognitionCommit,
} from "./host-integration.ts";

function snapshotRecord<RecordType extends PortableCognitionRecord["recordType"]>(
  record: PortableCognitionRecord,
  recordType: RecordType,
): Extract<PortableCognitionRecord, { readonly recordType: RecordType }> {
  const snapshot = deserializePortableCognitionRecord(
    serializePortableCognitionRecord(record),
  );
  if (snapshot.recordType !== recordType) {
    throw new TypeError(`Expected ${recordType} Portable Cognition record.`);
  }
  return snapshot as Extract<
    PortableCognitionRecord,
    { readonly recordType: RecordType }
  >;
}

function snapshotObject(
  object: PortableCognitiveObjectRecord,
): PortableCognitiveObjectRecord {
  return snapshotRecord(object, "cognitive-object");
}

function snapshotEvent(
  event: PortableCognitionEventRecord,
): PortableCognitionEventRecord {
  return snapshotRecord(event, "cognition-event");
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
  left: PortableCognitionRecord,
  right: PortableCognitionRecord,
): boolean {
  return canonicalizeJson(left as unknown as JsonValue) ===
    canonicalizeJson(right as unknown as JsonValue);
}

function objectVersionKey(objectId: string, version: number): string {
  return `${objectId}\u0000${version}`;
}

function snapshotIdempotencyKey(options: {
  readonly idempotencyKey: string;
}): string {
  const descriptor = Object.getOwnPropertyDescriptor(options, "idempotencyKey");
  if (
    descriptor === undefined ||
    !("value" in descriptor) ||
    typeof descriptor.value !== "string"
  ) {
    throw new TypeError("Idempotency key must be a data string property.");
  }
  return descriptor.value;
}

export class InMemoryCognitionStore implements CognitionStore {
  readonly #latestVersions = new Map<string, number>();
  readonly #objects = new Map<string, PortableCognitiveObjectRecord>();
  readonly #events = new Map<string, PortableCognitionEventRecord>();

  async commitInitial(
    request: InitialCognitionCommit,
  ): Promise<CognitionStoreCommitResult> {
    const { object } = prepareInitialCognitionCommit(request);
    const objectId = object.payload.id;
    const version = object.payload.version;
    const key = objectVersionKey(objectId, version);
    const existing = this.#objects.get(key);

    if (existing !== undefined) {
      if (recordsMatch(existing, object)) {
        return { status: "already_committed" };
      }
      return {
        status: "conflict",
        conflict: {
          code: "object_revision_collision",
          objectId,
          expectedVersion: version,
          actualVersion: version,
        },
      };
    }

    this.#objects.set(key, object);
    this.#latestVersions.set(objectId, version);
    return { status: "committed" };
  }

  async commitTransition(
    request: TransitionCognitionCommit,
  ): Promise<CognitionStoreCommitResult> {
    const { expectedVersion, object, event } =
      prepareTransitionCognitionCommit(request);
    const objectId = object.payload.id;
    const version = object.payload.version;
    const existingObject = this.#objects.get(objectVersionKey(objectId, version));
    const existingEvent = this.#events.get(event.payload.id);

    if (existingObject !== undefined && !recordsMatch(existingObject, object)) {
      return {
        status: "conflict",
        conflict: {
          code: "object_revision_collision",
          objectId,
          expectedVersion: version,
          actualVersion: version,
        },
      };
    }
    if (existingEvent !== undefined && !recordsMatch(existingEvent, event)) {
      return {
        status: "conflict",
        conflict: { code: "event_id_collision", objectId },
      };
    }
    if (existingObject !== undefined && existingEvent !== undefined) {
      return { status: "already_committed" };
    }

    const actualVersion = this.#latestVersions.get(objectId);
    if (actualVersion !== expectedVersion) {
      return {
        status: "conflict",
        conflict: {
          code: "version_conflict",
          objectId,
          expectedVersion,
          ...(actualVersion === undefined ? {} : { actualVersion }),
        },
      };
    }

    this.#objects.set(objectVersionKey(objectId, version), object);
    this.#events.set(event.payload.id, event);
    this.#latestVersions.set(objectId, version);
    return { status: "committed" };
  }

  async getLatestObject(
    objectId: string,
  ): Promise<PortableCognitiveObjectRecord | undefined> {
    const version = this.#latestVersions.get(objectId);
    return version === undefined
      ? undefined
      : this.getObjectVersion(objectId, version);
  }

  async getObjectVersion(
    objectId: string,
    version: number,
  ): Promise<PortableCognitiveObjectRecord | undefined> {
    const object = this.#objects.get(objectVersionKey(objectId, version));
    return object === undefined ? undefined : snapshotObject(object);
  }

  async listObjectEvents(
    objectId: string,
  ): Promise<readonly PortableCognitionEventRecord[]> {
    const events = Array.from(this.#events.values())
      .filter((event) => event.payload.objectId === objectId)
      .sort((left, right) => {
        const versionOrder = left.payload.objectVersion -
          right.payload.objectVersion;
        if (versionOrder !== 0) {
          return versionOrder;
        }
        return left.payload.id < right.payload.id
          ? -1
          : left.payload.id > right.payload.id
          ? 1
          : 0;
      })
      .map(snapshotEvent);
    return Object.freeze(events);
  }
}

export class InMemoryCognitionEventPublisher
  implements CognitionEventPublisher {
  readonly #publications = new Map<string, PortableCognitionEventRecord>();

  async publish(
    event: PortableCognitionEventRecord,
    options: { readonly idempotencyKey: string },
  ): Promise<CognitionPublicationStatus> {
    const idempotencyKey = snapshotIdempotencyKey(options);
    const snapshot = snapshotEvent(event);
    const existing = this.#publications.get(idempotencyKey);

    if (existing !== undefined) {
      if (recordsMatch(existing, snapshot)) {
        return "already_published";
      }
      throw new TypeError("Idempotency key was previously used for another event.");
    }

    this.#publications.set(idempotencyKey, snapshot);
    return "published";
  }

  publishedEvents(): readonly PortableCognitionEventRecord[] {
    return Object.freeze(Array.from(this.#publications.values(), snapshotEvent));
  }
}
