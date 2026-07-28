import type {
  AuthorizationDecision,
  TransitionContext,
} from "./authorization.ts";
import { DomainError, DomainErrorCode } from "./errors.ts";
import type { CognitionEvent } from "./events.ts";
import {
  JsonTextProfileError,
  parseProfiledJson,
} from "./json-text.ts";
import {
  freezeJsonValue,
  isUnicodeScalarString,
} from "./types.ts";
import type {
  ActorKind,
  CognitiveObject,
  JsonObject,
  JsonValue,
  ObjectType,
  RelationshipType,
} from "./types.ts";

export const PORTABLE_COGNITION_SCHEMA_VERSION = "0.1.0";
export const PORTABLE_COGNITION_MAX_JSON_DEPTH = 256;

export type PortableCognitionRecordType =
  | "cognitive-object"
  | "cognition-event"
  | "transition-context"
  | "authorization-decision"
  | "domain-error";

export interface PortableDomainError {
  readonly code: PortableDomainErrorCode;
  readonly message: string;
  readonly details: JsonObject;
}

export type PortableDomainErrorCode =
  | "INVALID_OBJECT"
  | "INVALID_SOURCE_RECORD"
  | "INVALID_RELATIONSHIP"
  | "INVALID_TRANSITION"
  | "CONFIRMATION_REQUIRED"
  | "AUTHORIZATION_DENIED"
  | "SERIALIZATION_ERROR"
  | "SOURCE_REVISION_COLLISION"
  | "INGESTION_LIMIT_EXCEEDED"
  | "PROMOTION_FAILED"
  | "INVALID_PORTABLE_COGNITION_RECORD";

export type PortableCognitionPayloadByType = {
  readonly "cognitive-object": CognitiveObject;
  readonly "cognition-event": CognitionEvent;
  readonly "transition-context": TransitionContext;
  readonly "authorization-decision": AuthorizationDecision;
  readonly "domain-error": PortableDomainError;
};

export type PortableCognitionRecord<
  T extends PortableCognitionRecordType = PortableCognitionRecordType,
> = {
  [K in T]: {
    readonly schemaVersion: "0.1.0";
    readonly recordType: K;
    readonly payload: PortableCognitionPayloadByType[K];
  };
}[T];

export type CreatePortableCognitionRecordInput =
  PortableCognitionRecord;

type MutableJsonArray = JsonValue[];
type MutableJsonObject = { [key: string]: JsonValue };

type JsonSnapshotTarget =
  | { readonly kind: "root" }
  | {
      readonly kind: "array";
      readonly parent: MutableJsonArray;
      readonly index: number;
    }
  | {
      readonly kind: "object";
      readonly parent: MutableJsonObject;
      readonly key: string;
    };

type JsonSnapshotFrame =
  | {
      readonly kind: "value";
      readonly input: unknown;
      readonly target: JsonSnapshotTarget;
      readonly depth: number;
    }
  | {
      readonly kind: "leave";
      readonly input: object;
    }
  | {
      readonly kind: "array-entry";
      readonly input: object;
      readonly snapshot: MutableJsonArray;
      readonly index: number;
      readonly length: number;
      readonly depth: number;
    }
  | {
      readonly kind: "object-entry";
      readonly input: object;
      readonly snapshot: MutableJsonObject;
      readonly keys: readonly string[];
      readonly index: number;
      readonly depth: number;
    };

class PortableJsonSnapshotError extends Error {
  readonly reason: "depth" | "structure";

  constructor(reason: "depth" | "structure") {
    super();
    this.reason = reason;
  }
}

const actorKinds = new Set<ActorKind>([
  "human",
  "agent",
  "team",
  "organization",
]);
const automationModes = new Set(["manual", "automated"]);
const consequenceLevels = new Set(["routine", "consequential"]);
const objectTypes = new Set<ObjectType>([
  "identity",
  "goal",
  "hypothesis",
  "experiment",
  "evidence",
  "decision",
  "principle",
]);
const recordTypes = new Set<PortableCognitionRecordType>([
  "cognitive-object",
  "cognition-event",
  "transition-context",
  "authorization-decision",
  "domain-error",
]);
const relationshipTypes = new Set<RelationshipType>([
  "parent-goal",
  "supports-goal",
  "tests-hypothesis",
  "supports-hypothesis",
  "challenges-hypothesis",
  "relates-to-hypothesis",
  "observed-in-experiment",
  "informs-decision",
  "considers-option",
  "accountable-identity",
  "justified-by-decision",
  "justified-by-evidence",
]);
const portableDomainErrorCodes: readonly PortableDomainErrorCode[] = Object.freeze([
  "INVALID_OBJECT",
  "INVALID_SOURCE_RECORD",
  "INVALID_RELATIONSHIP",
  "INVALID_TRANSITION",
  "CONFIRMATION_REQUIRED",
  "AUTHORIZATION_DENIED",
  "SERIALIZATION_ERROR",
  "SOURCE_REVISION_COLLISION",
  "INGESTION_LIMIT_EXCEEDED",
  "PROMOTION_FAILED",
  "INVALID_PORTABLE_COGNITION_RECORD",
]);

