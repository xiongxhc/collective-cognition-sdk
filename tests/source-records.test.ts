import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalizeJson,
  createSourceRecord,
  deserializeSourceRecord,
  DomainError,
  DomainErrorCode,
  serializeSourceRecord,
  sourceRevisionKey,
  SOURCE_RECORD_SCHEMA_VERSION,
  validateSourceRecord,
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
    observedAt: "2026-07-24T09:59:00.000Z",
    mediaType: "application/json",
    content: { summary: "Added source records." },
    ...overrides,
  };
}

function expectInvalidSourceRecord(action: () => unknown): void {
  assert.throws(
    action,
    (error: unknown) =>
      error instanceof DomainError &&
      error.code === DomainErrorCode.INVALID_SOURCE_RECORD,
  );
}

test("creates a versioned source record with opaque integrity metadata", () => {
  const record = createSourceRecord({
    ...inputFor(),
    contentHash: "sha256:not-a-verified-digest",
    actorId: "agent:collector",
    context: { project: "collective-cognition-sdk" },
    extensions: { "example:source": { retained: true } },
  });

  assert.equal(record.schemaVersion, SOURCE_RECORD_SCHEMA_VERSION);
  assert.equal(SOURCE_RECORD_SCHEMA_VERSION, "0.1.0");
  assert.equal(record.source.system, "git");
  assert.equal(record.contentHash, "sha256:not-a-verified-digest");
  assert.equal(record.actorId, "agent:collector");
  assert.deepEqual(record.context, { project: "collective-cognition-sdk" });
});

test("clones and deeply freezes all source record values", () => {
  const input = inputFor({
    content: { nested: { value: "original" } },
    context: { labels: ["source"] },
    extensions: { "example:extension": { enabled: true } },
  });
  const record = createSourceRecord(input);

  (input.content as { nested: { value: string } }).nested.value = "changed";
  (input.context as { labels: string[] }).labels.push("mutated");

  assert.equal(
    (record.content as { nested: { value: string } }).nested.value,
    "original",
  );
  assert.deepEqual(record.context, { labels: ["source"] });
  assert.equal(Object.isFrozen(record), true);
  assert.equal(Object.isFrozen(record.source), true);
  assert.equal(Object.isFrozen(record.content), true);
  assert.equal(
    Object.isFrozen((record.content as { nested: object }).nested),
    true,
  );
  assert.equal(Object.isFrozen(record.context), true);
  assert.equal(Object.isFrozen(record.extensions), true);
  assert.throws(
    () => {
      (record.content as { nested: { value: string } }).nested.value = "mutated";
    },
    TypeError,
  );
});

test("requires source identity and revision fields", () => {
  expectInvalidSourceRecord(() =>
    createSourceRecord(inputFor({ id: "  " })),
  );
  expectInvalidSourceRecord(() =>
    createSourceRecord(inputFor({ source: { system: "" } })),
  );
  expectInvalidSourceRecord(() =>
    createSourceRecord(inputFor({ sourceId: "  " })),
  );
  expectInvalidSourceRecord(() =>
    createSourceRecord(inputFor({ revisionId: "  " })),
  );
});

test("requires valid ISO source timestamps", () => {
  expectInvalidSourceRecord(() =>
    createSourceRecord(inputFor({ capturedAt: "not-a-date" })),
  );
  expectInvalidSourceRecord(() =>
    createSourceRecord(inputFor({ observedAt: "2026-02-30T10:00:00.000Z" })),
  );
  expectInvalidSourceRecord(() =>
    createSourceRecord(inputFor({ capturedAt: "2026-07-24T24:00:00Z" })),
  );
});

test("requires an RFC media type", () => {
  assert.equal(
    createSourceRecord(
      inputFor({
        mediaType: 'application/ld+json; profile="https://example.com/schema"',
      }),
    ).mediaType,
    'application/ld+json; profile="https://example.com/schema"',
  );

  for (const mediaType of ["", "application", "text/"]) {
    expectInvalidSourceRecord(() => createSourceRecord(inputFor({ mediaType })));
  }
});

test("rejects non-JSON content, context, and extensions", () => {
  for (const overrides of [
    { content: new Map([["key", "value"]]) },
    { context: new Map([["key", "value"]]) },
    { extensions: new Map([["key", "value"]]) },
  ]) {
    expectInvalidSourceRecord(() =>
      createSourceRecord(
        inputFor(overrides as unknown as Partial<CreateSourceRecordInput>),
      ),
    );
  }
});

test("rejects lone surrogates in direct SourceRecord strings and keys", () => {
  expectInvalidSourceRecord(() =>
    createSourceRecord(inputFor({ content: "\ud800" })),
  );
  expectInvalidSourceRecord(() =>
    createSourceRecord(inputFor({ content: { "\ud800": "value" } })),
  );
});

