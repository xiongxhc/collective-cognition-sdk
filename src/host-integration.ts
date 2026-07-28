import { DomainError, DomainErrorCode } from "./errors.ts";
import { createPortableCognitionRecord } from "./portable-cognition.ts";
import type { PortableCognitionRecord } from "./portable-cognition.ts";

export const HOST_INTEGRATION_CONTRACT_VERSION = "0.1.0";

export type PortableCognitiveObjectRecord =
  PortableCognitionRecord<"cognitive-object">;

export type PortableCognitionEventRecord =
  PortableCognitionRecord<"cognition-event">;

export type CognitionPersistenceStatus =
  | "committed"
  | "already_committed";

export type CognitionPublicationStatus =
  | "published"
  | "already_published";

export type HostConflictCode =
  | "version_conflict"
  | "object_revision_collision"
  | "event_id_collision";

export type HostConflict =
  | {
      readonly code: "version_conflict";
      readonly objectId: string;
      readonly expectedVersion: number;
      readonly actualVersion: number;
    }
  | {
      readonly code: "object_revision_collision";
      readonly objectId: string;
    }
  | {
      readonly code: "event_id_collision";
      readonly objectId: string;
      readonly eventId: string;
    };

export const HostFailureCode = {
  COMMIT_FAILED: "HOST_COMMIT_FAILED",
  PUBLICATION_FAILED: "HOST_PUBLICATION_FAILED",
} as const;

export type HostFailureCode =
  (typeof HostFailureCode)[keyof typeof HostFailureCode];

export interface HostFailure {
  readonly code: HostFailureCode;
  readonly message: string;
  readonly objectId: string;
  readonly eventId?: string;
}

export interface InitialCognitionCommit {
  readonly object: PortableCognitiveObjectRecord;
}

export interface TransitionCognitionCommit {
  readonly expectedVersion: number;
  readonly object: PortableCognitiveObjectRecord;
  readonly event: PortableCognitionEventRecord;
}

export type CognitionStoreCommitResult =
  | { readonly status: CognitionPersistenceStatus }
  | { readonly status: "conflict"; readonly conflict: HostConflict };

export interface CognitionStore {
  commitInitial(
    request: InitialCognitionCommit,
  ): Promise<CognitionStoreCommitResult>;

  commitTransition(
    request: TransitionCognitionCommit,
  ): Promise<CognitionStoreCommitResult>;

  getLatestObject(
    objectId: string,
  ): Promise<PortableCognitiveObjectRecord | undefined>;

  getObjectVersion(
    objectId: string,
    version: number,
  ): Promise<PortableCognitiveObjectRecord | undefined>;

  listObjectEvents(
    objectId: string,
  ): Promise<readonly PortableCognitionEventRecord[]>;
}

export interface CognitionEventPublisher {
  publish(
    event: PortableCognitionEventRecord,
    options: { readonly idempotencyKey: string },
  ): Promise<CognitionPublicationStatus>;
}

export interface CognitionHost {
  readonly store: CognitionStore;
  readonly publisher: CognitionEventPublisher;
}

export type InitialCommitOutcome =
  | {
      readonly status: "committed";
      readonly persistence: CognitionPersistenceStatus;
      readonly object: PortableCognitiveObjectRecord;
    }
  | { readonly status: "conflict"; readonly conflict: HostConflict }
  | { readonly status: "failed"; readonly error: HostFailure };

export type TransitionCommitOutcome =
  | {
      readonly status: "committed";
      readonly persistence: CognitionPersistenceStatus;
      readonly publication: CognitionPublicationStatus;
      readonly object: PortableCognitiveObjectRecord;
      readonly event: PortableCognitionEventRecord;
    }
  | {
      readonly status: "committed_but_unpublished";
      readonly persistence: CognitionPersistenceStatus;
      readonly object: PortableCognitiveObjectRecord;
      readonly event: PortableCognitionEventRecord;
      readonly error: HostFailure;
    }
  | { readonly status: "conflict"; readonly conflict: HostConflict }
  | { readonly status: "failed"; readonly error: HostFailure };

type DataFields = Record<string, unknown>;

function invalidHostIntegrationRequest(): never {
  throw new DomainError(
    DomainErrorCode.INVALID_HOST_INTEGRATION_REQUEST,
    "Host integration request is invalid.",
  );
}