const validStatesByType: Record<ObjectType, ReadonlySet<string>> = {
  identity: new Set(["active", "inactive"]),
  goal: new Set([
    "draft",
    "active",
    "at_risk",
    "paused",
    "achieved",
    "abandoned",
    "revised",
  ]),
  hypothesis: new Set([
    "proposed",
    "under_review",
    "testing",
    "supported",
    "refuted",
    "inconclusive",
  ]),
  experiment: new Set(["planned", "active", "completed", "cancelled"]),
  evidence: new Set([
    "collected",
    "assessed",
    "accepted",
    "disputed",
    "rejected",
    "expired",
  ]),
  decision: new Set([
    "draft",
    "proposed",
    "approved",
    "rejected",
    "active",
    "superseded",
    "archived",
  ]),
  principle: new Set([
    "proposed",
    "trial",
    "adopted",
    "rejected",
    "revised",
    "retired",
  ]),
};

const transitionsByType: Record<
  ObjectType,
  Readonly<Record<string, readonly string[]>>
> = {
  identity: {
    active: ["inactive"],
    inactive: ["active"],
  },
  goal: {
    draft: ["active"],
    active: [
      "at_risk",
      "paused",
      "achieved",
      "abandoned",
      "revised",
    ],
  },
  hypothesis: {
    proposed: ["under_review"],
    under_review: ["testing"],
    testing: ["supported", "refuted", "inconclusive"],
  },
  experiment: {
    planned: ["active", "cancelled"],
    active: ["completed", "cancelled"],
  },
  evidence: {
    collected: ["assessed"],
    assessed: ["accepted", "disputed", "rejected", "expired"],
  },
  decision: {
    draft: ["proposed"],
    proposed: ["approved", "rejected"],
    approved: ["active"],
    active: ["superseded"],
    superseded: ["archived"],
  },
  principle: {
    proposed: ["trial", "rejected"],
    trial: ["adopted", "rejected"],
    adopted: ["revised", "retired"],
  },
};

const relationshipRequirements: Partial<
  Record<ObjectType, readonly (readonly RelationshipType[])[]>
> = {
  hypothesis: [["supports-goal"]],
  experiment: [["tests-hypothesis"]],
  evidence: [[
    "supports-hypothesis",
    "challenges-hypothesis",
    "relates-to-hypothesis",
    "observed-in-experiment",
  ]],
  decision: [
    ["supports-goal"],
    ["justified-by-evidence", "informs-decision"],
    ["considers-option"],
    ["accountable-identity"],
  ],
  principle: [["justified-by-decision", "justified-by-evidence"]],
};

const isoTimestampPattern =
  /^(?:(?:[0-9]{2}(?:0[48]|[2468][048]|[13579][26])|(?:[02468][048]|[13579][26])00)-02-29|[0-9]{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12][0-9]|3[01])|(?:0[469]|11)-(?:0[1-9]|[12][0-9]|30)|02-(?:0[1-9]|1[0-9]|2[0-8])))T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\.[0-9]{1,9})?(?:Z|[+-](?:[01][0-9]|2[0-3]):[0-5][0-9])$/;
const namespacedExtensionKeyPattern = /^.+[:.].+$/;

function invalidPortableCognitionRecord(
  message: string,
  details: JsonObject = {},
): never {
  throw new DomainError(
    DomainErrorCode.INVALID_PORTABLE_COGNITION_RECORD,
    message,
    details,
  );
}

