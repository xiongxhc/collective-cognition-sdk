import {
  canonicalizeJson,
  deserializeSourceRecord,
  serializeSourceRecord,
  SOURCE_RECORD_MAX_JSON_DEPTH,
  sourceRevisionKey,
  validateSourceRecord,
} from "./source-records.ts";
import type { SourceRecord } from "./source-records.ts";
import type { JsonValue } from "./types.ts";

export interface SourceConnectorConformanceCase {
  readonly name: string;
  readonly collect: () =>
    | readonly SourceRecord[]
    | Promise<readonly SourceRecord[]>;
  readonly collectAgain?: () =>
    | readonly SourceRecord[]
    | Promise<readonly SourceRecord[]>;
}

export type SourceConnectorConformanceDiagnosticCode =
  | "connector_exception"
  | "invalid_collection"
  | "invalid_source_record"
  | "duplicate_revision"
  | "nondeterministic_output";

export interface SourceConnectorConformanceDiagnostic {
  readonly code: SourceConnectorConformanceDiagnosticCode;
  readonly message: string;
  readonly itemIndex?: number;
}

export interface SourceConnectorConformanceResult {
  readonly name: string;
  readonly status: "passed" | "failed";
  readonly diagnostics: readonly SourceConnectorConformanceDiagnostic[];
}

interface CaseSnapshot {
  readonly name: string;
  readonly collect: SourceConnectorConformanceCase["collect"];
  readonly collectAgain?: SourceConnectorConformanceCase["collectAgain"];
}

interface CollectionSnapshot {
  readonly diagnostics: SourceConnectorConformanceDiagnostic[];
  readonly canonicalRecords: string[];
}

const caseFields = new Set(["name", "collect", "collectAgain"]);

function freezeResult<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) {
    freezeResult(child);
  }
  return Object.freeze(value);
}

function invalidCaseDiagnostic(): SourceConnectorConformanceDiagnostic {
  return {
    code: "invalid_collection",
    message: "Connector conformance case is invalid.",
  };
}

function invalidCollectionDiagnostic(): SourceConnectorConformanceDiagnostic {
  return {
    code: "invalid_collection",
    message: "Connector must return an array of SourceRecords.",
  };
}

function arrayDataValues(value: unknown): readonly unknown[] | undefined {
  try {
    if (!Array.isArray(value)) {
      return undefined;
    }
    const lengthDescriptor = Reflect.getOwnPropertyDescriptor(value, "length");
    if (
      lengthDescriptor === undefined ||
      !("value" in lengthDescriptor) ||
      !Number.isSafeInteger(lengthDescriptor.value) ||
      lengthDescriptor.value < 0
    ) {
      return undefined;
    }

    const length = lengthDescriptor.value as number;
    const keys = Reflect.ownKeys(value);
    const indexKeys = keys.filter((key): key is string => {
      if (typeof key !== "string" || key === "length") {
        return false;
      }
      const index = Number(key);
      return Number.isInteger(index) &&
        index >= 0 &&
        index < length &&
        String(index) === key;
    });
    if (indexKeys.length !== length) {
      return undefined;
    }

    const values = new Array<unknown>(length);
    for (const key of indexKeys) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) {
        return undefined;
      }
      values[Number(key)] = descriptor.value;
    }
    return values;
  } catch {
    return undefined;
  }
}

function snapshotJsonValue(
  value: unknown,
  seen: Set<object>,
  depth: number,
): JsonValue | undefined {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (
    typeof value !== "object" ||
    depth > SOURCE_RECORD_MAX_JSON_DEPTH ||
    seen.has(value)
  ) {
    return undefined;
  }

  seen.add(value);
  try {
    const prototype = Reflect.getPrototypeOf(value);
    if (Array.isArray(value)) {
      if (prototype !== Array.prototype) {
        return undefined;
      }
      const values = arrayDataValues(value);
      if (values === undefined) {
        return undefined;
      }
      const snapshot: JsonValue[] = [];
      for (const child of values) {
        const childSnapshot = snapshotJsonValue(child, seen, depth + 1);
        if (childSnapshot === undefined) {
          return undefined;
        }
        snapshot.push(childSnapshot);
      }
      return snapshot;
    }
    if (prototype !== Object.prototype && prototype !== null) {
      return undefined;
    }

    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string")) {
      return undefined;
    }
    const snapshot: Record<string, JsonValue> = {};
    for (const key of keys) {
      if (typeof key !== "string") {
        return undefined;
      }
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) {
        return undefined;
      }
      const childSnapshot = snapshotJsonValue(
        descriptor.value,
        seen,
        depth + 1,
      );
      if (childSnapshot === undefined) {
        return undefined;
      }
      Object.defineProperty(snapshot, key, {
        configurable: true,
        enumerable: true,
        value: childSnapshot,
        writable: true,
      });
    }
    return snapshot;
  } catch {
    return undefined;
  } finally {
    seen.delete(value);
  }
}