function readClosedDataFields(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): DataFields | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return undefined;
    }

    const allowed = new Set([...required, ...optional]);
    const fields: DataFields = Object.create(null);
    const keys = Reflect.ownKeys(value);
    if (keys.length < required.length) {
      return undefined;
    }

    for (const key of keys) {
      if (typeof key !== "string" || !allowed.has(key)) {
        return undefined;
      }
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined ||
        !("value" in descriptor) ||
        !descriptor.enumerable
      ) {
        return undefined;
      }
      fields[key] = descriptor.value;
    }

    if (required.some((key) => !Object.hasOwn(fields, key))) {
      return undefined;
    }
    return fields;
  } catch {
    return undefined;
  }
}

function hasExactFields(
  fields: DataFields,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(fields);
  return keys.length === expected.length &&
    expected.every((key) => Object.hasOwn(fields, key));
}

function readHostConflictFields(value: unknown): DataFields | undefined {
  return readClosedDataFields(
    value,
    ["code", "objectId"],
    ["expectedVersion", "actualVersion", "eventId"],
  );
}

function snapshotInitialHostConflict(
  value: unknown,
  objectId: string,
): HostConflict | undefined {
  const fields = readHostConflictFields(value);
  if (
    fields === undefined ||
    !hasExactFields(fields, ["code", "objectId"]) ||
    fields.code !== "object_revision_collision" ||
    fields.objectId !== objectId
  ) {
    return undefined;
  }
  return Object.freeze({
    code: "object_revision_collision",
    objectId,
  });
}

function snapshotTransitionHostConflict(
  value: unknown,
  request: TransitionCognitionCommit,
): HostConflict | undefined {
  const fields = readHostConflictFields(value);
  const objectId = request.object.payload.id;
  if (
    fields === undefined ||
    typeof fields.code !== "string" ||
    fields.objectId !== objectId
  ) {
    return undefined;
  }

  if (fields.code === "object_revision_collision") {
    return hasExactFields(fields, ["code", "objectId"])
      ? Object.freeze({ code: "object_revision_collision", objectId })
      : undefined;
  }

  if (fields.code === "event_id_collision") {
    return hasExactFields(fields, ["code", "objectId", "eventId"]) &&
        fields.eventId === request.event.payload.id
      ? Object.freeze({
        code: "event_id_collision",
        objectId,
        eventId: request.event.payload.id,
      })
      : undefined;
  }

  if (
    fields.code !== "version_conflict" ||
    !hasExactFields(fields, [
      "code",
      "objectId",
      "expectedVersion",
      "actualVersion",
    ]) ||
    fields.expectedVersion !== request.expectedVersion ||
    !Number.isSafeInteger(fields.actualVersion) ||
    (fields.actualVersion as number) <= 0 ||
    fields.actualVersion === request.expectedVersion
  ) {
    return undefined;
  }
  return Object.freeze({
    code: "version_conflict",
    objectId,
    expectedVersion: request.expectedVersion,
    actualVersion: fields.actualVersion as number,
  });
}

function snapshotCommitResult(
  value: unknown,
  snapshotConflict: (value: unknown) => HostConflict | undefined,
): CognitionStoreCommitResult | undefined {
  const fields = readClosedDataFields(
    value,
    ["status"],
    ["conflict"],
  );
  if (fields === undefined || typeof fields.status !== "string") {
    return undefined;
  }

  if (
    (fields.status === "committed" || fields.status === "already_committed") &&
    !Object.hasOwn(fields, "conflict")
  ) {
    return Object.freeze({ status: fields.status });
  }

  if (fields.status !== "conflict" || !Object.hasOwn(fields, "conflict")) {
    return undefined;
  }
  const conflict = snapshotConflict(fields.conflict);
  return conflict === undefined
    ? undefined
    : Object.freeze({ status: "conflict", conflict });
}

function snapshotPublicationStatus(
  value: unknown,
): CognitionPublicationStatus | undefined {
  return value === "published" || value === "already_published"
    ? value
    : undefined;
}

function snapshotInitialObject(
  request: InitialCognitionCommit,
): PortableCognitiveObjectRecord {
  let input: PortableCognitiveObjectRecord;
  try {
    input = request.object;
  } catch {
    invalidHostIntegrationRequest();
  }

  let object: PortableCognitiveObjectRecord;
  try {
    object = createPortableCognitionRecord(input) as PortableCognitiveObjectRecord;
  } catch {
    invalidHostIntegrationRequest();
  }

  if (object.recordType !== "cognitive-object" || object.payload.version !== 1) {
    invalidHostIntegrationRequest();
  }
  return object;
}

export function prepareInitialCognitionCommit(
  request: InitialCognitionCommit,
): InitialCognitionCommit {
  return Object.freeze({ object: snapshotInitialObject(request) });
}

