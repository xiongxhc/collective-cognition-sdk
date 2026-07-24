import assert from "node:assert/strict";
import test from "node:test";

import {
  createSourceRecord,
  DomainError,
  DomainErrorCode,
  ingestSourceRecordText,
  ingestSourceRecords,
} from "../src/index.ts";
import type { CreateSourceRecordInput } from "../src/index.ts";

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

test("accepts valid source records and returns retained records", () => {
  const record = recordFor();
  const result = ingestSourceRecords([record]);

  assert.deepEqual(result.items, [
    { index: 0, status: "accepted", record },
  ]);
  assert.deepEqual(result.acceptedRecords, [record]);
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
  assert.equal(result.items[1]?.retainedRecordId, record.id);
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
  const collisionError = result.items[0]?.error;
  assert.ok(collisionError);
  assert.equal(collisionError.code, "SOURCE_REVISION_COLLISION");
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
  const malformedRecordError = result.items[1]?.error;
  assert.ok(malformedRecordError);
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
  const malformedJsonlError = result.items[1]?.error;
  assert.ok(malformedJsonlError);
  assert.equal(malformedJsonlError.code, DomainErrorCode.SERIALIZATION_ERROR);
  assert.deepEqual(result.acceptedRecords, [first, second]);
});
