import { DatabaseSync } from "node:sqlite";

import {
  prepareInitialCognitionCommit,
  prepareTransitionCognitionCommit,
} from "../host-integration.ts";
import {
  deserializePortableCognitionRecord,
  serializePortableCognitionRecord,
} from "../portable-cognition.ts";
import { canonicalizeJson } from "../source-records.ts";
import type {
  PortableCognitionEventRecord,
  PortableCognitiveObjectRecord,
} from "../host-integration.ts";
import type { JsonValue } from "../types.ts";
import type {
  CognitionWorkflowStore,
  DurableCognitionCommitResult,
  PreparedDurableCognitionCommit,
} from "../workflows/durable.ts";
import {
  runSqliteCognitionStoreImmediateTransaction,
  SqliteCognitionStoreBase,
  sqliteCognitionWorkflowSchemaTarget,
} from "./sqlite-internal.ts";

export interface SqliteCognitionWorkflowStoreOptions {
  readonly databasePath: string;
  readonly createIfMissing?: boolean;
  readonly busyTimeoutMs?: number;
}

interface PreparedSqliteWorkflowCommit {
  readonly workflowId: string;
  readonly requestDigest: string;
  readonly initialHypothesis: PortableCognitiveObjectRecord;
  readonly evidence: PortableCognitiveObjectRecord;
  readonly expectedHypothesisVersion: 1;
  readonly reviewedHypothesis: PortableCognitiveObjectRecord;
  readonly event: PortableCognitionEventRecord;
  readonly initialCanonical: string;
  readonly evidenceCanonical: string;
  readonly reviewedCanonical: string;
  readonly eventCanonical: string;
  readonly initialSerialized: string;
  readonly evidenceSerialized: string;
  readonly reviewedSerialized: string;
  readonly eventSerialized: string;
}

interface StoredObjectRow {
  readonly object_id: unknown;
  readonly object_version: unknown;
  readonly object_type: unknown;
  readonly record_json: unknown;
}

interface StoredEventRow {
  readonly event_id: unknown;
  readonly object_id: unknown;
  readonly object_version: unknown;
  readonly record_json: unknown;
}

interface StoredWorkflowRow {
  readonly workflow_id: unknown;
  readonly request_digest: unknown;
  readonly initial_hypothesis_id: unknown;
  readonly evidence_id: unknown;
  readonly reviewed_hypothesis_version: unknown;
  readonly event_id: unknown;
}

const preparedWorkflowFields = new Set([
  "workflowId",
  "requestDigest",
  "initialHypothesis",
  "evidence",
  "expectedHypothesisVersion",
  "reviewedHypothesis",
  "event",
]);

function invalidWorkflowCommit(): never {
  throw new TypeError("Durable workflow commit is invalid.");
}

function invalidStoredWorkflow(): never {
  throw new TypeError("Stored durable workflow is invalid.");
}

