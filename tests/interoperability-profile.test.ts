import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  canonicalizeJson,
  deserializePortableCognitionRecord,
  deserializeSourceRecord,
  DomainError,
  ingestSourceRecordText,
  serializePortableCognitionRecord,
  serializeSourceRecord,
  validatePortableCognitionRecord,
  validateSourceRecord,
} from "../src/index.ts";
import type { JsonValue, PortableCognitionRecord, SourceRecord } from "../src/index.ts";

const profileUrl = new URL(
  "../spec/interoperability/0.1.0/profile.json",
  import.meta.url,
);
const sourceRecordsUrl = new URL(
  "../spec/interoperability/0.1.0/source-records.jsonl",
  import.meta.url,
);
const portableCognitionUrl = new URL(
  "../spec/interoperability/0.1.0/portable-cognition.jsonl",
  import.meta.url,
);
const errorCasesUrl = new URL(
  "../spec/interoperability/0.1.0/error-cases.jsonl",
  import.meta.url,
);

function parseWithoutDuplicateObjectKeys(text: string): unknown {
  let index = 0;

  function skipWhitespace(): void {
    while (/\s/u.test(text[index] ?? "")) {
      index += 1;
    }
  }

  function readString(): string {
    const start = index;
    assert.equal(text[index], '"', "Expected a JSON string.");
    index += 1;
    while (index < text.length) {
      const character = text[index];
      if (character === "\\") {
        index += 2;
      } else if (character === '"') {
        index += 1;
        return JSON.parse(text.slice(start, index)) as string;
      } else {
        index += 1;
      }
    }
    throw new SyntaxError("Unterminated JSON string.");
  }

  function scanValue(): void {
    skipWhitespace();
    if (text[index] === "{") {
      index += 1;
      const keys = new Set<string>();
      skipWhitespace();
      if (text[index] === "}") {
        index += 1;
        return;
      }
      while (true) {
        skipWhitespace();
        const key = readString();
        assert.equal(keys.has(key), false, `Duplicate JSON object key: ${key}`);
        keys.add(key);
        skipWhitespace();
        assert.equal(text[index], ":", "Expected a JSON object colon.");
        index += 1;
        scanValue();
        skipWhitespace();
        if (text[index] === "}") {
          index += 1;
          return;
        }
        assert.equal(text[index], ",", "Expected a JSON object separator.");
        index += 1;
      }
    }
    if (text[index] === "[") {
      index += 1;
      skipWhitespace();
      if (text[index] === "]") {
        index += 1;
        return;
      }
      while (true) {
        scanValue();
        skipWhitespace();
        if (text[index] === "]") {
          index += 1;
          return;
        }
        assert.equal(text[index], ",", "Expected a JSON array separator.");
        index += 1;
      }
    }
    if (text[index] === '"') {
      readString();
      return;
    }
    while (index < text.length && !/[\s,\]}]/u.test(text[index] ?? "")) {
      index += 1;
    }
  }

  scanValue();
  skipWhitespace();
  assert.equal(index, text.length, "Unexpected trailing JSON text.");
  return JSON.parse(text);
}

function readJson(url: URL): unknown {
  return parseWithoutDuplicateObjectKeys(readFileSync(url, "utf8"));
}

function readJsonLines(url: URL): readonly unknown[] {
  return readFileSync(url, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map(parseWithoutDuplicateObjectKeys);
}

function assertExactKeys(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value));
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort());
}

function assertDeepFrozen(value: unknown): void {
  if (value === null || typeof value !== "object") {
    return;
  }
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) {
    assertDeepFrozen(child);
  }
}

function canonicalValue(value: JsonValue): string {
  return canonicalizeJson(value);
}

function domainErrorCode(error: unknown): string | undefined {
  return error instanceof DomainError ? error.code : undefined;
}

test("rejects duplicate JSON object keys before fixture parsing", () => {
  assert.throws(
    () => parseWithoutDuplicateObjectKeys('{"fixture":1,"fixture":2}'),
    /Duplicate JSON object key: fixture/u,
  );
});

