import assert from "node:assert/strict";
import test from "node:test";

import {
  createSourceRecord,
  DomainError,
  DomainErrorCode,
  ingestAndPromoteEvidence,
  ingestSourceRecordText,
  neutralEvidencePolicyV1,
  promoteSourceRecordsToEvidence,
  sourceRevisionKey,
} from "../src/index.ts";
import type {
  EvidencePromotionContext,
  EvidencePromotionMapping,
  EvidencePromotionPolicy,
  EvidencePromotionRequest,
  IngestAndPromoteEvidenceResult,
  SourceRecord,
} from "../src/index.ts";

const promotedAt = "2026-07-24T11:00:00.000Z";

function recordFor(overrides: Partial<SourceRecord> = {}): SourceRecord {
  return createSourceRecord({
    id: "source-record:delivery",
    source: { system: "git", instance: "github.example/acme" },
    sourceId: "commit:abc",
    revisionId: "abc",
    capturedAt: "2026-07-24T10:00:00.000Z",
    mediaType: "application/json",
    content: { summary: "Added explicit evidence promotion." },
    contentHash: "sha256:abc",
    ...overrides,
  });
}

function requestFor(
  records: readonly SourceRecord[],
  overrides: Partial<Omit<EvidencePromotionRequest, "records">> = {},
): EvidencePromotionRequest {
  return {
    records,
    hypothesisId: "hypothesis:delivery",
    contextId: "organization:acme",
    rationale: "These records jointly document the delivered change.",
    promotedAt,
    attribution: {
      initiatorId: "human:owner",
      executorId: "agent:importer",
      accountableId: "human:owner",
    },
    ...overrides,
  };
}

function contextFor(
  overrides: Partial<EvidencePromotionContext> = {},
): EvidencePromotionContext {
  const { records: _records, ...context } = requestFor([recordFor()]);
  return { ...context, ...overrides };
}

