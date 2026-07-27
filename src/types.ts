export type ObjectType =
  | "identity"
  | "goal"
  | "hypothesis"
  | "experiment"
  | "evidence"
  | "decision"
  | "principle";

export type ActorKind = "human" | "agent" | "team" | "organization";

export type JsonPrimitive = string | number | boolean | null;
export type JsonArray = readonly JsonValue[];
export interface JsonObject {
  readonly [key: string]: JsonValue;
}
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;

function isJsonValueInternal(value: unknown, seen: Set<object>): boolean {
  if (value === null) {
    return true;
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (typeof value !== "object") {
    return false;
  }
  if (seen.has(value)) {
    return false;
  }

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        return false;
      }
      if (Object.getOwnPropertySymbols(value).length > 0) {
        return false;
      }

      const ownNames = Object.getOwnPropertyNames(value);
      if (ownNames.length !== value.length + 1 || !ownNames.includes("length")) {
        return false;
      }

      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (
          descriptor === undefined ||
          !descriptor.enumerable ||
          !("value" in descriptor) ||
          !isJsonValueInternal(descriptor.value, seen)
        ) {
          return false;
        }
      }
      return true;
    }
    if (
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
    ) {
      return false;
    }
    if (
      Object.getOwnPropertySymbols(value).length > 0 ||
      Object.getOwnPropertyNames(value).length !== Object.keys(value).length
    ) {
      return false;
    }
    return Object.keys(value).every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return (
        descriptor !== undefined &&
        "value" in descriptor &&
        isJsonValueInternal(descriptor.value, seen)
      );
    });
  } finally {
    seen.delete(value);
  }
}

export function isJsonValue(value: unknown): value is JsonValue {
  try {
    return isJsonValueInternal(value, new Set<object>());
  } catch {
    return false;
  }
}

export function isJsonObject(value: unknown): value is JsonObject {
  return isJsonValue(value) && typeof value === "object" && value !== null && !Array.isArray(value);
}

export function cloneJsonObject<T extends JsonObject>(value: T): T {
  return structuredClone(value) as T;
}

export function freezeJsonValue<T extends JsonValue>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) {
    freezeJsonValue(child);
  }
  return Object.freeze(value) as T;
}

export interface Attribution {
  readonly initiatorId: string;
  readonly executorId: string;
  readonly accountableId: string;
}

export interface ProvenanceRef {
  readonly source: string;
  readonly sourceId: string;
  readonly capturedAt: string;
  readonly uri?: string;
  readonly contentHash?: string;
}

export type IdentityState = "active" | "inactive";
export type GoalState =
  | "draft"
  | "active"
  | "at_risk"
  | "paused"
  | "achieved"
  | "abandoned"
  | "revised";
export type HypothesisState =
  | "proposed"
  | "under_review"
  | "testing"
  | "supported"
  | "refuted"
  | "inconclusive";
export type ExperimentState = "planned" | "active" | "completed" | "cancelled";
export type EvidenceState =
  | "collected"
  | "assessed"
  | "accepted"
  | "disputed"
  | "rejected"
  | "expired";
export type DecisionState =
  | "draft"
  | "proposed"
  | "approved"
  | "rejected"
  | "active"
  | "superseded"
  | "archived";
export type PrincipleState =
  | "proposed"
  | "trial"
  | "adopted"
  | "rejected"
  | "revised"
  | "retired";

export type StateByType = {
  [T in ObjectType]: T extends "identity"
    ? IdentityState
    : T extends "goal"
      ? GoalState
      : T extends "hypothesis"
        ? HypothesisState
        : T extends "experiment"
          ? ExperimentState
          : T extends "evidence"
            ? EvidenceState
            : T extends "decision"
              ? DecisionState
              : PrincipleState;
};

export type IdentityData = JsonObject & {
  readonly actorKind?: ActorKind;
  readonly displayName?: string;
};

export type GoalData = JsonObject & {
  readonly objective?: string;
  readonly description?: string;
  readonly successCriteria?: readonly string[];
};

export type HypothesisData = JsonObject & {
  readonly statement?: string;
  readonly claim?: string;
  readonly scope?: string;
};

export type ExperimentData = JsonObject & {
  readonly action?: string;
  readonly expectedOutcome?: string;
  readonly successCriteria?: readonly string[];
};

export type EvidenceData = JsonObject & {
  readonly statement?: string;
  readonly evidenceKind?: string;
  readonly polarity?: "supports" | "challenges" | "neutral";
  readonly sourceActorId?: string;
  readonly project?: string;
};

export type DecisionData = JsonObject & {
  readonly rationale?: string;
  readonly selectedOption?: string;
  readonly rejectedOptions?: readonly string[];
};

export type PrincipleData = JsonObject & {
  readonly rule?: string;
  readonly rationale?: string;
};

export type DataByType = {
  [T in ObjectType]: T extends "identity"
    ? IdentityData
    : T extends "goal"
      ? GoalData
      : T extends "hypothesis"
        ? HypothesisData
        : T extends "experiment"
          ? ExperimentData
          : T extends "evidence"
            ? EvidenceData
            : T extends "decision"
              ? DecisionData
              : PrincipleData;
};

export type RelationshipType =
  | "parent-goal"
  | "supports-goal"
  | "tests-hypothesis"
  | "supports-hypothesis"
  | "challenges-hypothesis"
  | "relates-to-hypothesis"
  | "observed-in-experiment"
  | "informs-decision"
  | "considers-option"
  | "accountable-identity"
  | "justified-by-decision"
  | "justified-by-evidence";

export interface Relationship {
  readonly type: RelationshipType;
  readonly targetId: string;
}

export interface CognitiveObjectFor<T extends ObjectType> {
  readonly id: string;
  readonly type: T;
  readonly version: number;
  readonly state: StateByType[T];
  readonly title: string;
  readonly data: DataByType[T];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly attribution: Attribution;
  readonly provenance: readonly ProvenanceRef[];
  readonly contextId: string;
  readonly relationships: readonly Relationship[];
  readonly extensions?: JsonObject;
}

export type CognitiveObject<T extends ObjectType = ObjectType> = {
  [K in T]: CognitiveObjectFor<K>;
}[T];

export interface CreateObjectInputFor<T extends ObjectType> {
  readonly id: string;
  readonly type: T;
  readonly version: number;
  readonly state: StateByType[T];
  readonly title: string;
  readonly data: DataByType[T];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly attribution: Attribution;
  readonly provenance: readonly ProvenanceRef[];
  readonly contextId: string;
  readonly relationships: readonly Relationship[];
  readonly extensions?: JsonObject;
}

export type CreateObjectInput<T extends ObjectType> = {
  [K in T]: CreateObjectInputFor<K>;
}[T];