test("defines a closed versioned interoperability profile", () => {
  const profile = readJson(profileUrl);
  assertExactKeys(profile, [
    "connectors",
    "extensionPolicy",
    "fixtures",
    "nonInference",
    "owner",
    "portableCognitionSchemaVersion",
    "profileVersion",
    "semanticEquivalence",
    "sourceRecordSchemaVersion",
  ]);
  assert.equal(profile.profileVersion, "0.1.0");
  assert.equal(profile.owner, "collective-cognition-sdk-maintainers");
  assert.equal(profile.sourceRecordSchemaVersion, "0.1.0");
  assert.equal(profile.portableCognitionSchemaVersion, "0.1.0");
  assert.deepEqual(profile.connectors, ["git-repository/1", "teammem-event-ledger/1"]);
  assert.deepEqual(profile.fixtures, {
    sourceRecords: "source-records.jsonl",
    portableCognition: "portable-cognition.jsonl",
    errorCases: "error-cases.jsonl",
  });
  assert.deepEqual(profile.semanticEquivalence, [
    "normalized-validated-contract-values",
    "canonical-json-equality",
    "ignore-member-order-formatting-and-object-identity",
  ]);
  assert.equal(profile.extensionPolicy, "preserve-or-reject-never-drop");
  assert.deepEqual(profile.nonInference, [
    "decisions",
    "principles",
    "truth",
    "confidence",
    "readiness",
    "belief",
    "authorization",
  ]);
});

test("fixtures retain source-local ingestion meaning and canonical source round trips", () => {
  const sharedCommitId = "0123456789abcdef0123456789abcdef01234567";
  const sourceText = readFileSync(sourceRecordsUrl, "utf8");
  const parsedRecords = readJsonLines(sourceRecordsUrl);
  assert.equal(parsedRecords.length, 5);

  const normalizedRecords = parsedRecords.map((record) =>
    deserializeSourceRecord(JSON.stringify(record)),
  );
  for (const record of normalizedRecords) {
    assertExactKeys(record, [
      ...(record.source.system === "teammem-event-ledger" ? ["actorId"] : []),
      "capturedAt",
      "content",
      "id",
      "mediaType",
      "observedAt",
      "revisionId",
      "schemaVersion",
      "source",
      "sourceId",
    ]);
    assertExactKeys(record.source, ["instance", "system"]);
    assertDeepFrozen(record);
  }

  assert.deepEqual(
    new Set(normalizedRecords.map((record) => record.source.system)),
    new Set(["git-repository", "teammem-event-ledger"]),
  );
  const acceptedTeamMemoryRecord = normalizedRecords[0];
  const crossSourceIdentityRecord = normalizedRecords[4];
  assert.ok(acceptedTeamMemoryRecord);
  assert.ok(crossSourceIdentityRecord);
  assert.equal(
    acceptedTeamMemoryRecord.sourceId,
    `commit:${sharedCommitId}`,
  );
  assert.equal(acceptedTeamMemoryRecord.revisionId, sharedCommitId);
  assert.equal(acceptedTeamMemoryRecord.actorId, "person:commit");
  assert.equal(
    acceptedTeamMemoryRecord.id,
    `source-record:teammem-event-ledger:fictional-ledger.example.invalid:commit:${sharedCommitId}:${sharedCommitId}`,
  );
  assert.deepEqual(acceptedTeamMemoryRecord.content, {
    project: null,
    kind: "note",
    summary: "Fictional ledger event.",
    refs: [],
  });
  assert.equal(crossSourceIdentityRecord.source.system, "git-repository");
  assert.notEqual(
    crossSourceIdentityRecord.source.instance,
    acceptedTeamMemoryRecord.source.instance,
  );
  assert.equal(
    crossSourceIdentityRecord.sourceId,
    acceptedTeamMemoryRecord.sourceId,
  );
  assert.equal(
    crossSourceIdentityRecord.revisionId,
    acceptedTeamMemoryRecord.revisionId,
  );
  assert.equal(crossSourceIdentityRecord.sourceId, `commit:${sharedCommitId}`);
  assert.equal(crossSourceIdentityRecord.revisionId, sharedCommitId);

  const gitRecords = normalizedRecords.filter(
    (record) => record.source.system === "git-repository",
  );
  assert.equal(gitRecords.length, 2);
  for (const record of gitRecords) {
    assert.match(record.revisionId, /^[0-9a-f]{40}$/u);
    assert.equal(record.sourceId, `commit:${record.revisionId}`);
    assert.equal(
      record.id,
      `source-record:git-repository:fictional-repository.example.invalid:${record.revisionId}`,
    );
    assertExactKeys(record.content, [
      "author",
      "authoredAt",
      "commitId",
      "committedAt",
      "parents",
      "summary",
    ]);
    assert.equal(record.content.commitId, record.revisionId);
  }

  const result = ingestSourceRecordText(sourceText, {
    format: "jsonl",
    mode: "collect-all",
  });
  assert.deepEqual(result.items.map((item) => item.status), [
    "accepted",
    "duplicate",
    "rejected",
    "accepted",
    "accepted",
  ]);
  assert.equal(result.acceptedRecords.length, 3);
  const collision = result.items[2];
  assert.equal(collision?.status, "rejected");
  if (collision?.status === "rejected") {
    assert.equal(collision.error.code, "SOURCE_REVISION_COLLISION");
  }
  const crossSourceIdentityOutcome = result.items[4];
  assert.equal(crossSourceIdentityOutcome?.status, "accepted");

  const acceptedBySystem = new Set(
    result.acceptedRecords.map((record) => record.source.system),
  );
  assert.deepEqual(acceptedBySystem, new Set(["git-repository", "teammem-event-ledger"]));
  for (const record of result.acceptedRecords) {
    const restored = deserializeSourceRecord(serializeSourceRecord(record));
    assert.equal(
      canonicalValue(restored as unknown as JsonValue),
      canonicalValue(record as unknown as JsonValue),
    );
    assertDeepFrozen(restored);
  }
});