function isNonWhitespaceString(value: unknown): value is string {
  return typeof value === "string" && /\S/u.test(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && isoTimestampPattern.test(value);
}

function timestampInstant(value: string): bigint {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const hour = Number(value.slice(11, 13));
  const minute = Number(value.slice(14, 16));
  const second = Number(value.slice(17, 19));
  const zoneStart = value.endsWith("Z") ? value.length - 1 : value.length - 6;
  const fraction = value[19] === "."
    ? value.slice(20, zoneStart).padEnd(9, "0")
    : "000000000";
  let offsetMinutes = 0;
  if (value[zoneStart] !== "Z") {
    const direction = value[zoneStart] === "+" ? 1 : -1;
    offsetMinutes = direction * (
      Number(value.slice(zoneStart + 1, zoneStart + 3)) * 60 +
      Number(value.slice(zoneStart + 4, zoneStart + 6))
    );
  }

  const local = new Date(0);
  local.setUTCFullYear(year, month - 1, day);
  local.setUTCHours(hour, minute, second, 0);
  const instantMilliseconds = local.getTime() - offsetMinutes * 60_000;
  return BigInt(instantMilliseconds) * 1_000_000n + BigInt(fraction);
}

function timestampIsAfter(left: string, right: string): boolean {
  return timestampInstant(left) > timestampInstant(right);
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireObject(
  value: unknown,
  message: string,
): asserts value is JsonObject {
  if (!isObject(value)) {
    invalidPortableCognitionRecord(message);
  }
}

function requireExactFields(
  value: JsonObject,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  const keys = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  if (
    required.some((field) => !keys.includes(field)) ||
    keys.some((field) => !allowed.has(field))
  ) {
    invalidPortableCognitionRecord(
      "Portable Cognition record fields are invalid.",
    );
  }
}

function requireNonWhitespaceFields(
  value: JsonObject,
  fields: readonly string[],
): void {
  for (const field of fields) {
    if (!isNonWhitespaceString(value[field])) {
      invalidPortableCognitionRecord(
        `Portable Cognition field ${field} must be a non-whitespace string.`,
        { field },
      );
    }
  }
}

function snapshotPortableJson(value: unknown): JsonValue {
  const unset = Symbol("unset");
  let snapshot: JsonValue | typeof unset = unset;
  const ancestors = new Set<object>();
  const frames: JsonSnapshotFrame[] = [
    { kind: "value", input: value, target: { kind: "root" }, depth: 1 },
  ];

  function assign(target: JsonSnapshotTarget, captured: JsonValue): void {
    if (target.kind === "root") {
      snapshot = captured;
      return;
    }
    Object.defineProperty(
      target.parent,
      target.kind === "array" ? String(target.index) : target.key,
      {
        value: captured,
        enumerable: true,
        configurable: true,
        writable: true,
      },
    );
  }

  try {
    while (frames.length > 0) {
      const frame = frames.pop();
      if (frame === undefined) {
        break;
      }
      if (frame.kind === "leave") {
        ancestors.delete(frame.input);
        continue;
      }
      if (frame.kind === "array-entry") {
        if (frame.index >= frame.length) {
          continue;
        }
        const descriptor = Reflect.getOwnPropertyDescriptor(
          frame.input,
          String(frame.index),
        );
        if (
          descriptor === undefined ||
          !descriptor.enumerable ||
          !("value" in descriptor)
        ) {
          throw new PortableJsonSnapshotError("structure");
        }
        frames.push({ ...frame, index: frame.index + 1 });
        frames.push({
          kind: "value",
          input: descriptor.value,
          target: {
            kind: "array",
            parent: frame.snapshot,
            index: frame.index,
          },
          depth: frame.depth + 1,
        });
        continue;
      }
      if (frame.kind === "object-entry") {
        if (frame.index >= frame.keys.length) {
          continue;
        }
        const key = frame.keys[frame.index] as string;
        const descriptor = Reflect.getOwnPropertyDescriptor(
          frame.input,
          key,
        );
        if (
          descriptor === undefined ||
          !descriptor.enumerable ||
          !("value" in descriptor)
        ) {
          throw new PortableJsonSnapshotError("structure");
        }
        frames.push({ ...frame, index: frame.index + 1 });
        frames.push({
          kind: "value",
          input: descriptor.value,
          target: {
            kind: "object",
            parent: frame.snapshot,
            key,
          },
          depth: frame.depth + 1,
        });
        continue;
      }

      const current = frame.input;
      if (current === null) {
        assign(frame.target, null);
      } else if (typeof current === "boolean") {
        assign(frame.target, current);
      } else if (typeof current === "number") {
        if (!Number.isFinite(current)) {
          throw new PortableJsonSnapshotError("structure");
        }
        assign(frame.target, current);
      } else if (typeof current === "string") {
        if (!isUnicodeScalarString(current)) {
          throw new PortableJsonSnapshotError("structure");
        }
        assign(frame.target, current);
      } else if (typeof current === "object") {
        if (frame.depth > PORTABLE_COGNITION_MAX_JSON_DEPTH) {
          throw new PortableJsonSnapshotError("depth");
        }
        if (ancestors.has(current)) {
          throw new PortableJsonSnapshotError("structure");
        }
        const prototype = Object.getPrototypeOf(current);
        const keys = Reflect.ownKeys(current);
        if (keys.some((key) => typeof key !== "string")) {
          throw new PortableJsonSnapshotError("structure");
        }
        const names = keys as readonly string[];

        if (Array.isArray(current)) {
          if (prototype !== Array.prototype) {
            throw new PortableJsonSnapshotError("structure");
          }
          const lengthDescriptor = Reflect.getOwnPropertyDescriptor(
            current,
            "length",
          );
          if (
            lengthDescriptor === undefined ||
            lengthDescriptor.enumerable ||
            !("value" in lengthDescriptor) ||
            !Number.isSafeInteger(lengthDescriptor.value) ||
            lengthDescriptor.value < 0
          ) {
            throw new PortableJsonSnapshotError("structure");
          }
          const length = lengthDescriptor.value;
          if (
            names.length !== length + 1 ||
            !names.includes("length")
          ) {
            throw new PortableJsonSnapshotError("structure");
          }
          const nameSet = new Set(names);
          for (let index = 0; index < length; index += 1) {
            if (!nameSet.has(String(index))) {
              throw new PortableJsonSnapshotError("structure");
            }
          }
          const captured: MutableJsonArray = [];
          Object.defineProperty(captured, "length", {
            value: length,
            writable: true,
          });
          Object.defineProperty(captured, "toJSON", {
            value: undefined,
            configurable: true,
          });
          assign(frame.target, captured);
          ancestors.add(current);
          frames.push({ kind: "leave", input: current });
          frames.push({
            kind: "array-entry",
            input: current,
            snapshot: captured,
            index: 0,
            length,
            depth: frame.depth,
          });
        } else {
          if (prototype !== Object.prototype && prototype !== null) {
            throw new PortableJsonSnapshotError("structure");
          }
          if (names.some((name) => !isUnicodeScalarString(name))) {
            throw new PortableJsonSnapshotError("structure");
          }
          const captured = Object.create(null) as MutableJsonObject;
          assign(frame.target, captured);
          ancestors.add(current);
          frames.push({ kind: "leave", input: current });
          frames.push({
            kind: "object-entry",
            input: current,
            snapshot: captured,
            keys: names,
            index: 0,
            depth: frame.depth,
          });
        }
      } else {
        throw new PortableJsonSnapshotError("structure");
      }
    }

    if (snapshot === unset) {
      throw new PortableJsonSnapshotError("structure");
    }
    return snapshot;
  } catch (error) {
    if (
      error instanceof PortableJsonSnapshotError &&
      error.reason === "depth"
    ) {
      invalidPortableCognitionRecord(
        "Portable Cognition record exceeds the maximum JSON nesting depth.",
        { maximumDepth: PORTABLE_COGNITION_MAX_JSON_DEPTH },
      );
    }
    invalidPortableCognitionRecord(
      "Portable Cognition record could not be snapshotted safely.",
    );
  }
}

function restorePortableJsonPrototypes(value: JsonValue): void {
  const pending: JsonValue[] = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (typeof current !== "object" || current === null) {
      continue;
    }
    if (Array.isArray(current)) {
      Reflect.deleteProperty(current, "toJSON");
    } else {
      Object.setPrototypeOf(current, Object.prototype);
    }
    for (const key of Object.keys(current)) {
      const descriptor = Reflect.getOwnPropertyDescriptor(current, key);
      if (descriptor !== undefined && "value" in descriptor) {
        pending.push(descriptor.value);
      }
    }
  }
}

function validateActor(value: unknown, humanOnly = false): void {
  requireObject(value, "Portable Cognition actor must be an object.");
  requireExactFields(value, ["id", "kind"]);
  requireNonWhitespaceFields(value, ["id"]);
  if (
    typeof value.kind !== "string" ||
    !actorKinds.has(value.kind as ActorKind) ||
    (humanOnly && value.kind !== "human")
  ) {
    invalidPortableCognitionRecord("Portable Cognition actor kind is invalid.");
  }
}

function validateAttribution(value: unknown): void {
  requireObject(value, "Portable Cognition attribution must be an object.");
  requireExactFields(value, [
    "initiatorId",
    "executorId",
    "accountableId",
  ]);
  requireNonWhitespaceFields(value, [
    "initiatorId",
    "executorId",
    "accountableId",
  ]);
}

function validateProvenance(value: unknown): void {
  if (!Array.isArray(value) || value.length === 0) {
    invalidPortableCognitionRecord(
      "Portable Cognition provenance must contain at least one entry.",
    );
  }
  for (const reference of value) {
    requireObject(
      reference,
      "Portable Cognition provenance entry must be an object.",
    );
    requireExactFields(
      reference,
      ["source", "sourceId", "capturedAt"],
      ["uri", "contentHash"],
    );
    requireNonWhitespaceFields(reference, ["source", "sourceId"]);
    if (!isTimestamp(reference.capturedAt)) {
      invalidPortableCognitionRecord(
        "Portable Cognition provenance timestamp is invalid.",
      );
    }
    for (const field of ["uri", "contentHash"]) {
      if (
        reference[field] !== undefined &&
        !isNonWhitespaceString(reference[field])
      ) {
        invalidPortableCognitionRecord(
          `Portable Cognition provenance field ${field} is invalid.`,
        );
      }
    }
  }
}

function validateRelationships(type: ObjectType, value: unknown): void {
  if (!Array.isArray(value)) {
    invalidPortableCognitionRecord(
      "Portable Cognition relationships must be an array.",
    );
  }

  const seen = new Set<string>();
  const presentTypes = new Set<RelationshipType>();
  for (const relationship of value) {
    requireObject(
      relationship,
      "Portable Cognition relationship must be an object.",
    );
    requireExactFields(relationship, ["type", "targetId"]);
    if (
      typeof relationship.type !== "string" ||
      !relationshipTypes.has(relationship.type as RelationshipType)
    ) {
      invalidPortableCognitionRecord(
        "Portable Cognition relationship type is invalid.",
      );
    }
    if (!isNonWhitespaceString(relationship.targetId)) {
      invalidPortableCognitionRecord(
        "Portable Cognition relationship target is invalid.",
      );
    }

    const relationshipType = relationship.type as RelationshipType;
    const key = `${relationshipType}:${relationship.targetId}`;
    if (seen.has(key)) {
      invalidPortableCognitionRecord(
        "Portable Cognition relationships must be unique.",
      );
    }
    seen.add(key);
    presentTypes.add(relationshipType);
  }

  for (const requirement of relationshipRequirements[type] ?? []) {
    if (!requirement.some((relationshipType) => presentTypes.has(relationshipType))) {
      invalidPortableCognitionRecord(
        `Portable Cognition ${type} relationships are incomplete.`,
      );
    }
  }
}

function validateStringArray(value: unknown): void {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string")
  ) {
    invalidPortableCognitionRecord(
      "Portable Cognition standard data field is invalid.",
    );
  }
}