test("rejects duplicate members and lone surrogates during deserialization", () => {
  for (const json of [
    '{"schemaVersion":"0.1.0","id":"first","id":"second","source":{"system":"fixture"},"sourceId":"item","revisionId":"revision","capturedAt":"2026-07-24T10:00:00Z","mediaType":"application/json","content":null}',
    '{"schemaVersion":"0.1.0","id":"record","source":{"system":"fixture"},"sourceId":"item","revisionId":"revision","capturedAt":"2026-07-24T10:00:00Z","mediaType":"application/json","content":{"value":1,"value":2}}',
    '{"schemaVersion":"0.1.0","id":"record","source":{"system":"fixture"},"sourceId":"item","revisionId":"revision","capturedAt":"2026-07-24T10:00:00Z","mediaType":"application/json","content":"\\ud800"}',
    '{"schemaVersion":"0.1.0","id":"record","source":{"system":"fixture"},"sourceId":"item","revisionId":"revision","capturedAt":"2026-07-24T10:00:00Z","mediaType":"application/json","content":{"\\ud800":"value"}}',
  ]) {
    expectInvalidSourceRecord(() => deserializeSourceRecord(json));
  }
});

test("serializes and deserializes source records without semantic loss", () => {
  const record = createSourceRecord(inputFor({ contentHash: "sha256:abc" }));
  const restored = deserializeSourceRecord(serializeSourceRecord(record));

  assert.deepEqual(restored, record);
  assert.equal(Object.isFrozen(restored), true);
  assert.equal(Object.isFrozen(restored.content), true);
});

test("rejects malformed external records and malformed serialized JSON", () => {
  expectInvalidSourceRecord(() =>
    validateSourceRecord({ ...inputFor(), schemaVersion: "9.9.9" }),
  );
  expectInvalidSourceRecord(() =>
    deserializeSourceRecord(JSON.stringify({ ...inputFor(), schemaVersion: "9.9.9" })),
  );
  assert.throws(
    () => deserializeSourceRecord("{broken"),
    (error: unknown) =>
      error instanceof DomainError &&
      error.code === DomainErrorCode.SERIALIZATION_ERROR,
  );
});

test("rejects unknown top-level and source fields outside extensions", () => {
  const record = {
    ...inputFor(),
    schemaVersion: SOURCE_RECORD_SCHEMA_VERSION,
    extensions: {
      "example:polarity": "supports",
      "example.confidence": 0.9,
      "example:authority": "human:owner",
    },
  };

  for (const [field, value] of [
    ["unexpected", true],
    ["polarity", "supports"],
    ["confidence", 0.9],
    ["authority", "human:owner"],
  ] as const) {
    assert.throws(
      () => validateSourceRecord({ ...record, [field]: value }),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === DomainErrorCode.INVALID_SOURCE_RECORD &&
        error.details.field === field,
      field,
    );
  }

  for (const field of ["unexpected", "polarity", "confidence", "authority"]) {
    assert.throws(
      () =>
        validateSourceRecord({
          ...record,
          source: { ...record.source, [field]: "not-allowed" },
        }),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === DomainErrorCode.INVALID_SOURCE_RECORD &&
        error.details.field === `source.${field}`,
      `source.${field}`,
    );
  }

  assert.doesNotThrow(() => validateSourceRecord(record));
});

test("requires namespaced extension keys with non-empty separator sides", () => {
  for (const key of [
    "plain",
    ":missing-prefix",
    "missing-suffix:",
    ".missing-prefix",
    "missing-suffix.",
  ]) {
    assert.throws(
      () =>
        createSourceRecord(
          inputFor({ extensions: { [key]: true } }),
        ),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === DomainErrorCode.INVALID_SOURCE_RECORD &&
        error.details.field === `extensions.${key}`,
      key,
    );
  }

  assert.doesNotThrow(() =>
    createSourceRecord(
      inputFor({
        extensions: {
          "example:field": true,
          "example.org.field": true,
        },
      }),
    )
  );
});

test("rejects interpretation fields in context while preserving raw content", () => {
  for (const field of ["polarity", "confidence", "authority"]) {
    assert.throws(
      () =>
        createSourceRecord(
          inputFor({ context: { [field]: "source-claim" } }),
        ),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === DomainErrorCode.INVALID_SOURCE_RECORD &&
        error.details.field === `context.${field}`,
      field,
    );
  }

  const record = createSourceRecord(
    inputFor({
      content: {
        polarity: "source-authored",
        confidence: 0.91,
        authority: "source-field",
      },
    }),
  );
  assert.deepEqual(record.content, {
    polarity: "source-authored",
    confidence: 0.91,
    authority: "source-field",
  });
});

test("canonicalizes JSON with deterministic object-key ordering", () => {
  assert.equal(
    canonicalizeJson({ z: [{ b: 2, a: 1 }, 3], a: { b: true, a: null } }),
    '{"a":{"a":null,"b":true},"z":[{"a":1,"b":2},3]}',
  );
});

test("encodes source revision keys as collision-safe canonical JSON arrays", () => {
  const first = createSourceRecord(
    inputFor({
      source: { system: "git|github.example", instance: "acme" },
      sourceId: "commit:abc",
      revisionId: "def",
    }),
  );
  const second = createSourceRecord(
    inputFor({
      source: { system: "git", instance: "github.example|acme" },
      sourceId: "commit:abc",
      revisionId: "def",
    }),
  );

  assert.equal(
    sourceRevisionKey(first),
    '["git|github.example","acme","commit:abc","def"]',
  );
  assert.notEqual(sourceRevisionKey(first), sourceRevisionKey(second));
});
