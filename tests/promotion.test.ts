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
  const policy: EvidencePromotionPolicy = {
    id: "unavailable-policy",
    version: "1",
    map() {
      throw new Error("Policy service unavailable.");
    },
  };

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
      message: "Policy service unavailable.",
      details: {},
    },
  });
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
