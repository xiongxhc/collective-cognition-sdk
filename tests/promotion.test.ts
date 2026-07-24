import assert from "node:assert/strict";
import test from "node:test";

import {
  createSourceRecord,
  DomainError,
  DomainErrorCode,
  ingestAndPromoteEvidence,
  neutralEvidencePolicyV1,
  promoteSourceRecordToEvidence,
  sourceRevisionKey,
} from "../src/index.ts";
import type {
  EvidencePromotionMapping,
  EvidencePromotionPolicy,
  EvidencePromotionRequest,
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

function requestFor(record: SourceRecord): EvidencePromotionRequest {
  return {
    record,
    hypothesisId: "hypothesis:delivery",
    contextId: "organization:acme",
    promotedAt,
    attribution: {
      initiatorId: "human:owner",
      executorId: "agent:importer",
      accountableId: "human:owner",
    },
  };
}

test("executes explicit policies with deterministic IDs and complete provenance", () => {
  const record = recordFor();
  let mappedRecords = 0;
  const policy: EvidencePromotionPolicy = {
    id: "delivery-policy",
    version: "2",
    map(value) {
      mappedRecords += 1;
      assert.equal(value, record);
      return {
        title: "Delivery promotion",
        statement: "Explicit promotion preserves the source record.",
        evidenceKind: "change",
        polarity: "supports",
      };
    },
  };

  const first = promoteSourceRecordToEvidence(requestFor(record), policy);
  const second = promoteSourceRecordToEvidence(requestFor(record), policy);

  assert.equal(mappedRecords, 2);
  assert.equal(first.id, second.id);
  assert.equal(first.type, "evidence");
  assert.equal(first.state, "collected");
  assert.deepEqual(first.data, {
    statement: "Explicit promotion preserves the source record.",
    evidenceKind: "change",
    polarity: "supports",
  });
  assert.equal(first.createdAt, promotedAt);
  assert.equal(first.updatedAt, promotedAt);
  assert.deepEqual(first.provenance, [
    {
      source: "collective-cognition:source-record",
      sourceId: record.id,
      capturedAt: record.capturedAt,
      contentHash: record.contentHash,
    },
  ]);
  assert.deepEqual(first.attribution, requestFor(record).attribution);
  assert.deepEqual(first.relationships, [
    { type: "relates-to-hypothesis", targetId: "hypothesis:delivery" },
  ]);
  assert.deepEqual(first.extensions, {
    "collective-cognition:promotion": {
      sourceRevisionKey: sourceRevisionKey(record),
      policy: { id: "delivery-policy", version: "2" },
    },
  });
});

test("uses neutral mappings for strings, summaries, and canonical JSON", () => {
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
    promoteSourceRecordToEvidence(requestFor(stringRecord), neutralEvidencePolicyV1).data,
    {
      statement: "A plain source statement.",
      evidenceKind: "source-record",
      polarity: "neutral",
    },
  );
  assert.deepEqual(
    promoteSourceRecordToEvidence(requestFor(summaryRecord), neutralEvidencePolicyV1).data,
    {
      statement: "A source summary.",
      evidenceKind: "source-record",
      polarity: "neutral",
    },
  );
  assert.deepEqual(
    promoteSourceRecordToEvidence(requestFor(jsonRecord), neutralEvidencePolicyV1).data,
    {
      statement: '{"a":[true,null],"z":1}',
      evidenceKind: "source-record",
      polarity: "neutral",
    },
  );
});

test("rejects mappings that fail normal Evidence validation", () => {
  const invalidPolicy: EvidencePromotionPolicy = {
    id: "invalid-policy",
    version: "1",
    map() {
      return {
        title: "",
        statement: "Invalid title.",
        evidenceKind: "source-record",
        polarity: "neutral",
      };
    },
  };

  assert.throws(
    () => promoteSourceRecordToEvidence(requestFor(recordFor()), invalidPolicy),
    (error: unknown) =>
      error instanceof DomainError && error.code === DomainErrorCode.INVALID_OBJECT,
  );
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
      () => promoteSourceRecordToEvidence(requestFor(recordFor()), policy),
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
    const evidence = promoteSourceRecordToEvidence(requestFor(recordFor()), {
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

test("promotes accepted records only in composed ingestion", () => {
  const record = recordFor();
  const rejected = { ...record, schemaVersion: "9.9.9" };
  const result = ingestAndPromoteEvidence(
    [record, record, rejected],
    {
      hypothesisId: "hypothesis:delivery",
      contextId: "organization:acme",
      promotedAt,
      attribution: requestFor(record).attribution,
    },
    neutralEvidencePolicyV1,
  );

  assert.deepEqual(result.ingestion.items.map((item) => item.status), [
    "accepted",
    "duplicate",
    "rejected",
  ]);
  assert.equal(result.promotions.length, 1);
  assert.equal(result.promotions[0]?.provenance[0]?.sourceId, record.id);
});
