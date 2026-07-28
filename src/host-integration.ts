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

export interface HostConflict {
  readonly code: HostConflictCode;
  readonly objectId: string;
  readonly expectedVersion?: number;
  readonly actualVersion?: number;
}

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

export type InitialCommitOutcome =
  | {
      readonly status: "committed";
      readonly persistence: CognitionPersistenceStatus;
      readonly object: PortableCognitiveObjectRecord;
    }
  | { readonly status: "conflict"; readonly conflict: HostConflict }
  | { readonly status: "failed"; readonly error: HostFailure };

type DataFields = Record<string, unknown>;

const hostConflictCodes = new Set<HostConflictCode>([
  "version_conflict",
  "object_revision_collision",
  "event_id_collision",
]);

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

function snapshotHostConflict(value: unknown): HostConflict | undefined {
  const fields = readClosedDataFields(
    value,
    ["code", "objectId"],
    ["expectedVersion", "actualVersion"],
  );
  if (
    fields === undefined ||
    typeof fields.code !== "string" ||
    !hostConflictCodes.has(fields.code as HostConflictCode) ||
    typeof fields.objectId !== "string" ||
    (fields.expectedVersion !== undefined &&
      (typeof fields.expectedVersion !== "number" ||
        !Number.isInteger(fields.expectedVersion) ||
        fields.expectedVersion <= 0)) ||
    (fields.actualVersion !== undefined &&
      (typeof fields.actualVersion !== "number" ||
        !Number.isInteger(fields.actualVersion) ||
        fields.actualVersion <= 0))
  ) {
    return undefined;
  }

  const conflict: {
    code: HostConflictCode;
    objectId: string;
    expectedVersion?: number;
    actualVersion?: number;
  } = {
    code: fields.code as HostConflictCode,
    objectId: fields.objectId,
  };
  if (fields.expectedVersion !== undefined) {
    conflict.expectedVersion = fields.expectedVersion as number;
  }
  if (fields.actualVersion !== undefined) {
    conflict.actualVersion = fields.actualVersion as number;
  }
  return Object.freeze(conflict);
}

function snapshotCommitResult(
  value: unknown,
): CognitionStoreCommitResult | undefined {
  const fields = readClosedDataFields(value, ["status"], ["conflict"]);
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
  const conflict = snapshotHostConflict(fields.conflict);
  return conflict === undefined
    ? undefined
    : Object.freeze({ status: "conflict", conflict });
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

export async function commitInitialCognition(
  store: CognitionStore,
  request: InitialCognitionCommit,
): Promise<InitialCommitOutcome> {
  const object = snapshotInitialObject(request);
  const hostRequest = Object.freeze({ object });

  try {
    const result = snapshotCommitResult(await store.commitInitial(hostRequest));
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