function snapshotPreparedWorkflow(
  request: PreparedDurableCognitionCommit,
): PreparedSqliteWorkflowCommit {
  const fields: Record<string, unknown> = Object.create(null);
  try {
    if (typeof request !== "object" || request === null) {
      return invalidWorkflowCommit();
    }
    const prototype = Object.getPrototypeOf(request);
    if (prototype !== Object.prototype && prototype !== null) {
      return invalidWorkflowCommit();
    }
    const keys = Reflect.ownKeys(request);
    if (
      keys.length !== preparedWorkflowFields.size ||
      keys.some((key) => typeof key !== "string" || !preparedWorkflowFields.has(key))
    ) {
      return invalidWorkflowCommit();
    }
    for (const key of preparedWorkflowFields) {
      const descriptor = Reflect.getOwnPropertyDescriptor(request, key);
      if (
        descriptor === undefined ||
        descriptor.enumerable !== true ||
        !("value" in descriptor)
      ) {
        return invalidWorkflowCommit();
      }
      fields[key] = descriptor.value;
    }
  } catch {
    return invalidWorkflowCommit();
  }

  if (
    typeof fields.workflowId !== "string" ||
    fields.workflowId.trim().length === 0 ||
    typeof fields.requestDigest !== "string" ||
    !/^[0-9a-f]{64}$/.test(fields.requestDigest) ||
    fields.expectedHypothesisVersion !== 1
  ) {
    return invalidWorkflowCommit();
  }

  let initialHypothesis: PortableCognitiveObjectRecord;
  let evidence: PortableCognitiveObjectRecord;
  let reviewedHypothesis: PortableCognitiveObjectRecord;
  let event: PortableCognitionEventRecord;
  try {
    initialHypothesis = prepareInitialCognitionCommit({
      object: fields.initialHypothesis as PortableCognitiveObjectRecord,
    }).object;
    evidence = prepareInitialCognitionCommit({
      object: fields.evidence as PortableCognitiveObjectRecord,
    }).object;
    const transition = prepareTransitionCognitionCommit({
      expectedVersion: 1,
      object: fields.reviewedHypothesis as PortableCognitiveObjectRecord,
      event: fields.event as PortableCognitionEventRecord,
    });
    reviewedHypothesis = transition.object;
    event = transition.event;
  } catch {
    return invalidWorkflowCommit();
  }

  if (
    initialHypothesis.payload.type !== "hypothesis" ||
    initialHypothesis.payload.state !== "proposed" ||
    evidence.payload.type !== "evidence" ||
    reviewedHypothesis.payload.type !== "hypothesis" ||
    reviewedHypothesis.payload.state !== "under_review" ||
    reviewedHypothesis.payload.id !== initialHypothesis.payload.id ||
    event.payload.objectId !== initialHypothesis.payload.id
  ) {
    return invalidWorkflowCommit();
  }
  const {
    version: initialVersion,
    state: initialState,
    updatedAt: initialUpdatedAt,
    attribution: initialAttribution,
    ...initialStableFields
  } = initialHypothesis.payload;
  const {
    version: reviewedVersion,
    state: reviewedState,
    updatedAt: reviewedUpdatedAt,
    attribution: reviewedAttribution,
    ...reviewedStableFields
  } = reviewedHypothesis.payload;
  if (
    initialVersion !== 1 ||
    initialState !== "proposed" ||
    reviewedVersion !== 2 ||
    reviewedState !== "under_review" ||
    canonicalizeJson(initialStableFields as unknown as JsonValue) !==
      canonicalizeJson(reviewedStableFields as unknown as JsonValue) ||
    evidence.payload.contextId !== initialHypothesis.payload.contextId ||
    !evidence.payload.relationships.some((relationship) =>
      relationship.type === "relates-to-hypothesis" &&
      relationship.targetId === initialHypothesis.payload.id
    ) ||
    event.payload.previousState !== initialHypothesis.payload.state ||
    event.payload.contextId !== initialHypothesis.payload.contextId ||
    reviewedAttribution.initiatorId !== event.payload.initiator.id ||
    reviewedAttribution.executorId !== event.payload.executor.id ||
    reviewedAttribution.accountableId !== event.payload.accountableParty.id ||
    evidence.payload.attribution.initiatorId !== event.payload.initiator.id ||
    evidence.payload.attribution.executorId !== event.payload.executor.id ||
    evidence.payload.attribution.accountableId !==
      event.payload.accountableParty.id
  ) {
    return invalidWorkflowCommit();
  }

  return Object.freeze({
    workflowId: fields.workflowId,
    requestDigest: fields.requestDigest,
    initialHypothesis,
    evidence,
    expectedHypothesisVersion: 1,
    reviewedHypothesis,
    event,
    initialCanonical: canonicalizeJson(initialHypothesis as unknown as JsonValue),
    evidenceCanonical: canonicalizeJson(evidence as unknown as JsonValue),
    reviewedCanonical: canonicalizeJson(reviewedHypothesis as unknown as JsonValue),
    eventCanonical: canonicalizeJson(event as unknown as JsonValue),
    initialSerialized: serializePortableCognitionRecord(initialHypothesis),
    evidenceSerialized: serializePortableCognitionRecord(evidence),
    reviewedSerialized: serializePortableCognitionRecord(reviewedHypothesis),
    eventSerialized: serializePortableCognitionRecord(event),
  });
}

function readStoredObject(row: StoredObjectRow): string {
  if (
    typeof row.object_id !== "string" ||
    typeof row.object_version !== "number" ||
    !Number.isSafeInteger(row.object_version) ||
    typeof row.object_type !== "string" ||
    typeof row.record_json !== "string"
  ) {
    return invalidStoredWorkflow();
  }
  const record = deserializePortableCognitionRecord(row.record_json);
  if (
    record.recordType !== "cognitive-object" ||
    record.payload.id !== row.object_id ||
    record.payload.version !== row.object_version ||
    record.payload.type !== row.object_type
  ) {
    return invalidStoredWorkflow();
  }
  return canonicalizeJson(record as unknown as JsonValue);
}