function validateOptionalStringFields(
  value: JsonObject,
  fields: readonly string[],
): void {
  for (const field of fields) {
    if (value[field] !== undefined && typeof value[field] !== "string") {
      invalidPortableCognitionRecord(
        `Portable Cognition standard data field ${field} is invalid.`,
      );
    }
  }
}

function validateObjectData(type: ObjectType, value: unknown): void {
  requireObject(value, "Portable Cognition object data must be an object.");
  if (type === "identity") {
    if (
      value.actorKind !== undefined &&
      (typeof value.actorKind !== "string" ||
        !actorKinds.has(value.actorKind as ActorKind))
    ) {
      invalidPortableCognitionRecord(
        "Portable Cognition identity actorKind is invalid.",
      );
    }
    validateOptionalStringFields(value, ["displayName"]);
  } else if (type === "goal") {
    validateOptionalStringFields(value, ["objective", "description"]);
    if (value.successCriteria !== undefined) {
      validateStringArray(value.successCriteria);
    }
  } else if (type === "hypothesis") {
    validateOptionalStringFields(value, ["statement", "claim", "scope"]);
  } else if (type === "experiment") {
    validateOptionalStringFields(value, ["action", "expectedOutcome"]);
    if (value.successCriteria !== undefined) {
      validateStringArray(value.successCriteria);
    }
  } else if (type === "evidence") {
    validateOptionalStringFields(value, [
      "statement",
      "evidenceKind",
      "sourceActorId",
      "project",
    ]);
    if (
      value.polarity !== undefined &&
      value.polarity !== "supports" &&
      value.polarity !== "challenges" &&
      value.polarity !== "neutral"
    ) {
      invalidPortableCognitionRecord(
        "Portable Cognition evidence polarity is invalid.",
      );
    }
  } else if (type === "decision") {
    validateOptionalStringFields(value, ["rationale", "selectedOption"]);
    if (value.rejectedOptions !== undefined) {
      validateStringArray(value.rejectedOptions);
    }
  } else {
    validateOptionalStringFields(value, ["rule", "rationale"]);
  }
}

