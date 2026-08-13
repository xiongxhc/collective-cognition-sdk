import { createHash } from "node:crypto";

import { DomainError, DomainErrorCode } from "../errors.ts";
import { ingestSourceRecords } from "../ingestion.ts";
import { createPortableCognitionRecord } from "../portable-cognition.ts";
import { promoteSourceRecordsToEvidence } from "../promotion.ts";
import { canonicalizeJson } from "../source-records.ts";
import { transitionObject } from "../transitions.ts";
import { isUnicodeScalarString } from "../types.ts";
import type { TransitionContext } from "../authorization.ts";
import type {
  PortableCognitionEventRecord,
  PortableCognitiveObjectRecord,
} from "../host-integration.ts";
import type { IngestionOptions } from "../ingestion.ts";
import type { EvidencePromotionPolicy } from "../promotion.ts";
import type { JsonObject, JsonValue } from "../types.ts";
import {
  DURABLE_COGNITION_WORKFLOW_VERSION,
  durableWorkflowIngestionOptionFields,
  durableWorkflowPolicyFields,
  durableWorkflowRequestFields,
} from "./durable-contract.ts";
import type {
  DurableCognitionWorkflowRequest,
  PreparedDurableCognitionCommit,
} from "./durable-contract.ts";

const maximumSnapshotDepth = 256;

class UnsafeWorkflowStructure extends Error {}

function invalidRequest(): never {
  throw new DomainError(
    DomainErrorCode.INVALID_DURABLE_WORKFLOW_REQUEST,
    "Durable workflow request is invalid.",
  );
}

function durableWorkflowFailed(): never {
  throw new DomainError(
    DomainErrorCode.DURABLE_WORKFLOW_FAILED,
    "Durable workflow preparation failed.",
  );
}

function isPlainObject(value: unknown): value is object {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function captureClosedObject(
  value: unknown,
  fields: ReadonlySet<string>,
  required: boolean,
): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new UnsafeWorkflowStructure();
  }
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string")) {
    throw new UnsafeWorkflowStructure();
  }
  const captured: Record<string, unknown> = {};
  const descriptors = new Map<string, PropertyDescriptor>();
  for (const key of keys) {
    if (typeof key !== "string") {
      throw new UnsafeWorkflowStructure();
    }
    if (!fields.has(key)) {
      throw new UnsafeWorkflowStructure();
    }
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) {
      throw new UnsafeWorkflowStructure();
    }
    Object.defineProperty(captured, key, {
      value: descriptor.value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
    descriptors.set(key, descriptor);
  }
  for (const [key, descriptor] of descriptors) {
    const current = Reflect.getOwnPropertyDescriptor(value, key);
    if (
      current === undefined ||
      current.enumerable !== descriptor.enumerable ||
      !("value" in current) ||
      !Object.is(current.value, descriptor.value)
    ) {
      throw new UnsafeWorkflowStructure();
    }
  }
  if (required && (keys.length !== fields.size || [...fields].some((key) => !(key in captured)))) {
    throw new UnsafeWorkflowStructure();
  }
  return captured;
}