function readStoredEvent(row: StoredEventRow): string {
  if (
    typeof row.event_id !== "string" ||
    typeof row.object_id !== "string" ||
    typeof row.object_version !== "number" ||
    !Number.isSafeInteger(row.object_version) ||
    typeof row.record_json !== "string"
  ) {
    return invalidStoredWorkflow();
  }
  const record = deserializePortableCognitionRecord(row.record_json);
  if (
    record.recordType !== "cognition-event" ||
    record.payload.id !== row.event_id ||
    record.payload.objectId !== row.object_id ||
    record.payload.objectVersion !== row.object_version
  ) {
    return invalidStoredWorkflow();
  }
  return canonicalizeJson(record as unknown as JsonValue);
}

function readStoredReceipt(
  row: StoredWorkflowRow,
  request: PreparedSqliteWorkflowCommit,
): void {
  if (
    row.workflow_id !== request.workflowId ||
    typeof row.request_digest !== "string" ||
    !/^[0-9a-f]{64}$/.test(row.request_digest) ||
    typeof row.initial_hypothesis_id !== "string" ||
    row.initial_hypothesis_id.length === 0 ||
    typeof row.evidence_id !== "string" ||
    row.evidence_id.length === 0 ||
    row.reviewed_hypothesis_version !== 2 ||
    typeof row.event_id !== "string" ||
    row.event_id.length === 0
  ) {
    invalidStoredWorkflow();
  }
}

function readWorkflowRecords(
  database: DatabaseSync,
  request: PreparedSqliteWorkflowCommit,
): {
  readonly objects: readonly (string | undefined)[];
  readonly event: string | undefined;
  readonly occupiedEvent: string | undefined;
  readonly latestHypothesisVersion: number | undefined;
} {
  const objects = [
    request.initialHypothesis,
    request.evidence,
    request.reviewedHypothesis,
  ].map((record) => {
    const row = database.prepare(`
      SELECT object_id, object_version, object_type, record_json
      FROM cognition_objects
      WHERE object_id = ? AND object_version = ?
    `).get(record.payload.id, record.payload.version) as StoredObjectRow | undefined;
    return row === undefined ? undefined : readStoredObject(row);
  });
  const eventRow = database.prepare(`
    SELECT event_id, object_id, object_version, record_json
    FROM cognition_events
    WHERE event_id = ?
  `).get(request.event.payload.id) as StoredEventRow | undefined;
  const occupiedEventRow = database.prepare(`
    SELECT event_id, object_id, object_version, record_json
    FROM cognition_events
    WHERE object_id = ? AND object_version = ?
  `).get(
    request.reviewedHypothesis.payload.id,
    request.reviewedHypothesis.payload.version,
  ) as StoredEventRow | undefined;
  const latestHypothesisRow = database.prepare(`
    SELECT object_id, object_version, object_type, record_json
    FROM cognition_objects
    WHERE object_id = ?
    ORDER BY object_version DESC
    LIMIT 1
  `).get(
    request.initialHypothesis.payload.id,
  ) as StoredObjectRow | undefined;
  let latestHypothesisVersion: number | undefined;
  if (latestHypothesisRow !== undefined) {
    readStoredObject(latestHypothesisRow);
    latestHypothesisVersion = latestHypothesisRow.object_version as number;
  }
  return {
    objects,
    event: eventRow === undefined ? undefined : readStoredEvent(eventRow),
    occupiedEvent: occupiedEventRow === undefined
      ? undefined
      : readStoredEvent(occupiedEventRow),
    latestHypothesisVersion,
  };
}

function conflict(
  request: PreparedSqliteWorkflowCommit,
  code:
    | "workflow_id_collision"
    | "object_revision_collision"
    | "event_id_collision"
    | "version_conflict"
    | "incomplete_workflow",
): DurableCognitionCommitResult {
  return Object.freeze({
    status: "conflict",
    conflict: Object.freeze({
      code,
      workflowId: request.workflowId,
    }),
  });
}