function validateExtensions(value: unknown): void {
  requireObject(value, "Portable Cognition extensions must be an object.");
  for (const key of Object.keys(value)) {
    if (!namespacedExtensionKeyPattern.test(key)) {
      invalidPortableCognitionRecord(
        "Portable Cognition extension keys must be namespaced.",
      );
    }
  }
}

function validateCognitiveObject(value: unknown): void {
  requireObject(value, "Portable Cognition object payload must be an object.");
  requireExactFields(
    value,
    [
      "id",
      "type",
      "version",
      "state",
      "title",
      "data",
      "createdAt",
      "updatedAt",
      "attribution",
      "provenance",
      "contextId",
      "relationships",
    ],
    ["extensions"],
  );
  requireNonWhitespaceFields(value, ["id", "title", "contextId"]);
  if (
    typeof value.type !== "string" ||
    !objectTypes.has(value.type as ObjectType)
  ) {
    invalidPortableCognitionRecord(
      "Portable Cognition object type is invalid.",
    );
  }
  const type = value.type as ObjectType;
  if (
    typeof value.version !== "number" ||
    !Number.isInteger(value.version) ||
    value.version < 1
  ) {
    invalidPortableCognitionRecord(
      "Portable Cognition object version is invalid.",
    );
  }
  if (
    typeof value.state !== "string" ||
    !validStatesByType[type].has(value.state)
  ) {
    invalidPortableCognitionRecord(
      "Portable Cognition object state is invalid.",
    );
  }
  if (!isTimestamp(value.createdAt) || !isTimestamp(value.updatedAt)) {
    invalidPortableCognitionRecord(
      "Portable Cognition object timestamp is invalid.",
    );
  }
  if (
    timestampIsAfter(
      value.createdAt as string,
      value.updatedAt as string,
    )
  ) {
    invalidPortableCognitionRecord(
      "Portable Cognition object timestamps are out of order.",
    );
  }
  validateObjectData(type, value.data);
  validateAttribution(value.attribution);
  validateProvenance(value.provenance);
  validateRelationships(type, value.relationships);
  if (value.extensions !== undefined) {
    validateExtensions(value.extensions);
  }
}

