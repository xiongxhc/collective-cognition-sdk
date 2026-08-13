import { prepareDurableCognitionWorkflow } from "./durable-prepare.ts";
import type {
  DurableCognitionCommitResult,
  DurableCognitionProjectionStatus,
  DurableCognitionPublicationStatus,
  DurableCognitionWorkflowCompletion,
  DurableCognitionWorkflowCommitted,
  DurableCognitionWorkflowConflict,
  DurableCognitionWorkflowFailure,
  DurableCognitionWorkflowHost,
  DurableCognitionWorkflowRequest,
  DurableCognitionWorkflowResult,
  DurableCognitionWorkflowUnprojected,
  DurableCognitionWorkflowUnpublished,
  DurableCognitionWorkflowUnpublishedAndUnprojected,
  DurableWorkflowConflictCode,
  PreparedDurableCognitionCommit,
} from "./durable-contract.ts";
import type { IngestionOptions } from "../ingestion.ts";
import type { MarkdownCognitionRecord } from "../markdown-cognition.ts";

const workflowConflictCodes = new Set<DurableWorkflowConflictCode>([
  "workflow_id_collision",
  "object_revision_collision",
  "event_id_collision",
  "version_conflict",
  "incomplete_workflow",
]);

type DataFields = Record<string, unknown>;

function closedFields(
  value: unknown,
  expected: readonly string[],
): DataFields | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return undefined;
    }
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== expected.length ||
      keys.some((key) => typeof key !== "string" || !expected.includes(key))
    ) {
      return undefined;
    }
    const fields: DataFields = Object.create(null);
    for (const key of expected) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) {
        return undefined;
      }
      fields[key] = descriptor.value;
    }
    return fields;
  } catch {
    return undefined;
  }
}

function commitResult(
  value: unknown,
  workflowId: string,
): DurableCognitionCommitResult | undefined {
  const fields = closedFields(value, ["status"]);
  if (fields !== undefined && (fields.status === "committed" || fields.status === "already_committed")) {
    return Object.freeze({ status: fields.status });
  }
  const conflictResult = closedFields(value, ["status", "conflict"]);
  if (conflictResult === undefined || conflictResult.status !== "conflict") {
    return undefined;
  }
  const conflict = closedFields(conflictResult.conflict, ["code", "workflowId"]);
  if (
    conflict === undefined ||
    typeof conflict.code !== "string" ||
    !workflowConflictCodes.has(conflict.code as DurableWorkflowConflictCode) ||
    conflict.workflowId !== workflowId
  ) {
    return undefined;
  }
  return Object.freeze({
    status: "conflict",
    conflict: Object.freeze({
      code: conflict.code as DurableWorkflowConflictCode,
      workflowId,
    }),
  });
}

function failure(): DurableCognitionWorkflowFailure {
  return Object.freeze({
    status: "failed",
    error: Object.freeze({
      code: "DURABLE_WORKFLOW_FAILED",
      message: "Durable workflow failed.",
    }),
  });
}

function completion(
  prepared: PreparedDurableCognitionCommit,
  persistence: "committed" | "already_committed",
  publication: DurableCognitionPublicationStatus,
  projection: DurableCognitionProjectionStatus,
  records: readonly MarkdownCognitionRecord[],
): DurableCognitionWorkflowCompletion {
  const base = {
    persistence,
    workflowId: prepared.workflowId,
    requestDigest: prepared.requestDigest,
    records,
  };
  if (publication === "failed" && projection === "failed") {
    const result: DurableCognitionWorkflowUnpublishedAndUnprojected = {
      ...base,
      status: "committed_but_unpublished_and_unprojected",
      publication,
      projection,
    };
    return Object.freeze(result);
  }
  if (publication === "failed") {
    const result: DurableCognitionWorkflowUnpublished = {
      ...base,
      status: "committed_but_unpublished",
      publication,
      projection: projection as Exclude<
        DurableCognitionProjectionStatus,
        "failed"
      >,
    };
    return Object.freeze(result);
  }
  if (projection === "failed") {
    const result: DurableCognitionWorkflowUnprojected = {
      ...base,
      status: "committed_but_unprojected",
      publication,
      projection,
    };
    return Object.freeze(result);
  }
  const result: DurableCognitionWorkflowCommitted = {
    ...base,
    status: "committed",
    publication,
    projection,
  };
  return Object.freeze(result);
}

async function publicationStatus(
  host: DurableCognitionWorkflowHost,
  prepared: PreparedDurableCognitionCommit,
): Promise<DurableCognitionPublicationStatus> {
  try {
    if (host.publisher === undefined) {
      return "not_requested";
    }
    const result = await host.publisher.publish(prepared.event, {
      idempotencyKey: prepared.event.payload.id,
    });
    return result === "published" || result === "already_published"
      ? result
      : "failed";
  } catch {
    return "failed";
  }
}

async function projectionStatus(
  host: DurableCognitionWorkflowHost,
  records: readonly MarkdownCognitionRecord[],
): Promise<DurableCognitionProjectionStatus> {
  try {
    if (host.projector === undefined) {
      return "not_requested";
    }
    const result = await host.projector.project(records);
    return result === "projected" || result === "unchanged" ? result : "failed";
  } catch {
    return "failed";
  }
}

export async function runDurableCognitionWorkflow(
  host: DurableCognitionWorkflowHost,
  request: DurableCognitionWorkflowRequest,
  options?: IngestionOptions,
): Promise<DurableCognitionWorkflowResult> {
  let prepared: PreparedDurableCognitionCommit;
  try {
    prepared = prepareDurableCognitionWorkflow(request, options);
  } catch {
    return failure();
  }

  let persisted: DurableCognitionCommitResult | undefined;
  try {
    persisted = commitResult(
      await host.store.commitWorkflow(prepared),
      prepared.workflowId,
    );
  } catch {
    return failure();
  }
  if (persisted === undefined) {
    return failure();
  }
  if (persisted.status === "conflict") {
    const result: DurableCognitionWorkflowConflict = Object.freeze({
      status: "conflict",
      conflict: persisted.conflict,
    });
    return result;
  }

  const records = Object.freeze([
    prepared.initialHypothesis,
    prepared.evidence,
    prepared.reviewedHypothesis,
    prepared.event,
  ]) as readonly MarkdownCognitionRecord[];
  const publication = await publicationStatus(host, prepared);
  const projection = await projectionStatus(host, records);
  return completion(prepared, persisted.status, publication, projection, records);
}