function snapshotJson(
  value: unknown,
  ancestors = new Set<object>(),
  depth = 0,
): JsonValue {
  if (depth > maximumSnapshotDepth) {
    throw new UnsafeWorkflowStructure();
  }
  if (
    value === null ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    (typeof value === "string" && isUnicodeScalarString(value))
  ) {
    return value;
  }
  if (typeof value !== "object" || ancestors.has(value)) {
    throw new UnsafeWorkflowStructure();
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        throw new UnsafeWorkflowStructure();
      }
      const length = Reflect.getOwnPropertyDescriptor(value, "length");
      const keys = Reflect.ownKeys(value);
      if (
        length === undefined ||
        length.enumerable ||
        !("value" in length) ||
        !Number.isSafeInteger(length.value) ||
        length.value < 0 ||
        keys.length !== length.value + 1 ||
        !keys.includes("length")
      ) {
        throw new UnsafeWorkflowStructure();
      }
      const captured: JsonValue[] = [];
      for (let index = 0; index < length.value; index += 1) {
        const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
        if (
          descriptor === undefined ||
          !descriptor.enumerable ||
          !("value" in descriptor)
        ) {
          throw new UnsafeWorkflowStructure();
        }
        captured.push(snapshotJson(descriptor.value, ancestors, depth + 1));
        const current = Reflect.getOwnPropertyDescriptor(value, String(index));
        if (
          current === undefined ||
          current.enumerable !== descriptor.enumerable ||
          !("value" in current) ||
          !Object.is(current.value, descriptor.value)
        ) {
          throw new UnsafeWorkflowStructure();
        }
      }
      return captured;
    }
    if (!isPlainObject(value)) {
      throw new UnsafeWorkflowStructure();
    }
      const captured: Record<string, JsonValue> = {};
      for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string" || !isUnicodeScalarString(key)) {
        throw new UnsafeWorkflowStructure();
      }
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) {
        throw new UnsafeWorkflowStructure();
      }
        Object.defineProperty(captured, key, {
        value: snapshotJson(descriptor.value, ancestors, depth + 1),
        enumerable: true,
        configurable: true,
          writable: true,
        });
        const current = Reflect.getOwnPropertyDescriptor(value, key);
        if (
          current === undefined ||
          current.enumerable !== descriptor.enumerable ||
          !("value" in current) ||
          !Object.is(current.value, descriptor.value)
        ) {
          throw new UnsafeWorkflowStructure();
        }
    }
    return captured;
  } finally {
    ancestors.delete(value);
  }
}

function snapshotOptions(options: IngestionOptions | undefined): IngestionOptions {
  if (options === undefined) {
    return { mode: "fail-fast" };
  }
  const captured = captureClosedObject(
    options,
    durableWorkflowIngestionOptionFields,
    false,
  );
  return {
    mode: "fail-fast",
    ...(captured.maxRecords === undefined ? {} : { maxRecords: captured.maxRecords as number }),
    ...(captured.maxRecordBytes === undefined
      ? {}
      : { maxRecordBytes: captured.maxRecordBytes as number }),
    ...(captured.existingRecords === undefined
      ? {}
      : {
        existingRecords: snapshotJson(captured.existingRecords) as unknown as readonly [],
      }),
  };
}

function snapshotPolicy(value: unknown): EvidencePromotionPolicy {
  const captured = captureClosedObject(value, durableWorkflowPolicyFields, true);
  if (
    typeof captured.id !== "string" ||
    captured.id.trim().length === 0 ||
    typeof captured.version !== "string" ||
    captured.version.trim().length === 0 ||
    typeof captured.map !== "function"
  ) {
    throw new UnsafeWorkflowStructure();
  }
  return Object.freeze({
    id: captured.id,
    version: captured.version,
    map: captured.map as EvidencePromotionPolicy["map"],
  });
}

function portableObject(value: unknown): PortableCognitiveObjectRecord {
  return createPortableCognitionRecord({
    schemaVersion: "0.1.0",
    recordType: "cognitive-object",
    payload: value,
  } as PortableCognitiveObjectRecord) as PortableCognitiveObjectRecord;
}

function portableEvent(value: unknown): PortableCognitionEventRecord {
  return createPortableCognitionRecord({
    schemaVersion: "0.1.0",
    recordType: "cognition-event",
    payload: value,
  } as PortableCognitionEventRecord) as PortableCognitionEventRecord;
}