function validateHumanConfirmation(
  value: unknown,
  eventId?: string,
  occurredAt?: string,
  objectId?: string,
  targetState?: string,
): void {
  requireObject(
    value,
    "Portable Cognition human confirmation must be an object.",
  );
  requireExactFields(value, [
    "actor",
    "confirmedAt",
    "objectId",
    "targetState",
    "eventId",
  ]);
  validateActor(value.actor, true);
  requireNonWhitespaceFields(value, ["objectId", "targetState", "eventId"]);
  if (!isTimestamp(value.confirmedAt)) {
    invalidPortableCognitionRecord(
      "Portable Cognition confirmation timestamp is invalid.",
    );
  }
  if (eventId !== undefined && value.eventId !== eventId) {
    invalidPortableCognitionRecord(
      "Portable Cognition confirmation event ID is invalid.",
    );
  }
  if (objectId !== undefined && value.objectId !== objectId) {
    invalidPortableCognitionRecord(
      "Portable Cognition confirmation object ID is invalid.",
    );
  }
  if (targetState !== undefined && value.targetState !== targetState) {
    invalidPortableCognitionRecord(
      "Portable Cognition confirmation target state is invalid.",
    );
  }
  if (
    occurredAt !== undefined &&
    timestampIsAfter(value.confirmedAt as string, occurredAt)
  ) {
    invalidPortableCognitionRecord(
      "Portable Cognition confirmation time is invalid.",
    );
  }
}