function composedOutcome(result: IngestAndPromoteEvidenceResult): string {
  switch (result.promotion.status) {
    case "succeeded":
      return result.promotion.evidence.id;
    case "failed":
      return result.promotion.error.code;
    default:
      return assertNever(result.promotion);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected promotion result: ${JSON.stringify(value)}`);
}

test("promotes one or more source records with deterministic identity and complete provenance", () => {
  const firstRecord = recordFor();
  const secondRecord = recordFor({
    id: "source-record:review",
    sourceId: "review:42",
    revisionId: "review:42:v1",
    capturedAt: "2026-07-24T10:30:00.000Z",
    content: { summary: "Review confirmed the delivered change." },
    contentHash: "sha256:def",
  });
  let mappedRecords = 0;
  const policy: EvidencePromotionPolicy = {
    id: "delivery-policy",
    version: "2",
    map(records) {
      mappedRecords += 1;
      assert.deepEqual(records, [firstRecord, secondRecord]);
      assert.equal(Object.isFrozen(records), true);
      return {
        title: "Delivery promotion",
        statement: "Two independent records preserve the delivered change.",
        evidenceKind: "change",
        polarity: "supports",
      };
    },
  };
  const request = requestFor([firstRecord, secondRecord]);

  const first = promoteSourceRecordsToEvidence(request, policy);
  const second = promoteSourceRecordsToEvidence(request, policy);

  assert.equal(mappedRecords, 2);
  assert.equal(first.id, second.id);
  assert.equal(first.type, "evidence");
  assert.equal(first.state, "collected");
  assert.deepEqual(first.data, {
    statement: "Two independent records preserve the delivered change.",
    evidenceKind: "change",
    polarity: "supports",
  });
  assert.equal(first.createdAt, promotedAt);
  assert.equal(first.updatedAt, promotedAt);
  assert.deepEqual(first.provenance, [
    {
      source: "collective-cognition:source-record",
      sourceId: firstRecord.id,
      capturedAt: firstRecord.capturedAt,
      contentHash: firstRecord.contentHash,
    },
    {
      source: "collective-cognition:source-record",
      sourceId: secondRecord.id,
      capturedAt: secondRecord.capturedAt,
      contentHash: secondRecord.contentHash,
    },
  ]);
  assert.deepEqual(first.attribution, request.attribution);
  assert.deepEqual(first.relationships, [
    { type: "relates-to-hypothesis", targetId: "hypothesis:delivery" },
  ]);
  assert.deepEqual(first.extensions, {
    "collective-cognition:promotion": {
      sourceRevisionKeys: [
        sourceRevisionKey(firstRecord),
        sourceRevisionKey(secondRecord),
      ],
      policy: { id: "delivery-policy", version: "2" },
      rationale: request.rationale,
    },
  });
});

test("uses neutral mappings for one or multiple source records", () => {
  const stringRecord = recordFor({ content: "A plain source statement." });
  const summaryRecord = recordFor({
    id: "source-record:summary",
    sourceId: "commit:def",
    revisionId: "def",
    content: { summary: "A source summary.", ignored: true },
  });
  const jsonRecord = recordFor({
    id: "source-record:json",
    sourceId: "commit:ghi",
    revisionId: "ghi",
    content: { z: 1, a: [true, null] },
  });

  assert.deepEqual(
    promoteSourceRecordsToEvidence(
      requestFor([stringRecord]),
      neutralEvidencePolicyV1,
    ).data,
    {
      statement: "A plain source statement.",
      evidenceKind: "source-record",
      polarity: "neutral",
    },
  );
  const combined = promoteSourceRecordsToEvidence(
    requestFor([summaryRecord, jsonRecord]),
    neutralEvidencePolicyV1,
  );
  assert.equal(combined.title, "Source records (2)");
  assert.deepEqual(combined.data, {
    statement: 'A source summary.\n\n{"a":[true,null],"z":1}',
    evidenceKind: "source-record",
    polarity: "neutral",
  });
  assert.deepEqual(
    combined.provenance.map((reference) => reference.sourceId),
    [summaryRecord.id, jsonRecord.id],
  );
});

test("classifies direct-promotion duplicates and rejects revision collisions", () => {
  const firstRecord = recordFor();
  const duplicate = structuredClone(firstRecord) as SourceRecord;
  const secondRecord = recordFor({
    id: "source-record:review",
    sourceId: "review:42",
    revisionId: "review:42:v1",
  });
  let mappedRecords: readonly SourceRecord[] | undefined;
  const policy: EvidencePromotionPolicy = {
    id: "classification-policy",
    version: "1",
    map(records) {
      mappedRecords = records;
      return {
        title: "Classified records",
        statement: "Only unique records are mapped.",
        evidenceKind: "source-record",
        polarity: "neutral",
      };
    },
  };

  const evidence = promoteSourceRecordsToEvidence(
    requestFor([firstRecord, duplicate, secondRecord]),
    policy,
  );

  assert.equal(mappedRecords?.length, 2);
  assert.notEqual(mappedRecords?.[0], firstRecord);
  assert.equal(Object.isFrozen(mappedRecords), true);
  assert.equal(Object.isFrozen(mappedRecords?.[0]), true);
  assert.deepEqual(
    evidence.provenance.map((reference) => reference.sourceId),
    [firstRecord.id, secondRecord.id],
  );

  const collision = {
    ...firstRecord,
    content: { summary: "Conflicting content under the same revision." },
  } as SourceRecord;
  assert.throws(
    () =>
      promoteSourceRecordsToEvidence(
        requestFor([firstRecord, collision]),
        policy,
      ),
    (error: unknown) =>
      error instanceof DomainError &&
      error.code === DomainErrorCode.SOURCE_REVISION_COLLISION,
  );
});

test("derives Evidence IDs from the complete validated promotion payload", () => {
  const record = recordFor();
  const baseMapping: EvidencePromotionMapping = {
    title: "Canonical promotion",
    statement: "Canonical statement.",
    evidenceKind: "source-record",
    polarity: "neutral",
  };
  const policyFor = (
    mapping: EvidencePromotionMapping = baseMapping,
  ): EvidencePromotionPolicy => ({
    id: "canonical-policy",
    version: "1",
    map() {
      return mapping;
    },
  });
  const baseRequest = requestFor([record]);
  const base = promoteSourceRecordsToEvidence(baseRequest, policyFor());
  const variants = [
    promoteSourceRecordsToEvidence(
      { ...baseRequest, rationale: "A different rationale." },
      policyFor(),
    ),
    promoteSourceRecordsToEvidence(
      {
        ...baseRequest,
        attribution: {
          ...baseRequest.attribution,
          executorId: "agent:another-importer",
        },
      },
      policyFor(),
    ),
    promoteSourceRecordsToEvidence(
      { ...baseRequest, promotedAt: "2026-07-24T11:00:00.001Z" },
      policyFor(),
    ),
    promoteSourceRecordsToEvidence(
      baseRequest,
      policyFor({ ...baseMapping, statement: "Different mapping output." }),
    ),
  ];

  assert.match(base.id, /^evidence:promotion:sha256:[a-f0-9]{64}$/);
  assert.equal(new Set([base.id, ...variants.map((item) => item.id)]).size, 5);
  assert.equal(
    promoteSourceRecordsToEvidence(baseRequest, policyFor()).id,
    base.id,
  );
});

test("snapshots validated promotion inputs before invoking a mutable policy", () => {
  const source = recordFor();
  const request = {
    records: [source],
    hypothesisId: "hypothesis:snapshot",
    contextId: "context:snapshot",
    rationale: "Snapshot every validated caller value.",
    promotedAt,
    attribution: {
      initiatorId: "human:initiator",
      executorId: "agent:executor",
      accountableId: "human:accountable",
    },
  };
  const policy = {
    id: "snapshot-policy",
    version: "7",
    map(records: readonly SourceRecord[]): EvidencePromotionMapping {
      assert.equal(Object.isFrozen(records), true);
      assert.equal(Object.isFrozen(records[0]), true);
      assert.equal(Object.isFrozen(records[0]?.content), true);
      assert.notEqual(records[0], source);

      request.records.splice(0);
      request.hypothesisId = "";
      request.contextId = "";
      request.rationale = "";
      request.promotedAt = "not-a-timestamp";
      request.attribution.initiatorId = "";
      request.attribution.executorId = "";
      request.attribution.accountableId = "";
      policy.id = "";
      policy.version = "";

      return {
        title: "Snapshot-safe promotion",
        statement: "Mutation cannot bypass pre-map validation.",
        evidenceKind: "source-record",
        polarity: "supports",
      };
    },
  };

  const evidence = promoteSourceRecordsToEvidence(request, policy);

  assert.equal(evidence.contextId, "context:snapshot");
  assert.equal(evidence.createdAt, promotedAt);
  assert.deepEqual(evidence.attribution, {
    initiatorId: "human:initiator",
    executorId: "agent:executor",
    accountableId: "human:accountable",
  });
  assert.deepEqual(evidence.relationships, [
    { type: "relates-to-hypothesis", targetId: "hypothesis:snapshot" },
  ]);
  assert.deepEqual(evidence.extensions, {
    "collective-cognition:promotion": {
      sourceRevisionKeys: [sourceRevisionKey(source)],
      policy: { id: "snapshot-policy", version: "7" },
      rationale: "Snapshot every validated caller value.",
    },
  });
});

test("snapshots request state before reading promotion policy accessors", () => {
  const source = recordFor();
  const request = {
    records: [source],
    hypothesisId: "hypothesis:accessor-snapshot",
    contextId: "context:accessor-snapshot",
    rationale: "Snapshot before policy property access.",
    promotedAt,
    attribution: {
      initiatorId: "human:initiator",
      executorId: "agent:executor",
      accountableId: "human:accountable",
    },
  };
  let idReads = 0;
  let versionReads = 0;
  let mapReads = 0;
  const policy = {
    get id() {
      idReads += 1;
      request.records.splice(0);
      request.hypothesisId = "";
      request.contextId = "";
      request.rationale = "";
      request.promotedAt = "not-a-timestamp";
      request.attribution.initiatorId = "";
      return "accessor-policy";
    },
    get version() {
      versionReads += 1;
      return "5";
    },
    get map() {
      mapReads += 1;
      return (records: readonly SourceRecord[]): EvidencePromotionMapping => {
        assert.equal(Object.isFrozen(records), true);
        assert.equal(Object.isFrozen(records[0]), true);
        assert.equal(records.length, 1);
        assert.equal(records[0]?.id, source.id);
        return {
          title: "Accessor-safe promotion",
          statement: "Policy access cannot mutate captured request state.",
          evidenceKind: "source-record",
          polarity: "neutral",
        };
      };
    },
  };

  const evidence = promoteSourceRecordsToEvidence(request, policy);

  assert.equal(idReads, 1);
  assert.equal(versionReads, 1);
  assert.equal(mapReads, 1);
  assert.equal(evidence.contextId, "context:accessor-snapshot");
  assert.equal(evidence.createdAt, promotedAt);
  assert.deepEqual(evidence.attribution, {
    initiatorId: "human:initiator",
    executorId: "agent:executor",
    accountableId: "human:accountable",
  });
  assert.deepEqual(evidence.relationships, [
    {
      type: "relates-to-hypothesis",
      targetId: "hypothesis:accessor-snapshot",
    },
  ]);
  assert.deepEqual(evidence.extensions, {
    "collective-cognition:promotion": {
      sourceRevisionKeys: [sourceRevisionKey(source)],
      policy: { id: "accessor-policy", version: "5" },
      rationale: "Snapshot before policy property access.",
    },
  });
});

test("sanitizes every promotion policy accessor failure", () => {
  for (const field of ["id", "version", "map"] as const) {
    const secret = `POLICY_${field.toUpperCase()}_GETTER_SECRET`;
    const policy = {
      id: "getter-policy",
      version: "1",
      map() {
        return {
          title: "Unused mapping",
          statement: "Unused statement.",
          evidenceKind: "source-record",
          polarity: "neutral" as const,
        };
      },
    };
    Object.defineProperty(policy, field, {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error(secret);
      },
    });

    assert.throws(
      () =>
        promoteSourceRecordsToEvidence(
          requestFor([recordFor()]),
          policy as EvidencePromotionPolicy,
        ),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === DomainErrorCode.PROMOTION_FAILED &&
        error.message === "Promotion policy failed." &&
        Object.keys(error.details).length === 0 &&
        !`${error.message}${JSON.stringify(error.details)}`.includes(secret),
      field,
    );
  }
});

test("preserves captured policy method receiver semantics without rereading identity", () => {
  let idReads = 0;
  let versionReads = 0;
  let mapReads = 0;
  const mutablePolicy = {
    _id: "receiver-policy",
    _version: "9",
    get id() {
      idReads += 1;
      return this._id;
    },
    get version() {
      versionReads += 1;
      return this._version;
    },
    get map() {
      mapReads += 1;
      return function (
        this: EvidencePromotionPolicy,
        _records: readonly SourceRecord[],
      ): EvidencePromotionMapping {
        mutablePolicy._id = "mutated-policy";
        mutablePolicy._version = "mutated-version";
        return {
          title: `${this.id}@${this.version}`,
          statement: "The captured policy receiver remains coherent.",
          evidenceKind: "source-record",
          polarity: "supports",
        };
      };
    },
  };

  const evidence = promoteSourceRecordsToEvidence(
    requestFor([recordFor()]),
    mutablePolicy,
  );

  assert.equal(evidence.title, "receiver-policy@9");
  assert.deepEqual(
    (
      evidence.extensions?.["collective-cognition:promotion"] as {
        policy: object;
      }
    ).policy,
    { id: "receiver-policy", version: "9" },
  );
  assert.equal(idReads, 1);
  assert.equal(versionReads, 1);
  assert.equal(mapReads, 1);
  assert.equal(mutablePolicy._id, "mutated-policy");
  assert.equal(mutablePolicy._version, "mutated-version");
});

test("captures a stateful Proxy mapping exactly once before validation and use", () => {
  const secret = "STATEFUL_MAPPING_PROXY_SECRET";
  const target: {
    title: string;
    statement: string;
    evidenceKind: string;
    polarity: "supports" | "challenges" | "neutral";
  } = {
    title: "Captured mapping",
    statement: "Captured before caller mutation.",
    evidenceKind: "source-record",
    polarity: "neutral",
  };
  let ownKeysReads = 0;
  let valueReads = 0;
  const descriptorReads = new Map<PropertyKey, number>();
  const mapping = new Proxy(target, {
    ownKeys(inner) {
      ownKeysReads += 1;
      if (ownKeysReads > 1) {
        throw new Error(secret);
      }
      return Reflect.ownKeys(inner);
    },
    getOwnPropertyDescriptor(inner, key) {
      const reads = (descriptorReads.get(key) ?? 0) + 1;
      descriptorReads.set(key, reads);
      if (reads > 1) {
        throw new Error(secret);
      }
      const descriptor = Reflect.getOwnPropertyDescriptor(inner, key);
      if (key === "polarity") {
        inner.title = "Mutated mapping";
        inner.statement = secret;
        inner.evidenceKind = "mutated";
        inner.polarity = "challenges";
      }
      return descriptor;
    },
    get() {
      valueReads += 1;
      throw new Error(secret);
    },
  });

  const evidence = promoteSourceRecordsToEvidence(requestFor([recordFor()]), {
    id: "stateful-mapping-policy",
    version: "1",
    map() {
      return mapping;
    },
  });

  assert.equal(evidence.title, "Captured mapping");
  assert.deepEqual(evidence.data, {
    statement: "Captured before caller mutation.",
    evidenceKind: "source-record",
    polarity: "neutral",
  });
  assert.deepEqual(target, {
    title: "Mutated mapping",
    statement: secret,
    evidenceKind: "mutated",
    polarity: "challenges",
  });
  assert.equal(ownKeysReads, 1);
  assert.equal(valueReads, 0);
  for (const field of ["title", "statement", "evidenceKind", "polarity"]) {
    assert.equal(descriptorReads.get(field), 1);
  }
  assert.equal(JSON.stringify(evidence).includes(secret), false);
});

test("sanitizes Proxy mapping reflection failures", () => {
  const validMapping = {
    title: "Valid mapping",
    statement: "Valid statement.",
    evidenceKind: "source-record",
    polarity: "neutral" as const,
  };
  const failures = [
    {
      secret: "MAPPING_PROXY_OWN_KEYS_SECRET",
      mapping: new Proxy({ ...validMapping }, {
        ownKeys() {
          throw new Error("MAPPING_PROXY_OWN_KEYS_SECRET");
        },
      }),
    },
    {
      secret: "MAPPING_PROXY_DESCRIPTOR_SECRET",
      mapping: new Proxy({ ...validMapping }, {
        getOwnPropertyDescriptor(inner, key) {
          if (key === "title") {
            throw new Error("MAPPING_PROXY_DESCRIPTOR_SECRET");
          }
          return Reflect.getOwnPropertyDescriptor(inner, key);
        },
      }),
    },
  ];

  for (const { secret, mapping } of failures) {
    assert.throws(
      () =>
        promoteSourceRecordsToEvidence(requestFor([recordFor()]), {
          id: "reflection-failure-policy",
          version: "1",
          map() {
            return mapping;
          },
        }),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === DomainErrorCode.PROMOTION_FAILED &&
        error.message === "Promotion policy failed." &&
        Object.keys(error.details).length === 0 &&
        !`${error.message}${JSON.stringify(error.details)}`.includes(secret),
    );
  }
});

test("requires at least one source record and a non-empty rationale", () => {
  assert.throws(
    () =>
      promoteSourceRecordsToEvidence(
        requestFor([]),
        neutralEvidencePolicyV1,
      ),
    (error: unknown) =>
      error instanceof DomainError &&
      error.code === DomainErrorCode.INVALID_OBJECT &&
      error.details.field === "records",
  );

  for (const rationale of ["", "   "]) {
    assert.throws(
      () =>
        promoteSourceRecordsToEvidence(
          requestFor([recordFor()], { rationale }),
          neutralEvidencePolicyV1,
        ),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === DomainErrorCode.INVALID_OBJECT &&
        error.details.field === "rationale",
    );
  }
});

test("requires non-empty promotion policy id and version", () => {
  for (const [field, policy] of [
    [
      "policy.id",
      { ...neutralEvidencePolicyV1, id: " " },
    ],
    [
      "policy.version",
      { ...neutralEvidencePolicyV1, version: "" },
    ],
  ] as const) {
    assert.throws(
      () =>
        promoteSourceRecordsToEvidence(
          requestFor([recordFor()]),
          policy,
        ),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === DomainErrorCode.INVALID_OBJECT &&
        error.details.field === field,
      field,
    );
  }
});

test("rejects malformed policy mapping outputs at runtime", () => {
  const validMapping = {
    title: "Valid title",
    statement: "Valid statement.",
    evidenceKind: "source-record",
    polarity: "neutral",
  };
  const invalidMappings: readonly [string, string, unknown][] = [
    ["an unknown field", "mapping.unexpected", {
      ...validMapping,
      unexpected: true,
    }],
    ["an empty title", "title", { ...validMapping, title: "" }],
    ["a non-string title", "title", { ...validMapping, title: 1 }],
    ["a blank statement", "statement", { ...validMapping, statement: " " }],
    ["a non-string statement", "statement", { ...validMapping, statement: null }],
    ["an empty evidence kind", "evidenceKind", { ...validMapping, evidenceKind: "" }],
    ["a non-string evidence kind", "evidenceKind", { ...validMapping, evidenceKind: false }],
    ["an unsupported polarity", "polarity", { ...validMapping, polarity: "unknown" }],
  ];

  for (const [description, field, mapping] of invalidMappings) {
    const policy: EvidencePromotionPolicy = {
      id: "invalid-policy",
      version: "1",
      map() {
        return mapping as EvidencePromotionMapping;
      },
    };

    assert.throws(
      () => promoteSourceRecordsToEvidence(requestFor([recordFor()]), policy),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === DomainErrorCode.INVALID_OBJECT &&
        error.details.field === field,
      description,
    );
  }
});

test("rejects accessor mapping fields without invoking them", () => {
  const secret = "MAPPING_ACCESSOR_SECRET";
  let accessorReads = 0;
  const mapping = {
    statement: "Valid statement.",
    evidenceKind: "source-record",
    polarity: "neutral",
  };
  Object.defineProperty(mapping, "title", {
    enumerable: true,
    get() {
      accessorReads += 1;
      throw new Error(secret);
    },
  });

  assert.throws(
    () =>
      promoteSourceRecordsToEvidence(requestFor([recordFor()]), {
        id: "accessor-mapping-policy",
        version: "1",
        map() {
          return mapping as unknown as EvidencePromotionMapping;
        },
      }),
    (error: unknown) =>
      error instanceof DomainError &&
      error.code === DomainErrorCode.INVALID_OBJECT &&
      error.details.field === "mapping.title" &&
      !`${error.message}${JSON.stringify(error.details)}`.includes(secret),
  );
  assert.equal(accessorReads, 0);
});

test("accepts every EvidenceData polarity from policy mappings", () => {
  for (const polarity of ["supports", "challenges", "neutral"] as const) {
    const evidence = promoteSourceRecordsToEvidence(requestFor([recordFor()]), {
      id: `policy:${polarity}`,
      version: "1",
      map() {
        return {
          title: `${polarity} mapping`,
          statement: "Valid statement.",
          evidenceKind: "source-record",
          polarity,
        };
      },
    });

    assert.equal(evidence.data.polarity, polarity);
  }
});

test("promotes all accepted records together in composed ingestion", () => {
  const firstRecord = recordFor();
  const secondRecord = recordFor({
    id: "source-record:review",
    sourceId: "review:42",
    revisionId: "review:42:v1",
  });
  const rejected = { ...firstRecord, schemaVersion: "9.9.9" };
  const result = ingestAndPromoteEvidence(
    [firstRecord, secondRecord, firstRecord, rejected],
    contextFor(),
    neutralEvidencePolicyV1,
  );

  assert.deepEqual(result.ingestion.items.map((item) => item.status), [
    "accepted",
    "accepted",
    "duplicate",
    "rejected",
  ]);
  assert.equal(result.promotion.status, "succeeded");
  assert.ok(result.promotion.status === "succeeded");
  assert.equal(composedOutcome(result), result.promotion.evidence.id);
  assert.deepEqual(
    result.promotion.evidence.provenance.map((reference) => reference.sourceId),
    [firstRecord.id, secondRecord.id],
  );
});

test("returns successful ingestion plus a structured promotion failure", () => {
  const record = recordFor();
  const secret = "POLICY_SECRET_DO_NOT_EXPOSE";
  const policy: EvidencePromotionPolicy = {
    id: "unavailable-policy",
    version: "1",
    map() {
      throw new Error(secret);
    },
  };

  assert.throws(
    () =>
      promoteSourceRecordsToEvidence(
        requestFor([record]),
        policy,
      ),
    (error: unknown) =>
      error instanceof DomainError &&
      error.code === DomainErrorCode.PROMOTION_FAILED &&
      error.message === "Promotion policy failed." &&
      !JSON.stringify(error).includes(secret),
  );

  const result = ingestAndPromoteEvidence(
    [record],
    contextFor(),
    policy,
  );

  assert.equal(result.ingestion.items[0]?.status, "accepted");
  assert.deepEqual(result.ingestion.acceptedRecords, [record]);
  assert.deepEqual(result.promotion, {
    status: "failed",
    error: {
      code: "PROMOTION_FAILED",
      message: "Promotion policy failed.",
      details: {},
    },
  });
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(composedOutcome(result), "PROMOTION_FAILED");
});

test("reuses a supplied ingestion result with all item outcomes intact", () => {
  const record = recordFor();
  const rejected = { ...record, schemaVersion: "9.9.9" };
  const ingestion = ingestSourceRecordText(
    [
      JSON.stringify(record),
      JSON.stringify(record),
      JSON.stringify(rejected),
    ].join("\n"),
    { format: "jsonl", mode: "collect-all" },
  );

  const result = ingestAndPromoteEvidence(
    ingestion,
    contextFor(),
    neutralEvidencePolicyV1,
  );

  assert.equal(result.ingestion, ingestion);
  assert.deepEqual(result.ingestion.items.map((item) => item.status), [
    "accepted",
    "duplicate",
    "rejected",
  ]);
  assert.deepEqual(result.ingestion.items.map((item) => item.line), [1, 2, 3]);
  assert.deepEqual(result.ingestion.acceptedRecords, [record]);
  assert.equal(result.promotion.status, "succeeded");
  assert.ok(result.promotion.status === "succeeded");
  assert.equal(result.promotion.evidence.provenance[0]?.sourceId, record.id);
});