function validateCorrelations(
  hypothesis: PortableCognitiveObjectRecord,
  promotion: JsonObject,
  reviewTransition: TransitionContext,
): void {
  if (
    hypothesis.payload.type !== "hypothesis" ||
    hypothesis.payload.version !== 1 ||
    hypothesis.payload.state !== "proposed" ||
    promotion.hypothesisId !== hypothesis.payload.id ||
    promotion.contextId !== hypothesis.payload.contextId ||
    !isPlainObject(promotion.attribution)
  ) {
    invalidRequest();
  }
  const attribution = promotion.attribution as JsonObject;
  if (
    attribution.initiatorId !== reviewTransition.initiator.id ||
    attribution.executorId !== reviewTransition.executor.id ||
    attribution.accountableId !== reviewTransition.accountableParty.id
  ) {
    invalidRequest();
  }
}

export function prepareDurableCognitionWorkflow(
  request: DurableCognitionWorkflowRequest,
  options?: IngestionOptions,
): PreparedDurableCognitionCommit {
  try {
    const captured = captureClosedObject(request, durableWorkflowRequestFields, true);
    if (
      captured.workflowVersion !== DURABLE_COGNITION_WORKFLOW_VERSION ||
      typeof captured.workflowId !== "string" ||
      captured.workflowId.trim().length === 0
    ) {
      invalidRequest();
    }
    const records = snapshotJson(captured.records);
    if (!Array.isArray(records)) {
      invalidRequest();
    }
    const ingestion = ingestSourceRecords(records, snapshotOptions(options));
    if (ingestion.acceptedRecords.length === 0) {
      invalidRequest();
    }
    const initialHypothesis = portableObject(snapshotJson(captured.hypothesis));
    const promotion = snapshotJson(captured.promotion);
    const reviewTransition = snapshotJson(captured.reviewTransition);
    if (
      !isPlainObject(promotion) ||
      !isPlainObject(reviewTransition)
    ) {
      invalidRequest();
    }
    const context = reviewTransition as unknown as TransitionContext;
    validateCorrelations(initialHypothesis, promotion as JsonObject, context);
    const transition = transitionObject(
      initialHypothesis.payload as DurableCognitionWorkflowRequest["hypothesis"],
      "under_review",
      context,
    );
    const policy = snapshotPolicy(captured.policy);
    const evidence = portableObject(promoteSourceRecordsToEvidence({
      records: ingestion.acceptedRecords,
      hypothesisId: (promotion as JsonObject).hypothesisId as string,
      contextId: (promotion as JsonObject).contextId as string,
      rationale: (promotion as JsonObject).rationale as string,
      promotedAt: (promotion as JsonObject).promotedAt as string,
      attribution: (promotion as JsonObject).attribution as never,
    }, policy));
    const reviewedHypothesis = portableObject(transition.object);
    const event = portableEvent(transition.event);
    const requestDigest = createHash("sha256")
      .update(canonicalizeJson({
        workflowVersion: DURABLE_COGNITION_WORKFLOW_VERSION,
        workflowId: captured.workflowId,
        records: ingestion.acceptedRecords as unknown as JsonValue,
        policy: { id: policy.id, version: policy.version },
        promotion,
        reviewTransition,
        outputs: {
          initialHypothesis,
          evidence,
          reviewedHypothesis,
          event,
        },
      } as unknown as JsonValue))
      .digest("hex");
    return Object.freeze({
      workflowId: captured.workflowId,
      requestDigest,
      initialHypothesis,
      evidence,
      expectedHypothesisVersion: 1,
      reviewedHypothesis,
      event,
    });
  } catch (error) {
    if (
      error instanceof DomainError &&
      (error.code === DomainErrorCode.INGESTION_LIMIT_EXCEEDED ||
        error.code === DomainErrorCode.SOURCE_REVISION_COLLISION ||
        error.code === DomainErrorCode.INVALID_DURABLE_WORKFLOW_REQUEST ||
        error.code === DomainErrorCode.DURABLE_WORKFLOW_FAILED)
    ) {
      throw error;
    }
    if (
      error instanceof DomainError &&
      error.code === DomainErrorCode.PROMOTION_FAILED
    ) {
      durableWorkflowFailed();
    }
    invalidRequest();
  }
}