function eventTypeFor(objectType: ObjectType, nextState: string): string {
  const formattedState = nextState
    .split("_")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join("");
  return `${objectType[0].toUpperCase()}${objectType.slice(1)}${formattedState}`;
}

function validateCognitionEvent(value: unknown): void {
  requireObject(value, "Portable Cognition event payload must be an object.");
  requireExactFields(
    value,
    [
      "id",
      "type",
      "schemaVersion",
      "objectId",
      "objectType",
      "objectVersion",
      "previousState",
      "nextState",
      "occurredAt",
      "contextId",
      "initiator",
      "executor",
      "accountableParty",
      "automationMode",
      "consequenceLevel",
      "rationale",
      "provenance",
    ],
    ["humanConfirmation"],
  );
  requireNonWhitespaceFields(value, [
    "id",
    "type",
    "objectId",
    "previousState",
    "nextState",
    "contextId",
    "rationale",
  ]);
  if (value.schemaVersion !== PORTABLE_COGNITION_SCHEMA_VERSION) {
    invalidPortableCognitionRecord(
      "Portable Cognition event schema version is unsupported.",
    );
  }
  if (
    typeof value.objectType !== "string" ||
    !objectTypes.has(value.objectType as ObjectType)
  ) {
    invalidPortableCognitionRecord(
      "Portable Cognition event object type is invalid.",
    );
  }
  if (
    typeof value.objectVersion !== "number" ||
    !Number.isInteger(value.objectVersion) ||
    value.objectVersion < 1
  ) {
    invalidPortableCognitionRecord(
      "Portable Cognition event object version is invalid.",
    );
  }
  if (!isTimestamp(value.occurredAt)) {
    invalidPortableCognitionRecord(
      "Portable Cognition event timestamp is invalid.",
    );
  }
  validateActor(value.initiator);
  validateActor(value.executor);
  validateActor(value.accountableParty);
  if (
    typeof value.automationMode !== "string" ||
    !automationModes.has(value.automationMode)
  ) {
    invalidPortableCognitionRecord(
      "Portable Cognition automation mode is invalid.",
    );
  }
  if (
    typeof value.consequenceLevel !== "string" ||
    !consequenceLevels.has(value.consequenceLevel)
  ) {
    invalidPortableCognitionRecord(
      "Portable Cognition consequence level is invalid.",
    );
  }
  validateProvenance(value.provenance);
  if (value.humanConfirmation !== undefined) {
    validateHumanConfirmation(
      value.humanConfirmation,
      value.id as string,
      value.occurredAt as string,
      value.objectId as string,
      value.nextState as string,
    );
  }

  const objectType = value.objectType as ObjectType;
  const allowedTargets = transitionsByType[objectType][
    value.previousState as string
  ];
  if (
    allowedTargets === undefined ||
    !allowedTargets.includes(value.nextState as string) ||
    value.type !== eventTypeFor(objectType, value.nextState as string)
  ) {
    invalidPortableCognitionRecord(
      "Portable Cognition event lifecycle edge is invalid.",
    );
  }
}

function validateTransitionContextPayload(value: unknown): void {
  requireObject(
    value,
    "Portable Cognition transition context must be an object.",
  );
  requireExactFields(
    value,
    [
      "eventId",
      "occurredAt",
      "initiator",
      "executor",
      "accountableParty",
      "automationMode",
      "consequenceLevel",
      "rationale",
    ],
    ["confirmation"],
  );
  requireNonWhitespaceFields(value, ["eventId", "rationale"]);
  if (!isTimestamp(value.occurredAt)) {
    invalidPortableCognitionRecord(
      "Portable Cognition transition timestamp is invalid.",
    );
  }
  validateActor(value.initiator);
  validateActor(value.executor);
  validateActor(value.accountableParty);
  if (
    typeof value.automationMode !== "string" ||
    !automationModes.has(value.automationMode)
  ) {
    invalidPortableCognitionRecord(
      "Portable Cognition automation mode is invalid.",
    );
  }
  if (
    typeof value.consequenceLevel !== "string" ||
    !consequenceLevels.has(value.consequenceLevel)
  ) {
    invalidPortableCognitionRecord(
      "Portable Cognition consequence level is invalid.",
    );
  }
  if (value.confirmation !== undefined) {
    validateHumanConfirmation(
      value.confirmation,
      value.eventId as string,
      value.occurredAt as string,
    );
  }
}