export class SqliteCognitionWorkflowStore
  extends SqliteCognitionStoreBase
  implements CognitionWorkflowStore {
  constructor(options: SqliteCognitionWorkflowStoreOptions) {
    super(options, sqliteCognitionWorkflowSchemaTarget);
  }

  async commitWorkflow(
    request: PreparedDurableCognitionCommit,
  ): Promise<DurableCognitionCommitResult> {
    const prepared = snapshotPreparedWorkflow(request);
    return runSqliteCognitionStoreImmediateTransaction(this, (database) => {
      const receipt = database.prepare(`
        SELECT
          workflow_id,
          request_digest,
          initial_hypothesis_id,
          evidence_id,
          reviewed_hypothesis_version,
          event_id
        FROM cognition_workflows
        WHERE workflow_id = ?
      `).get(prepared.workflowId) as StoredWorkflowRow | undefined;
      const records = readWorkflowRecords(database, prepared);
      if (receipt !== undefined) {
        readStoredReceipt(receipt, prepared);
        if (receipt.request_digest !== prepared.requestDigest) {
          return conflict(prepared, "workflow_id_collision");
        }
        if (
          receipt.initial_hypothesis_id !== prepared.initialHypothesis.payload.id ||
          receipt.evidence_id !== prepared.evidence.payload.id ||
          receipt.event_id !== prepared.event.payload.id ||
          records.objects[0] !== prepared.initialCanonical ||
          records.objects[1] !== prepared.evidenceCanonical ||
          records.objects[2] !== prepared.reviewedCanonical ||
          records.event !== prepared.eventCanonical ||
          records.occupiedEvent !== prepared.eventCanonical
        ) {
          invalidStoredWorkflow();
        }
        return Object.freeze({ status: "already_committed" });
      }

      if (
        records.objects[0] === prepared.initialCanonical &&
        records.objects[1] === prepared.evidenceCanonical &&
        records.objects[2] === prepared.reviewedCanonical &&
        records.event === prepared.eventCanonical &&
        records.occupiedEvent === prepared.eventCanonical
      ) {
        return conflict(prepared, "incomplete_workflow");
      }

      if (
        (records.objects[0] !== undefined &&
          records.objects[0] !== prepared.initialCanonical) ||
        (records.objects[1] !== undefined &&
          records.objects[1] !== prepared.evidenceCanonical) ||
        records.objects[2] !== undefined
      ) {
        return conflict(prepared, "object_revision_collision");
      }

      if (
        (records.event !== undefined &&
          records.event !== prepared.eventCanonical) ||
        (records.occupiedEvent !== undefined &&
          records.occupiedEvent !== prepared.eventCanonical)
      ) {
        return conflict(prepared, "event_id_collision");
      }

      if (
        records.latestHypothesisVersion !== undefined &&
        records.latestHypothesisVersion !== prepared.expectedHypothesisVersion
      ) {
        return conflict(prepared, "version_conflict");
      }

      const objectInsert = database.prepare(`
        INSERT INTO cognition_objects (
          object_id,
          object_version,
          object_type,
          record_json
        ) VALUES (?, ?, ?, ?)
      `);
      objectInsert.run(
        prepared.initialHypothesis.payload.id,
        prepared.initialHypothesis.payload.version,
        prepared.initialHypothesis.payload.type,
        prepared.initialSerialized,
      );
      objectInsert.run(
        prepared.evidence.payload.id,
        prepared.evidence.payload.version,
        prepared.evidence.payload.type,
        prepared.evidenceSerialized,
      );
      objectInsert.run(
        prepared.reviewedHypothesis.payload.id,
        prepared.reviewedHypothesis.payload.version,
        prepared.reviewedHypothesis.payload.type,
        prepared.reviewedSerialized,
      );
      database.prepare(`
        INSERT INTO cognition_events (
          event_id,
          object_id,
          object_version,
          record_json
        ) VALUES (?, ?, ?, ?)
      `).run(
        prepared.event.payload.id,
        prepared.event.payload.objectId,
        prepared.event.payload.objectVersion,
        prepared.eventSerialized,
      );
      database.prepare(`
        INSERT INTO cognition_workflows (
          workflow_id,
          request_digest,
          initial_hypothesis_id,
          evidence_id,
          reviewed_hypothesis_version,
          event_id
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        prepared.workflowId,
        prepared.requestDigest,
        prepared.initialHypothesis.payload.id,
        prepared.evidence.payload.id,
        prepared.reviewedHypothesis.payload.version,
        prepared.event.payload.id,
      );
      return { status: "committed" };
    });
  }
}