test("fixtures preserve portable cognition semantics without inferred decisions or principles", () => {
  const records = readJsonLines(portableCognitionUrl).map((record) =>
    deserializePortableCognitionRecord(JSON.stringify(record)),
  );
  assert.equal(records.length, 5);
  for (const record of records) {
    assertExactKeys(record, ["payload", "recordType", "schemaVersion"]);
    assertDeepFrozen(record);
  }

  const objects = records.filter(
    (record): record is PortableCognitionRecord<"cognitive-object"> =>
      record.recordType === "cognitive-object",
  );
  const events = records.filter(
    (record): record is PortableCognitionRecord<"cognition-event"> =>
      record.recordType === "cognition-event",
  );
  assert.equal(events.length, 1);
  assert.ok(objects.some((record) => record.payload.type === "goal"));
  assert.ok(
    objects.some(
      (record) =>
        record.payload.type === "hypothesis" && record.payload.version === 1,
    ),
  );
  const transitionedHypothesis = objects.find(
    (record) =>
      record.payload.type === "hypothesis" && record.payload.version === 2,
  );
  assert.ok(transitionedHypothesis);
  assert.equal(transitionedHypothesis.payload.state, "under_review");
  assert.equal(events[0]?.payload.objectId, transitionedHypothesis.payload.id);
  assert.equal(events[0]?.payload.objectVersion, transitionedHypothesis.payload.version);

  const evidence = objects.find((record) => record.payload.type === "evidence");
  assert.ok(evidence);
  assert.deepEqual(
    new Set(evidence.payload.provenance.map((entry) => entry.source)),
    new Set(["git-repository", "teammem-event-ledger"]),
  );
  assert.ok(Object.keys(evidence.payload.attribution).length === 3);
  assert.ok(evidence.payload.relationships.length > 0);
  assert.equal(typeof evidence.payload.createdAt, "string");
  assert.equal(typeof evidence.payload.updatedAt, "string");
  assert.deepEqual(evidence.payload.extensions, {
    "example.invalid/connector-note": { preservation: "opaque" },
  });
  assert.equal(
    objects.some(
      (record) =>
        record.payload.type === "decision" || record.payload.type === "principle",
    ),
    false,
  );

  for (const record of records) {
    const restored = deserializePortableCognitionRecord(
      serializePortableCognitionRecord(record),
    );
    assert.equal(
      canonicalValue(restored as unknown as JsonValue),
      canonicalValue(record as unknown as JsonValue),
    );
  }
});

test("invalid extension fixtures declare the stable source and portable error codes", () => {
  const errorCases = readJsonLines(errorCasesUrl);
  assert.equal(errorCases.length, 2);
  for (const fixture of errorCases) {
    assertExactKeys(fixture, ["description", "expectedCode", "record", "recordKind"]);
    assert.equal(typeof fixture.description, "string");
    assert.ok(fixture.record !== null && typeof fixture.record === "object");
    assert.ok(
      fixture.recordKind === "source-record" ||
        fixture.recordKind === "portable-cognition-record",
    );
    assert.ok(
      fixture.expectedCode === "INVALID_SOURCE_RECORD" ||
        fixture.expectedCode === "INVALID_PORTABLE_COGNITION_RECORD",
    );

    if (fixture.recordKind === "source-record") {
      assert.equal(fixture.expectedCode, "INVALID_SOURCE_RECORD");
      assert.throws(
        () => validateSourceRecord(fixture.record),
        (error) => domainErrorCode(error) === fixture.expectedCode,
      );
    } else {
      assert.equal(fixture.expectedCode, "INVALID_PORTABLE_COGNITION_RECORD");
      assert.throws(
        () => validatePortableCognitionRecord(fixture.record),
        (error) => domainErrorCode(error) === fixture.expectedCode,
      );
    }
  }
});
