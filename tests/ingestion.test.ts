import assert from "node:assert/strict";
import test from "node:test";

import {
  createSourceRecord,
  deserializeSourceRecord,
  DomainError,
  DomainErrorCode,
  ingestSourceRecordText,
  ingestSourceRecords,
} from "../src/index.ts";
import type {
  CreateSourceRecordInput,
  IngestionItemResult,
  SourceRecord,
} from "../src/index.ts";

function inputFor(
  overrides: Partial<CreateSourceRecordInput> = {},
): CreateSourceRecordInput {
  return {
    id: "source-record:1",
    source: { system: "git", instance: "github.example/acme" },
    sourceId: "commit:abc",
    revisionId: "abc",
    capturedAt: "2026-07-24T10:00:00.000Z",
    mediaType: "application/json",
    content: { summary: "Added source records." },
    ...overrides,
  };
}

function recordFor(overrides: Partial<CreateSourceRecordInput> = {}) {
  return createSourceRecord(inputFor(overrides));
}

function itemIdentity(item: IngestionItemResult): string {
  switch (item.status) {
    case "accepted":
      return item.record.id;
    case "duplicate":
      return item.retainedRecordId;
    case "rejected":
      return item.error.code;
    default:
      return assertNever(item);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected ingestion item: ${JSON.stringify(value)}`);
}

function expectLimitExceeded(
  action: () => unknown,
  limit: "maxInputBytes" | "maxRecords" | "maxRecordBytes",
): void {
  assert.throws(
    action,
    (error: unknown) =>
      error instanceof DomainError &&
      error.code === DomainErrorCode.INGESTION_LIMIT_EXCEEDED &&
      error.details.limit === limit,
  );
}

test("accepts valid source records and returns retained records", () => {
  const record = recordFor();
  const result = ingestSourceRecords([record]);

  assert.deepEqual(result.items, [
    { index: 0, status: "accepted", record },
  ]);
  assert.deepEqual(result.acceptedRecords, [record]);
});

test("normalizes accepted external records into isolated deeply frozen values", () => {
  const external = {
    ...inputFor(),
    schemaVersion: "0.1.0",
    source: { system: "git", instance: "github.example/acme" },
    content: { nested: { summary: "Original content." } },
    context: { labels: ["external"] },
    extensions: { "example:metadata": { retained: true } },
  };
  const result = ingestSourceRecords([external]);
  const item = result.items[0];

  assert.equal(item?.status, "accepted");
  assert.ok(item?.status === "accepted");
  assert.equal(itemIdentity(item), external.id);
  assert.notEqual(item.record, external);
  assert.equal(item.record, result.acceptedRecords[0]);

  external.source.system = "mutated";
  external.content.nested.summary = "Mutated content.";
  external.context.labels.push("mutated");
  external.extensions["example:metadata"].retained = false;

  assert.deepEqual(item.record.source, {
    system: "git",
    instance: "github.example/acme",
  });
  assert.deepEqual(item.record.content, {
    nested: { summary: "Original content." },
  });
  assert.deepEqual(item.record.context, { labels: ["external"] });
  assert.deepEqual(item.record.extensions, {
    "example:metadata": { retained: true },
  });
  assert.equal(Object.isFrozen(item.record), true);
  assert.equal(Object.isFrozen(item.record.source), true);
  assert.equal(Object.isFrozen(item.record.content), true);
  assert.equal(
    Object.isFrozen((item.record.content as { nested: object }).nested),
    true,
  );
  assert.equal(Object.isFrozen(item.record.context), true);
  assert.equal(Object.isFrozen(item.record.extensions), true);
});

test("classifies matching source revisions as duplicates", () => {
  const record = recordFor();
  const result = ingestSourceRecords([record, record], {
    mode: "collect-all",
  });

  assert.deepEqual(result.items.map((item) => item.status), [
    "accepted",
    "duplicate",
  ]);
  const duplicate = result.items[1];
  assert.ok(duplicate?.status === "duplicate");
  assert.equal(duplicate.retainedRecordId, record.id);
  assert.deepEqual(result.acceptedRecords, [record]);
});

test("rejects different content for an existing source revision", () => {
  const retained = recordFor();
  const collision = recordFor({
    id: "source-record:collision",
    content: { summary: "Changed content." },
  });
  const result = ingestSourceRecords([collision], {
    existingRecords: [retained],
    mode: "collect-all",
  });

  assert.equal(result.items[0]?.status, "rejected");
  const collisionItem = result.items[0];
  assert.ok(collisionItem?.status === "rejected");
  const collisionError = collisionItem.error;
  assert.equal(
    collisionError.code,
    DomainErrorCode.SOURCE_REVISION_COLLISION,
  );
  assert.deepEqual(result.acceptedRecords, []);
});

test("classifies existing matching source revisions as duplicates", () => {
  const retained = recordFor();
  const duplicate = recordFor({ id: "source-record:duplicate" });
  const result = ingestSourceRecords([duplicate], {
    existingRecords: [retained],
  });

  assert.deepEqual(result.items, [
    {
      index: 0,
      status: "duplicate",
      record: duplicate,
      retainedRecordId: retained.id,
    },
  ]);
  assert.deepEqual(result.acceptedRecords, []);
});

test("accepts changed content under a new immutable revision", () => {
  const retained = recordFor();
  const incoming = JSON.parse(
    JSON.stringify({
      ...retained,
      id: "source-record:new-revision",
      revisionId: "revision:2",
      content: { summary: "Changed content in a new revision." },
    }),
  ) as SourceRecord;
  const result = ingestSourceRecords([incoming], {
    existingRecords: [retained],
  });
  const item = result.items[0];

  assert.equal(item?.status, "accepted");
  assert.ok(item?.status === "accepted");
  assert.notEqual(item.record, incoming);
  assert.equal(item.record.revisionId, "revision:2");
  assert.deepEqual(item.record.content, {
    summary: "Changed content in a new revision.",
  });
  assert.deepEqual(result.acceptedRecords, [item.record]);
  assert.equal(Object.isFrozen(item.record), true);
  assert.deepEqual(retained.content, { summary: "Added source records." });
});

test("collects malformed source records without hiding valid records", () => {
  const record = recordFor();
  const result = ingestSourceRecords(
    [record, { ...record, schemaVersion: "9.9.9" }, recordFor({ id: "source-record:2", sourceId: "commit:def" })],
    { mode: "collect-all" },
  );

  assert.deepEqual(result.items.map((item) => item.status), [
    "accepted",
    "rejected",
    "accepted",
  ]);
  const malformedRecord = result.items[1];
  assert.ok(malformedRecord?.status === "rejected");
  const malformedRecordError = malformedRecord.error;
  assert.equal(malformedRecordError.code, DomainErrorCode.INVALID_SOURCE_RECORD);
  assert.deepEqual(result.acceptedRecords.map((item) => item.id), [
    record.id,
    "source-record:2",
  ]);
});

test("fails fast with the matching malformed-record error", () => {
  const record = recordFor();

  assert.throws(
    () =>
      ingestSourceRecords([record, { ...record, schemaVersion: "9.9.9" }], {
        mode: "fail-fast",
      }),
    (error: unknown) =>
      error instanceof DomainError &&
      error.code === DomainErrorCode.INVALID_SOURCE_RECORD,
  );
});

test("ingests a JSON source-record object or array", () => {
  const first = recordFor();
  const second = recordFor({ id: "source-record:2", sourceId: "commit:def" });

  assert.deepEqual(
    ingestSourceRecordText(JSON.stringify(first), { format: "json" }).acceptedRecords,
    [first],
  );
  assert.deepEqual(
    ingestSourceRecordText(JSON.stringify([first, second]), { format: "json" })
      .acceptedRecords,
    [first, second],
  );
});

test("ignores blank JSONL lines and reports one-based line numbers", () => {
  const first = recordFor();
  const second = recordFor({ id: "source-record:2", sourceId: "commit:def" });
  const result = ingestSourceRecordText(
    `\n${JSON.stringify(first)}\n  \n${JSON.stringify(second)}\n`,
    { format: "jsonl" },
  );

  assert.deepEqual(result.items.map((item) => item.line), [2, 4]);
  assert.deepEqual(result.acceptedRecords, [first, second]);
});

test("enforces caller-configured SDK ingestion limits at exact UTF-8 boundaries", () => {
  const first = recordFor();
  const second = recordFor({
    id: "source-record:2",
    sourceId: "commit:def",
    revisionId: "def",
  });
  const jsonl = JSON.stringify(first);
  const inputBytes = Buffer.byteLength(jsonl);
  const recordBytes = Buffer.byteLength(JSON.stringify(first));

  assert.equal(
    ingestSourceRecordText(jsonl, {
      format: "jsonl",
      maxInputBytes: inputBytes,
      maxRecordBytes: recordBytes,
    }).acceptedRecords.length,
    1,
  );
  assert.equal(
    ingestSourceRecords([first], {
      maxRecords: 1,
      maxRecordBytes: recordBytes,
    }).acceptedRecords.length,
    1,
  );

  expectLimitExceeded(
    () =>
      ingestSourceRecordText(jsonl, {
        format: "jsonl",
        maxInputBytes: inputBytes - 1,
      }),
    "maxInputBytes",
  );
  expectLimitExceeded(
    () => ingestSourceRecords([first, second], { maxRecords: 1 }),
    "maxRecords",
  );
  expectLimitExceeded(
    () => ingestSourceRecords([first], { maxRecordBytes: recordBytes - 1 }),
    "maxRecordBytes",
  );
});

test("enforces maxRecordBytes before record validation or JSONL parsing", () => {
  const oversizedInvalidRecord = {
    ...JSON.parse(JSON.stringify(recordFor())),
    unsupported: "x".repeat(256),
  };
  const malformedLine = `{"value":"${"x".repeat(256)}"`;

  expectLimitExceeded(
    () =>
      ingestSourceRecords([oversizedInvalidRecord], {
        mode: "collect-all",
        maxRecordBytes: 64,
      }),
    "maxRecordBytes",
  );
  expectLimitExceeded(
    () =>
      ingestSourceRecordText(malformedLine, {
        format: "jsonl",
        mode: "collect-all",
        maxInputBytes: Buffer.byteLength(malformedLine),
        maxRecordBytes: 64,
      }),
    "maxRecordBytes",
  );
});

test("rejects unsafe structural values per item and continues collect-all ingestion", () => {
  const circular = structuredClone(recordFor()) as unknown as {
    content: { summary: string; self?: unknown };
  };
  circular.content.self = circular.content;
  const withBigInt = {
    ...structuredClone(recordFor()),
    id: "source-record:bigint",
    sourceId: "commit:bigint",
    revisionId: "bigint",
    content: { value: 1n },
  };
  const accessorSecret = "ACCESSOR_SECRET_DO_NOT_EXPOSE";
  let accessorCalls = 0;
  const withAccessor = {
    ...structuredClone(recordFor()),
    id: "source-record:accessor",
    sourceId: "commit:accessor",
    revisionId: "accessor",
    content: {},
  };
  Object.defineProperty(withAccessor.content, "value", {
    enumerable: true,
    get() {
      accessorCalls += 1;
      throw new Error(accessorSecret);
    },
  });
  const valid = recordFor({
    id: "source-record:after-unsafe",
    sourceId: "commit:after-unsafe",
    revisionId: "after-unsafe",
  });

  const result = ingestSourceRecords(
    [circular, withBigInt, withAccessor, valid],
    { mode: "collect-all", maxRecordBytes: 16_384 },
  );

  assert.deepEqual(
    result.items.map((item) => item.status),
    ["rejected", "rejected", "rejected", "accepted"],
  );
  for (const item of result.items.slice(0, 3)) {
    assert.equal(item.status, "rejected");
    assert.ok(item.status === "rejected");
    assert.equal(item.error.code, DomainErrorCode.INVALID_SOURCE_RECORD);
  }
  assert.equal(accessorCalls, 0);
  assert.deepEqual(result.acceptedRecords, [valid]);
  const diagnostics = result.items
    .filter((item) => item.status === "rejected")
    .map((item) => ({
      code: item.error.code,
      message: item.error.message,
      details: item.error.details,
    }));
  assert.equal(JSON.stringify(diagnostics).includes(accessorSecret), false);
});

test("never invokes throwing or mutating toJSON hooks on SDK input", () => {
  const throwingSecret = "THROWING_TO_JSON_SECRET";
  const mutationSecret = "MUTATING_TO_JSON_SECRET";
  let throwingCalls = 0;
  let mutatingCalls = 0;
  const throwing = {
    ...structuredClone(recordFor()),
    id: "source-record:throwing-to-json",
    sourceId: "commit:throwing-to-json",
    revisionId: "throwing-to-json",
  };
  Object.defineProperty(throwing, "toJSON", {
    enumerable: true,
    value() {
      throwingCalls += 1;
      throw new Error(throwingSecret);
    },
  });
  const mutating = {
    ...structuredClone(recordFor()),
    id: "source-record:mutating-to-json",
    sourceId: "commit:mutating-to-json",
    revisionId: "mutating-to-json",
  };
  const originalSummary = (mutating.content as { summary: string }).summary;
  Object.defineProperty(mutating, "toJSON", {
    enumerable: true,
    value() {
      mutatingCalls += 1;
      (mutating.content as { summary: string }).summary = mutationSecret;
      return { compact: true };
    },
  });
  const valid = recordFor({
    id: "source-record:after-to-json",
    sourceId: "commit:after-to-json",
    revisionId: "after-to-json",
  });

  const result = ingestSourceRecords(
    [throwing, mutating, valid],
    { mode: "collect-all", maxRecordBytes: 16_384 },
  );

  assert.deepEqual(
    result.items.map((item) => item.status),
    ["rejected", "rejected", "accepted"],
  );
  assert.equal(throwingCalls, 0);
  assert.equal(mutatingCalls, 0);
  assert.equal(
    (mutating.content as { summary: string }).summary,
    originalSummary,
  );
  const diagnostics = result.items
    .filter((item) => item.status === "rejected")
    .map((item) => ({
      code: item.error.code,
      message: item.error.message,
      details: item.error.details,
    }));
  assert.equal(JSON.stringify(diagnostics).includes(throwingSecret), false);
  assert.equal(JSON.stringify(diagnostics).includes(mutationSecret), false);
});

test("sanitizes JSON parser failures", () => {
  const secret = "LEAK42";
  const malformed = `{"value": ${secret}}`;
  const result = ingestSourceRecordText(malformed, {
    format: "jsonl",
    mode: "collect-all",
  });
  const item = result.items[0];

  assert.equal(item?.status, "rejected");
  assert.ok(item?.status === "rejected");
  assert.equal(item.error.code, DomainErrorCode.SERIALIZATION_ERROR);
  assert.deepEqual(item.error.details, {});
  assert.equal(JSON.stringify(result).includes(secret), false);

  assert.throws(
    () => deserializeSourceRecord(malformed),
    (error: unknown) =>
      error instanceof DomainError &&
      error.code === DomainErrorCode.SERIALIZATION_ERROR &&
      Object.keys(error.details).length === 0 &&
      !JSON.stringify(error).includes(secret),
  );
});

test("collects malformed JSONL lines without hiding valid records", () => {
  const first = recordFor();
  const second = recordFor({ id: "source-record:2", sourceId: "commit:def" });
  const result = ingestSourceRecordText(
    `${JSON.stringify(first)}\n{broken\n${JSON.stringify(second)}`,
    { format: "jsonl", mode: "collect-all" },
  );

  assert.deepEqual(result.items.map((item) => item.status), [
    "accepted",
    "rejected",
    "accepted",
  ]);
  assert.deepEqual(result.items.map((item) => item.line), [1, 2, 3]);
  const malformedJsonl = result.items[1];
  assert.ok(malformedJsonl?.status === "rejected");
  const malformedJsonlError = malformedJsonl.error;
  assert.equal(malformedJsonlError.code, DomainErrorCode.SERIALIZATION_ERROR);
  assert.deepEqual(result.acceptedRecords, [first, second]);
});