function validateAuthorizationDecisionPayload(value: unknown): void {
  requireObject(
    value,
    "Portable Cognition authorization decision must be an object.",
  );
  if (value.status === "allowed") {
    requireExactFields(value, ["status"]);
    return;
  }
  if (value.status === "denied") {
    requireExactFields(value, ["status", "reason"]);
    requireNonWhitespaceFields(value, ["reason"]);
    return;
  }
  if (value.status === "confirmation_required") {
    requireExactFields(value, [
      "status",
      "reason",
      "requiredActorKind",
    ]);
    requireNonWhitespaceFields(value, ["reason"]);
    if (value.requiredActorKind !== "human") {
      invalidPortableCognitionRecord(
        "Portable Cognition required actor kind is invalid.",
      );
    }
    return;
  }
  invalidPortableCognitionRecord(
    "Portable Cognition authorization status is invalid.",
  );
}

function validateDomainErrorPayload(value: unknown): void {
  requireObject(
    value,
    "Portable Cognition domain error must be an object.",
  );
  requireExactFields(value, ["code", "message", "details"]);
  requireNonWhitespaceFields(value, ["message"]);
  if (
    typeof value.code !== "string" ||
    !portableDomainErrorCodes.includes(value.code as PortableDomainErrorCode)
  ) {
    invalidPortableCognitionRecord(
      "Portable Cognition domain error code is invalid.",
    );
  }
  requireObject(
    value.details,
    "Portable Cognition domain error details must be an object.",
  );
}

function validatePortableCognitionSnapshot(
  value: unknown,
): asserts value is PortableCognitionRecord {
  requireObject(value, "Portable Cognition record must be an object.");
  requireExactFields(value, ["schemaVersion", "recordType", "payload"]);
  if (value.schemaVersion !== PORTABLE_COGNITION_SCHEMA_VERSION) {
    invalidPortableCognitionRecord(
      "Portable Cognition schema version is unsupported.",
    );
  }
  if (
    typeof value.recordType !== "string" ||
    !recordTypes.has(value.recordType as PortableCognitionRecordType)
  ) {
    invalidPortableCognitionRecord(
      "Portable Cognition record type is invalid.",
    );
  }

  const recordType = value.recordType as PortableCognitionRecordType;
  if (recordType === "cognitive-object") {
    validateCognitiveObject(value.payload);
  } else if (recordType === "cognition-event") {
    validateCognitionEvent(value.payload);
  } else if (recordType === "transition-context") {
    validateTransitionContextPayload(value.payload);
  } else if (recordType === "authorization-decision") {
    validateAuthorizationDecisionPayload(value.payload);
  } else {
    validateDomainErrorPayload(value.payload);
  }
}

export function validatePortableCognitionRecord(
  value: unknown,
): asserts value is PortableCognitionRecord {
  validatePortableCognitionSnapshot(snapshotPortableJson(value));
}

export function createPortableCognitionRecord(
  input: CreatePortableCognitionRecordInput,
): PortableCognitionRecord {
  const snapshot = snapshotPortableJson(input);
  validatePortableCognitionSnapshot(snapshot);
  try {
    restorePortableJsonPrototypes(snapshot);
    return freezeJsonValue(snapshot) as unknown as PortableCognitionRecord;
  } catch {
    invalidPortableCognitionRecord(
      "Portable Cognition record could not be finalized safely.",
    );
  }
}

export function serializePortableCognitionRecord(
  record: PortableCognitionRecord,
): string {
  const snapshot = snapshotPortableJson(record);
  validatePortableCognitionSnapshot(snapshot);
  try {
    return JSON.stringify(snapshot);
  } catch {
    throw new DomainError(
      DomainErrorCode.SERIALIZATION_ERROR,
      "Portable Cognition record could not be serialized.",
    );
  }
}

export function deserializePortableCognitionRecord(
  json: string,
): PortableCognitionRecord {
  let value: unknown;
  try {
    value = parseProfiledJson(json);
  } catch (error) {
    if (error instanceof JsonTextProfileError) {
      invalidPortableCognitionRecord(
        "Serialized Portable Cognition record violates the JSON interoperability profile.",
      );
    }
    throw new DomainError(
      DomainErrorCode.SERIALIZATION_ERROR,
      "Serialized Portable Cognition record is not valid JSON.",
    );
  }

  return createPortableCognitionRecord(
    value as CreatePortableCognitionRecordInput,
  );
}