function isDeeplyFrozenData(value: unknown, seen = new Set<object>()): boolean {
  if (typeof value !== "object" || value === null) {
    return true;
  }
  if (seen.has(value)) {
    return false;
  }
  seen.add(value);
  try {
    if (!Object.isFrozen(value)) {
      return false;
    }
    return Reflect.ownKeys(value).every((key) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      return descriptor !== undefined &&
        "value" in descriptor &&
        isDeeplyFrozenData(descriptor.value, seen);
    });
  } catch {
    return false;
  } finally {
    seen.delete(value);
  }
}

function snapshotCase(value: unknown): CaseSnapshot | undefined {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return undefined;
    }

    const keys = Reflect.ownKeys(value);
    if (
      keys.length < 2 ||
      keys.length > 3 ||
      keys.some((key) => typeof key !== "string" || !caseFields.has(key))
    ) {
      return undefined;
    }

    const descriptors = new Map<string, PropertyDescriptor>();
    for (const key of keys) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (
        typeof key !== "string" ||
        descriptor === undefined ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) {
        return undefined;
      }
      descriptors.set(key, descriptor);
    }

    const name = descriptors.get("name")?.value;
    const collect = descriptors.get("collect")?.value;
    const collectAgain = descriptors.get("collectAgain")?.value;
    if (
      typeof name !== "string" ||
      name.trim().length === 0 ||
      typeof collect !== "function" ||
      (collectAgain !== undefined && typeof collectAgain !== "function")
    ) {
      return undefined;
    }

    return {
      name,
      collect,
      ...(collectAgain === undefined ? {} : { collectAgain }),
    };
  } catch {
    return undefined;
  }
}

async function snapshotCollection(
  collect: SourceConnectorConformanceCase["collect"],
): Promise<CollectionSnapshot> {
  let collection: unknown;
  try {
    collection = await collect();
  } catch {
    return {
      diagnostics: [{
        code: "connector_exception",
        message: "Connector collection failed.",
      }],
      canonicalRecords: [],
    };
  }

  const values = arrayDataValues(collection);
  if (values === undefined) {
    return {
      diagnostics: [invalidCollectionDiagnostic()],
      canonicalRecords: [],
    };
  }

  const diagnostics: SourceConnectorConformanceDiagnostic[] = [];
  const canonicalRecords: string[] = [];
  const revisionKeys = new Set<string>();

  values.forEach((value, itemIndex) => {
    try {
      if (!isDeeplyFrozenData(value)) {
        throw new Error("SourceRecord is not deeply frozen.");
      }
      const snapshot = snapshotJsonValue(value, new Set<object>(), 1);
      if (snapshot === undefined) {
        throw new Error("Invalid SourceRecord snapshot.");
      }
      validateSourceRecord(snapshot);
      const record = deserializeSourceRecord(
        serializeSourceRecord(snapshot),
      );
      const revisionKey = sourceRevisionKey(record);
      if (revisionKeys.has(revisionKey)) {
        diagnostics.push({
          code: "duplicate_revision",
          message: "Connector returned a duplicate source revision.",
          itemIndex,
        });
      } else {
        revisionKeys.add(revisionKey);
      }
      canonicalRecords.push(
        canonicalizeJson(record as unknown as JsonValue),
      );
    } catch {
      diagnostics.push({
        code: "invalid_source_record",
        message: "Connector returned an invalid SourceRecord.",
        itemIndex,
      });
    }
  });

  return { diagnostics, canonicalRecords };
}

function failedCase(
  index: number,
): SourceConnectorConformanceResult {
  return {
    name: `connector case ${index + 1}`,
    status: "failed",
    diagnostics: [invalidCaseDiagnostic()],
  };
}

export async function runSourceConnectorConformance(
  cases: readonly SourceConnectorConformanceCase[],
): Promise<readonly SourceConnectorConformanceResult[]> {
  const caseValues = arrayDataValues(cases);
  if (caseValues === undefined) {
    return freezeResult([failedCase(0)]);
  }

  const results: SourceConnectorConformanceResult[] = [];
  for (let index = 0; index < caseValues.length; index += 1) {
    const conformanceCase = snapshotCase(caseValues[index]);
    if (conformanceCase === undefined) {
      results.push(failedCase(index));
      continue;
    }

    const first = await snapshotCollection(conformanceCase.collect);
    const diagnostics = [...first.diagnostics];
    if (
      diagnostics.length === 0 &&
      conformanceCase.collectAgain !== undefined
    ) {
      const second = await snapshotCollection(conformanceCase.collectAgain);
      diagnostics.push(...second.diagnostics);
      if (
        second.diagnostics.length === 0 &&
        (
          first.canonicalRecords.length !== second.canonicalRecords.length ||
          first.canonicalRecords.some(
            (record, recordIndex) =>
              record !== second.canonicalRecords[recordIndex],
          )
        )
      ) {
        diagnostics.push({
          code: "nondeterministic_output",
          message: "Connector output was not deterministic.",
        });
      }
    }

    results.push({
      name: conformanceCase.name,
      status: diagnostics.length === 0 ? "passed" : "failed",
      diagnostics,
    });
  }

  return freezeResult(results);
}
