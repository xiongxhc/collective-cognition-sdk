import { DomainError, DomainErrorCode } from "./errors.ts";
import type {
  CognitiveObject,
  JsonObject,
  CreateObjectInput,
  ObjectType,
  Relationship,
  RelationshipType,
} from "./types.ts";
import { isJsonObject } from "./types.ts";

const objectTypes = new Set<ObjectType>([
  "identity",
  "goal",
  "hypothesis",
  "experiment",
  "evidence",
  "decision",
  "principle",
]);

const initialStateByType = {
  identity: "active",
  goal: "draft",
  hypothesis: "proposed",
  experiment: "planned",
  evidence: "collected",
  decision: "draft",
  principle: "proposed",
} as const;

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

type RelationshipRequirement = readonly RelationshipType[];

const relationshipRequirements: Partial<
  Record<ObjectType, readonly RelationshipRequirement[]>
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
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

function isRecord(value: unknown): value is JsonObject {
  return isJsonObject(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoTimestamp(value: unknown): value is string {
  if (
    typeof value === "string" &&
    isoTimestampPattern.test(value) &&
    !Number.isNaN(Date.parse(value))
  ) {
    const datePart = value.slice(0, 10);
    const calendarDate = new Date(`${datePart}T00:00:00.000Z`);
    return (
      !Number.isNaN(calendarDate.getTime()) &&
      calendarDate.toISOString().slice(0, 10) === datePart
    );
  }
  return false;
}

function invalidObject(message: string, details: JsonObject = {}): never {
  throw new DomainError(DomainErrorCode.INVALID_OBJECT, message, details);
}

function invalidRelationship(
  message: string,
  details: JsonObject = {},
): never {
  throw new DomainError(DomainErrorCode.INVALID_RELATIONSHIP, message, details);
}

function validateAttribution(value: unknown): void {
  if (!isRecord(value)) {
    invalidObject("Attribution is required.");
  }

  for (const field of ["initiatorId", "executorId", "accountableId"]) {
    if (!isNonEmptyString(value[field])) {
      invalidObject(`Attribution field ${field} must be a non-empty string.`, {
        field,
      });
    }
  }
}

function validateProvenance(value: unknown): void {
  if (!Array.isArray(value) || value.length === 0) {
    invalidObject("At least one provenance reference is required.");
  }

  for (const reference of value) {
    if (!isRecord(reference)) {
      invalidObject("Each provenance reference must be an object.");
    }
    for (const field of ["source", "sourceId"]) {
      if (!isNonEmptyString(reference[field])) {
        invalidObject(`Provenance field ${field} must be a non-empty string.`, {
          field,
        });
      }
    }
    if (!isIsoTimestamp(reference.capturedAt)) {
      invalidObject("Provenance capturedAt must be an ISO timestamp.", {
        field: "capturedAt",
      });
    }
    for (const field of ["uri", "contentHash"]) {
      if (reference[field] !== undefined && !isNonEmptyString(reference[field])) {
        invalidObject(`Provenance field ${field} must be a non-empty string.`, {
          field,
        });
      }
    }
  }
}

function validateRelationships(type: ObjectType, value: unknown): void {
  if (!Array.isArray(value)) {
    invalidRelationship("Relationships must be an array.");
  }

  const seen = new Set<string>();
  for (const relationship of value) {
    if (!isRecord(relationship)) {
      invalidRelationship("Each relationship must be an object.");
    }
    if (
      !isNonEmptyString(relationship.type) ||
      !relationshipTypes.has(relationship.type as RelationshipType)
    ) {
      invalidRelationship("Relationship type is invalid.", {
        type: relationship.type,
      });
    }
    if (!isNonEmptyString(relationship.targetId)) {
      invalidRelationship("Relationship targetId must be a non-empty string.");
    }

    const key = `${relationship.type}:${relationship.targetId}`;
    if (seen.has(key)) {
      invalidRelationship("Duplicate relationships are not allowed.", {
        relationship: key,
      });
    }
    seen.add(key);
  }

  if (
    type === "hypothesis" &&
    !value.some(
        (relationship: JsonObject) =>
        relationship.type === "supports-goal",
    )
  ) {
    invalidRelationship(
      "A hypothesis must have at least one supports-goal relationship.",
    );
  }

  for (const requirement of relationshipRequirements[type] ?? []) {
    if (
      !value.some((relationship: JsonObject) =>
        requirement.includes(relationship.type as RelationshipType),
      )
    ) {
      invalidRelationship(
        `${type} is missing a required relationship.`,
        { acceptedTypes: requirement },
      );
    }
  }
}

function validateCommon(value: JsonObject, creation: boolean): void {
  if (!isNonEmptyString(value.id)) {
    invalidObject("Object id must be a non-empty string.", { field: "id" });
  }
  if (!objectTypes.has(value.type as ObjectType)) {
    invalidObject("Object type is invalid.", { field: "type" });
  }
  if (
    typeof value.version !== "number" ||
    !Number.isInteger(value.version) ||
    (creation ? value.version !== 1 : value.version < 1)
  ) {
    invalidObject("Object version must be a positive integer.", {
      field: "version",
    });
  }
  if (!isNonEmptyString(value.title)) {
    invalidObject("Object title must be a non-empty string.", { field: "title" });
  }
  if (!isNonEmptyString(value.contextId)) {
    invalidObject("Object contextId must be a non-empty string.", {
      field: "contextId",
    });
  }
  if (!isIsoTimestamp(value.createdAt) || !isIsoTimestamp(value.updatedAt)) {
    invalidObject("Object timestamps must be ISO timestamps.");
  }
  if (Date.parse(value.createdAt as string) > Date.parse(value.updatedAt as string)) {
    invalidObject("Object createdAt cannot be after updatedAt.", {
      field: "createdAt",
    });
  }
  if (!isJsonObject(value.data)) {
    invalidObject("Object data must be an object.", { field: "data" });
  }
  validateAttribution(value.attribution);
  validateProvenance(value.provenance);
  validateRelationships(value.type as ObjectType, value.relationships);

  if (value.extensions !== undefined && !isJsonObject(value.extensions)) {
    invalidObject("Object extensions must be an object.", { field: "extensions" });
  }
}

function validateObjectValue(
  value: unknown,
  creation: boolean,
): asserts value is CognitiveObject {
  if (!isJsonObject(value)) {
    invalidObject("Cognitive object must be an object.");
  }
  validateCommon(value, creation);

  const type = value.type as ObjectType;
  if (
    typeof value.state !== "string" ||
    !validStatesByType[type].has(value.state)
  ) {
    invalidObject(`State is invalid for ${type}.`, { field: "state" });
  }
  if (value.state !== initialStateByType[type] && creation) {
    invalidObject(`A new ${type} must start in ${initialStateByType[type]}.`, {
      field: "state",
    });
  }
}

function freezeDeep<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }

  for (const child of Object.values(value as Record<string, unknown>)) {
    freezeDeep(child);
  }
  return Object.freeze(value);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function createObject<T extends ObjectType>(
  input: CreateObjectInput<T>,
): CognitiveObject<T> {
  validateObjectValue(input, true);
  const value = clone(input) as unknown;
  return freezeDeep(value) as CognitiveObject<T>;
}

export function serializeObject(object: CognitiveObject): string {
  try {
    validateObjectValue(object, false);
    return JSON.stringify(object);
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    throw new DomainError(
      DomainErrorCode.SERIALIZATION_ERROR,
      "Cognitive object could not be serialized.",
    );
  }
}

export function deserializeObject(json: string): CognitiveObject {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new DomainError(
      DomainErrorCode.SERIALIZATION_ERROR,
      "Serialized cognitive object is not valid JSON.",
    );
  }

  validateObjectValue(value, false);
  return freezeDeep(value) as CognitiveObject;
}