export function prepareTransitionCognitionCommit(
  request: TransitionCognitionCommit,
): TransitionCognitionCommit {
  let expectedVersion: number;
  let objectInput: PortableCognitiveObjectRecord;
  let eventInput: PortableCognitionEventRecord;
  try {
    expectedVersion = request.expectedVersion;
    objectInput = request.object;
    eventInput = request.event;
  } catch {
    invalidHostIntegrationRequest();
  }

  if (
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion <= 0
  ) {
    invalidHostIntegrationRequest();
  }

  let object: PortableCognitiveObjectRecord;
  let event: PortableCognitionEventRecord;
  try {
    object = createPortableCognitionRecord(
      objectInput,
    ) as PortableCognitiveObjectRecord;
    event = createPortableCognitionRecord(
      eventInput,
    ) as PortableCognitionEventRecord;
  } catch {
    invalidHostIntegrationRequest();
  }

  if (
    object.recordType !== "cognitive-object" ||
    event.recordType !== "cognition-event" ||
    object.payload.version !== expectedVersion + 1 ||
    event.payload.objectId !== object.payload.id ||
    event.payload.objectType !== object.payload.type ||
    event.payload.objectVersion !== object.payload.version ||
    event.payload.nextState !== object.payload.state ||
    event.payload.occurredAt !== object.payload.updatedAt
  ) {
    invalidHostIntegrationRequest();
  }

  return Object.freeze({ expectedVersion, object, event });
}

function failedInitialCommit(objectId: string): InitialCommitOutcome {
  return Object.freeze({
    status: "failed",
    error: Object.freeze({
      code: HostFailureCode.COMMIT_FAILED,
      message: "Cognition commit failed.",
      objectId,
    }),
  });
}

function failedTransitionCommit(
  objectId: string,
): TransitionCommitOutcome {
  return Object.freeze({
    status: "failed",
    error: Object.freeze({
      code: HostFailureCode.COMMIT_FAILED,
      message: "Cognition commit failed.",
      objectId,
    }),
  });
}

function unpublishedTransitionCommit(
  persistence: CognitionPersistenceStatus,
  object: PortableCognitiveObjectRecord,
  event: PortableCognitionEventRecord,
): TransitionCommitOutcome {
  return Object.freeze({
    status: "committed_but_unpublished",
    persistence,
    object,
    event,
    error: Object.freeze({
      code: HostFailureCode.PUBLICATION_FAILED,
      message: "Cognition publication failed.",
      objectId: object.payload.id,
      eventId: event.payload.id,
    }),
  });
}

export async function commitInitialCognition(
  store: CognitionStore,
  request: InitialCognitionCommit,
): Promise<InitialCommitOutcome> {
  const hostRequest = prepareInitialCognitionCommit(request);
  const { object } = hostRequest;

  try {
    const result = snapshotCommitResult(
      await store.commitInitial(hostRequest),
      (value) => snapshotInitialHostConflict(value, object.payload.id),
    );
    if (result === undefined) {
      return failedInitialCommit(object.payload.id);
    }
    if (result.status === "conflict") {
      return Object.freeze({ status: "conflict", conflict: result.conflict });
    }
    return Object.freeze({
      status: "committed",
      persistence: result.status,
      object,
    });
  } catch {
    return failedInitialCommit(object.payload.id);
  }
}

export async function commitCognitionTransition(
  host: CognitionHost,
  request: TransitionCognitionCommit,
): Promise<TransitionCommitOutcome> {
  const hostRequest = prepareTransitionCognitionCommit(request);
  const { object, event } = hostRequest;

  let persistence: CognitionPersistenceStatus;
  try {
    const result = snapshotCommitResult(
      await host.store.commitTransition(hostRequest),
      (value) => snapshotTransitionHostConflict(value, hostRequest),
    );
    if (result === undefined) {
      return failedTransitionCommit(object.payload.id);
    }
    if (result.status === "conflict") {
      return Object.freeze({ status: "conflict", conflict: result.conflict });
    }
    persistence = result.status;
  } catch {
    return failedTransitionCommit(object.payload.id);
  }

  const options = Object.freeze({ idempotencyKey: event.payload.id });
  try {
    const publication = snapshotPublicationStatus(
      await host.publisher.publish(event, options),
    );
    if (publication === undefined) {
      return unpublishedTransitionCommit(persistence, object, event);
    }
    return Object.freeze({
      status: "committed",
      persistence,
      publication,
      object,
      event,
    });
  } catch {
    return unpublishedTransitionCommit(persistence, object, event);
  }
}
